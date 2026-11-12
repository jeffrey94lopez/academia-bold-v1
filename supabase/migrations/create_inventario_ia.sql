-- Purgador con IA del conversor de inventario: caché, registro de uso y la RPC que
-- mide cuánto cuesta y cuánto se acepta lo que propone.
--
-- inventario_purga_cache  respuestas de Gemini por cuenta (clave = sha256 de account_id +
--                         modo + listas + modelo + versión de prompt). Retención 90 días:
--                         el workflow n8n borra lo más viejo en cada llamada.
-- inventario_ia_uso       una fila por llamada (incluidas las que salen de caché), solo
--                         números: tokens de usageMetadata, conteos y duración. Nunca texto
--                         del cliente.
--
-- Las dos las escribe y lee SOLO n8n con service_role: RLS activado y SIN políticas, y
-- sin privilegios para anon/authenticated (la anon key es pública). El admin no las lee
-- directo: pasa por analytics_herramientas_ia (security definer), que devuelve agregados.
--
-- Precio: app_settings.inventario_ia_precio = '{"entrada_por_millon": 0.3, "salida_por_millon": 2.5}'
-- (USD por millón de tokens). No se siembra: lo pone el usuario con el precio vigente de
-- Vertex. Sin precio (o mal escrito) → costo_* null, nunca un error.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase (es idempotente).

-- ── Tablas ─────────────────────────────────────────────────────────────────
create table if not exists public.inventario_purga_cache (
  clave          text primary key,
  account_id     text not null,
  modo           text,
  modelo         text,
  prompt_version text,
  resultado      jsonb not null,
  creado         timestamptz default now()
);

create index if not exists idx_inventario_purga_cache_creado
  on public.inventario_purga_cache (creado);

create table if not exists public.inventario_ia_uso (
  id             bigint generated always as identity primary key,
  creado         timestamptz default now(),
  env            text not null,
  run_id         text,
  account_id     text,
  modo           text,
  modelo         text,
  prompt_version text,
  tokens_entrada int,
  tokens_salida  int,
  cache_hit      boolean,
  n_entrada      int,
  n_salida       int,
  duracion_ms    int
);

create index if not exists idx_inventario_ia_uso_env_creado
  on public.inventario_ia_uso (env, creado);

-- RLS sin políticas: nadie fuera de service_role (que salta RLS) lee ni escribe.
alter table public.inventario_purga_cache enable row level security;
alter table public.inventario_ia_uso      enable row level security;

revoke all on table public.inventario_purga_cache from anon, authenticated;
revoke all on table public.inventario_ia_uso      from anon, authenticated;

-- ── RPC ────────────────────────────────────────────────────────────────────
-- Definiciones:
--   llamadas              filas de inventario_ia_uso del env en el rango (con caché incluida).
--   cache_pct             % de esas llamadas que salieron de caché (0 si no hubo llamadas).
--   costo_usd             tokens × precio por millón. null si no hay precio válido.
--   costo_por_conversion  costo_usd / run_id distintos en inventario_ia_uso (incluye las que
--                         salieron de caché a $0: es el costo real promedio).
--   costo_por_descarga    costo_usd / corridas del conversor con tool_complete en el rango.
--   decisiones            por etapa, la ÚLTIMA decisión tool_ia de cada (run_id, etapa).
-- Las divisiones entre cero devuelven null.
create or replace function public.analytics_herramientas_ia(
  p_from timestamptz,
  p_to   timestamptz,
  p_env  text default 'prod'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  -- Precio con la misma mezcla que mergeSettings (js/env.js): la fila del env pisa la de prod.
  precio_txt as (
    select coalesce(
      (select value from app_settings where key = 'inventario_ia_precio' and env = p_env),
      (select value from app_settings where key = 'inventario_ia_precio' and env = 'prod')
    ) as v
  ),
  -- Cast seguro: app_settings es texto libre; un valor mal escrito ('abc', JSON roto,
  -- números gigantes) no puede romper la RPC. Solo se acepta un número decimal acotado.
  precio as (
    select
      case when e ~ '^[0-9]{1,6}(\.[0-9]{1,12})?$' then e::numeric end as entrada,
      case when s ~ '^[0-9]{1,6}(\.[0-9]{1,12})?$' then s::numeric end as salida
    from (
      select substring(v from '"entrada_por_millon"\s*:\s*"?([0-9.]+)"?\s*[,}]') as e,
             substring(v from '"salida_por_millon"\s*:\s*"?([0-9.]+)"?\s*[,}]')  as s
        from precio_txt
    ) x
  ),
  uso as (
    select run_id, cache_hit,
           coalesce(tokens_entrada, 0)::numeric as te,
           coalesce(tokens_salida, 0)::numeric  as ts
      from inventario_ia_uso
     where env = p_env
       and creado >= p_from and creado <= p_to
  ),
  totales as (
    select count(*) as llamadas,
           count(*) filter (where cache_hit) as hits,
           coalesce(sum(te), 0) as tokens_entrada,
           coalesce(sum(ts), 0) as tokens_salida,
           count(distinct run_id) as conversiones
      from uso
  ),
  costo as (
    select case when p.entrada is not null and p.salida is not null then
             round((t.tokens_entrada * p.entrada + t.tokens_salida * p.salida) / 1000000, 6)
           end as usd
      from totales t cross join precio p
  ),
  descargas as (
    select count(distinct payload->>'run_id') as n
      from analytics_events
     where event_type = 'tool_complete'
       and created_at >= p_from and created_at <= p_to
       and coalesce(payload->>'env', 'prod') = p_env
       and payload->>'tool' = 'inventario'
       and payload->>'run_id' is not null
  ),
  -- Última decisión por (run_id, etapa); solo etapas y decisiones conocidas.
  ultimas as (
    select distinct on (payload->>'run_id', payload->>'etapa')
           payload->>'etapa' as etapa, payload->>'decision' as decision
      from analytics_events
     where event_type = 'tool_ia'
       and created_at >= p_from and created_at <= p_to
       and coalesce(payload->>'env', 'prod') = p_env
       and payload->>'tool' = 'inventario'
       and payload->>'run_id' is not null
       and payload->>'etapa' in ('categorias', 'unidades', 'simplificar')
     order by payload->>'run_id', payload->>'etapa', created_at desc, id desc
  ),
  decisiones as (
    select jsonb_object_agg(et.etapa, jsonb_build_object(
             'acepto',     (select count(*) from ultimas u where u.etapa = et.etapa and u.decision = 'acepto'),
             'corrigio',   (select count(*) from ultimas u where u.etapa = et.etapa and u.decision = 'corrigio'),
             'originales', (select count(*) from ultimas u where u.etapa = et.etapa and u.decision = 'originales'),
             'fallo',      (select count(*) from ultimas u where u.etapa = et.etapa and u.decision = 'fallo')
           )) as d
      from (values ('categorias'), ('unidades'), ('simplificar')) as et(etapa)
  )
  select jsonb_build_object(
    'llamadas',       t.llamadas,
    'cache_pct',      case when t.llamadas > 0 then round(100.0 * t.hits / t.llamadas, 1) else 0 end,
    'tokens_entrada', t.tokens_entrada,
    'tokens_salida',  t.tokens_salida,
    'costo_usd',      c.usd,
    'costo_por_conversion', case when t.conversiones > 0 then round(c.usd / t.conversiones, 6) end,
    'costo_por_descarga',   case when dl.n > 0 then round(c.usd / dl.n, 6) end,
    'decisiones',     d.d
  )
  from totales t, costo c, descargas dl, decisiones d;
$$;

revoke execute on function public.analytics_herramientas_ia(timestamptz, timestamptz, text) from public, anon;
grant  execute on function public.analytics_herramientas_ia(timestamptz, timestamptz, text) to authenticated;

-- ── app_settings (sandbox) ─────────────────────────────────────────────────
-- Arranca apagada: para el purgador "clave ausente" también es apagado. El precio
-- (inventario_ia_precio) no se siembra; lo pone el usuario.
insert into public.app_settings (key, value, env) values
  ('inventario_ia_activa',        'false',            'sandbox'),
  ('inventario_purga_model',      'gemini-2.5-flash', 'sandbox'),
  ('inventario_ia_prompt_version', '1',               'sandbox')
on conflict do nothing;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Sin uso todavía debe devolver llamadas 0, cache_pct 0, costo_usd null (sin precio) y
-- decisiones en cero para las tres etapas:
-- select public.analytics_herramientas_ia(now() - interval '30 days', now(), 'sandbox');
