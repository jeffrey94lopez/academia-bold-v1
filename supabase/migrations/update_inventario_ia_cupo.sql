-- Topes diarios del purgador con IA: las previews de Vercel son públicas, así que estos
-- topes son la defensa contra abuso/costo. Requiere create_inventario_ia.sql aplicada antes.
--
-- inventario_ia_uso.ip_hash  HMAC-SHA256(N8N_API_KEY, ip) en hex que calcula /api/purgar.
--                            Nunca se guarda la IP cruda.
-- inventario_ia_cupo(env, ip_hash)
--                            { global, ip }: llamadas que de verdad fueron a Gemini
--                            (cache_hit = false, incluidas fallas/timeouts: también cuestan)
--                            en las últimas 24 h de ese env; ip = 0 si p_ip_hash es null.
--                            Solo service_role (n8n) la ejecuta.
-- app_settings               inventario_ia_tope_diario = '500' (global/día) e
--                            inventario_ia_tope_ip = '30' (por IP/día), en sandbox y prod.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase (es idempotente).

alter table public.inventario_ia_uso add column if not exists ip_hash text;

create index if not exists idx_inventario_ia_uso_env_ip_creado
  on public.inventario_ia_uso (env, ip_hash, creado);

create or replace function public.inventario_ia_cupo(p_env text, p_ip_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'global', (select count(*)::int from inventario_ia_uso
                where env = p_env and cache_hit = false
                  and creado >= now() - interval '24 hours'),
    'ip', case when p_ip_hash is null then 0 else
            (select count(*)::int from inventario_ia_uso
              where env = p_env and ip_hash = p_ip_hash and cache_hit = false
                and creado >= now() - interval '24 hours')
          end
  );
$$;

revoke execute on function public.inventario_ia_cupo(text, text) from public, anon, authenticated;
grant  execute on function public.inventario_ia_cupo(text, text) to service_role;

insert into public.app_settings (key, value, env) values
  ('inventario_ia_tope_diario', '500', 'sandbox'),
  ('inventario_ia_tope_ip',     '30',  'sandbox'),
  ('inventario_ia_tope_diario', '500', 'prod'),
  ('inventario_ia_tope_ip',     '30',  'prod')
on conflict do nothing;

-- ── Verificación ───────────────────────────────────────────────────────────
-- select public.inventario_ia_cupo('sandbox', null);   -- {"ip": 0, "global": <n>}
