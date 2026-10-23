-- p_origin en analytics_bot_conversations: permite filtrar el explorador de
-- BolBot por "Solo recorrido guiado" y devuelve `origin` en cada fila (para el
-- badge "Recorrido").
--
-- Por qué: las conversaciones que se abren DENTRO del recorrido guiado son de
-- alguien practicando, que todavía no usa Bold POS. Sin poder separarlas no se
-- puede ver qué pregunta la gente mientras practica, y tampoco aislarlas de las
-- de comercios en operación. La columna la agrega
-- add_origin_bodi_conversations.sql (null = portal).
--
-- Se filtra en el servidor y no en el cliente por lo mismo que p_no_info:
-- p_limit corta ANTES, así que filtrar la página ya traída perdería filas.
--
-- Todo lo demás es idéntico a update_analytics_bot_conversations_no_info.sql
-- (columnas, filtros, lifecycle derivado): solo se suma el filtro de origen y la
-- columna `origin` en el select.
--
-- Agrega un parámetro al final (con default), así que las llamadas existentes
-- siguen funcionando. El admin manda p_origin SOLO cuando el filtro está puesto
-- (js/analytics-api.js), así que el admin desplegado sigue andando antes y
-- después de esta migración. Cambia la firma → hay que dropear la de 10 args.
--
-- ORDEN: DESPUÉS de add_origin_bodi_conversations.sql — la función lee la
-- columna `origin` y, sin ella, el create falla. Ejecutar UNA sola vez en el
-- SQL Editor del proyecto Supabase (base compartida por sandbox y producción).

drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100,
  p_lifecycle text default null,
  p_no_info   boolean default null,
  p_origin    text default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      bot_no_info, origin,
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
      and (p_origin   is null or origin = p_origin)
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
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text) to authenticated;

-- ── Verificación ───────────────────────────────────────────────────────────
-- 1) Queda UNA sola versión de la función (11 args).
select oid::regprocedure from pg_proc where proname = 'analytics_bot_conversations';
-- 2) Las filas traen `origin` y el filtro funciona (como admin o en el Editor):
-- select public.analytics_bot_conversations(now() - interval '30 days', now(), p_origin => 'onboarding');
