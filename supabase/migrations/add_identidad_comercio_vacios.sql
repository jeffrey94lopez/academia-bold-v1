-- Identidad del comercio en la bandeja de vacíos.
--
-- Por qué: un incidente sin comercio no se puede atender. "El datáfono no
-- reconoce la clave" es inútil sin saber de quién; y la diferencia entre un
-- incidente reportado por 5 comercios y uno reportado 5 veces por el mismo es
-- justamente lo que hace que contarlos sirva.
--
-- Qué había y qué no: `bodi_conversations.account_id` se guarda desde
-- add_cruce_vertical.sql. El NOMBRE del comercio llega por postMessage desde
-- Bold (js/bold-context.js) y se usa para saludar, pero nunca se escribió. Se
-- agrega acá, y por eso solo va a estar en conversaciones NUEVAS: las 24
-- solicitudes/incidentes de hoy tienen id y no nombre.
--
-- El valor viene de un origen externo (el iframe de Bold). Llega ya acotado y
-- sin control chars por sanear() de bold-context.js, y el panel lo escapa al
-- pintarlo; esta columna no agrega confianza, solo lo guarda.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

alter table public.bodi_conversations
  add column if not exists business_name text;

-- Para "¿cuántos comercios distintos reportaron esto?" sin escanear la tabla.
create index if not exists idx_bodi_conversations_cuenta
  on public.bodi_conversations (account_id) where account_id is not null;

-- ── Lista: cuántos COMERCIOS distintos, no solo cuántas preguntas ───────────
drop function if exists public.analytics_bot_vacios(text, text, text, int);
create or replace function public.analytics_bot_vacios(
  p_estado    text default 'pendiente',
  p_vertical  text default null,
  p_categoria text default null,
  p_limit     int  default 100
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.preguntas_total desc, r.ultima_vez desc), '[]'::jsonb)
  from (
    select v.id, v.titulo, v.categoria, v.vertical, v.plataforma, v.estado,
           v.motivo_descarte, v.nota_descarte, v.leccion_id, l.titulo as leccion_titulo,
           v.preguntas_total, v.primera_vez, v.ultima_vez, v.resuelto_at, v.resuelto_por,
           (select count(*) from bot_vacios_preguntas p
             where p.vacio_id = v.id
               and v.resuelto_at is not null
               and p.created_at > v.resuelto_at) as preguntas_desde_cierre,
           -- Comercios DISTINTOS. Un incidente que reportan 5 comercios es un
           -- problema de plataforma; el mismo comercio 5 veces es un caso.
           (select count(distinct c.account_id)
              from bot_vacios_preguntas p
              join bodi_conversations c on c.id = p.conversation_id
             where p.vacio_id = v.id and c.account_id is not null) as comercios
      from bot_vacios v
      left join lecciones l on l.id = v.leccion_id
     where (p_estado    is null or v.estado = p_estado)
       and (p_vertical  is null or v.vertical = p_vertical)
       and (p_categoria is null or v.categoria = p_categoria)
     order by v.preguntas_total desc, v.ultima_vez desc
     limit p_limit
  ) r;
$$;
revoke execute on function public.analytics_bot_vacios(text, text, text, int) from public, anon;
grant  execute on function public.analytics_bot_vacios(text, text, text, int) to authenticated;

-- ── Detalle: de qué comercio salió CADA pregunta ────────────────────────────
drop function if exists public.analytics_bot_vacio_detalle(uuid);
create or replace function public.analytics_bot_vacio_detalle(p_vacio_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'vacio', (select to_jsonb(v) from bot_vacios v where v.id = p_vacio_id),
    'preguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'texto', p.texto,
               'conversation_id', p.conversation_id, 'created_at', p.created_at,
               'account_id', c.account_id,
               'business_name', c.business_name,
               'mensajes', coalesce(c.messages, '[]'::jsonb),
               'resumen', c.summary)
             order by p.created_at desc)
        from bot_vacios_preguntas p
        left join bodi_conversations c on c.id = p.conversation_id
       where p.vacio_id = p_vacio_id), '[]'::jsonb)
  );
$$;
revoke execute on function public.analytics_bot_vacio_detalle(uuid) from public, anon;
grant  execute on function public.analytics_bot_vacio_detalle(uuid) to authenticated;
