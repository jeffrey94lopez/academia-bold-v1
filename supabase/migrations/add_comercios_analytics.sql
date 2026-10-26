-- Pestaña "Chats Comercios": quién escribe, cuánto, y poder abrir sus chats.
--
-- Tres cosas:
--   1. `user_name` en bodi_conversations. Bold ya manda el nombre del usuario
--      por postMessage (js/bold-context.js) y el bot lo usa para saludar, pero
--      nunca se guardaba. Se guarda SOLO el nombre, no el email: el nombre
--      alcanza para saber quién escribió, y el email convertiría cada
--      conversación en un dato de contacto personal que nadie pidió.
--   2. `p_account_id` en analytics_bot_conversations, para desplegar los chats
--      de un comercio.
--   3. analytics_bot_comercios: la lista agrupada por cuenta.
--
-- Correr DESPUÉS de add_comercio_analytics_conversations.sql, del que esta
-- copia el cuerpo de analytics_bot_conversations.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

alter table public.bodi_conversations
  add column if not exists user_name text;

-- ── analytics_bot_conversations: filtrar por comercio y devolver el usuario ──
-- COPIA EXACTA de add_comercio_analytics_conversations.sql con `user_name` en
-- el select y `p_account_id` al final. Cambia la firma → hay que dropear la
-- versión de 11 args.

drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text);
create or replace function public.analytics_bot_conversations(
  p_from       timestamptz,
  p_to         timestamptz,
  p_status     text default null,
  p_sentiment  text default null,
  p_support    boolean default null,
  p_category   text default null,
  p_search     text default null,
  p_limit      int default 100,
  p_lifecycle  text default null,
  p_no_info    boolean default null,
  p_vertical   text default null,
  p_account_id text default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      bot_no_info, vertical, account_id, business_name, user_name,
      messages, lessons_used, summary,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status,
      case when support_redirected   then 'escalada'
           when status = 'completed' then 'cerrada_cliente'
           when status = 'abandoned' then 'abandonada'
           else 'en_curso' end as lifecycle,
      (select m->>'content'
         from jsonb_array_elements(messages) m
        where m->>'role' = 'user'
        limit 1) as first_user_msg
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and (p_sentiment is null or sentiment = p_sentiment)
      and (p_support  is null or coalesce(support_redirected, false) = p_support)
      and (p_category is null or coalesce(category, topic, 'Sin categoría') = p_category)
      and (p_search   is null or messages::text ilike '%' || p_search || '%')
      and (p_no_info  is null or bot_no_info = p_no_info)
      and (p_account_id is null or account_id = p_account_id)
      -- 'sin_vertical' es el mismo bucket que arma by_vertical en el resumen:
      -- si el recuadro lo muestra, el explorador tiene que saber filtrarlo.
      and (p_vertical is null
           or (p_vertical = 'sin_vertical' and nullif(btrim(coalesce(vertical, '')), '') is null)
           or vertical = p_vertical)
      and (p_status   is null or coalesce(resolution_status,
             case when resolved is true then 'resuelta'
                  when resolved is false then 'no_resuelta' end) = p_status)
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (
    select * from res
     where p_lifecycle is null or lifecycle = p_lifecycle
     order by started_at desc
     limit p_limit
  ) r;
$$;
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text, text) to authenticated;

-- ── La lista de comercios ───────────────────────────────────────────────────
-- Solo cuentas identificadas: una fila "sin cuenta" que junte conversaciones
-- de comercios distintos no es un comercio, y desplegarla mostraría chats de
-- gente que no tiene nada que ver entre sí. Cuántas quedan afuera se ve en el
-- resumen de arriba (bucket sin_vertical) y en el total del rango.

drop function if exists public.analytics_bot_comercios(timestamptz, timestamptz, int);
create or replace function public.analytics_bot_comercios(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 200
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      account_id, business_name, user_name, vertical, started_at, bot_no_info,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and nullif(btrim(coalesce(account_id, '')), '') is not null
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.total desc, r.ultima desc), '[]'::jsonb)
  from (
    select
      account_id,
      -- El nombre MÁS RECIENTE que mandó Bold para esa cuenta: un comercio
      -- puede cambiar de nombre, y quedarse con el viejo confundiría. Las
      -- conversaciones anteriores al 2026-10-26 no traen ninguno.
      (array_remove(array_agg(business_name order by started_at desc), null))[1] as business_name,
      (array_remove(array_agg(vertical      order by started_at desc), null))[1] as vertical,
      count(*)                                            as total,
      count(*) filter (where eff_status = 'resuelta')     as resueltas,
      count(*) filter (where eff_status = 'no_resuelta')  as no_resueltas,
      count(*) filter (where bot_no_info)                 as sin_info,
      count(distinct user_name)                           as usuarios,
      min(started_at)                                     as primera,
      max(started_at)                                     as ultima
    from res
    group by account_id
    order by count(*) desc, max(started_at) desc
    limit p_limit
  ) r;
$$;
revoke execute on function public.analytics_bot_comercios(timestamptz, timestamptz, int) from public, anon;
grant  execute on function public.analytics_bot_comercios(timestamptz, timestamptz, int) to authenticated;
