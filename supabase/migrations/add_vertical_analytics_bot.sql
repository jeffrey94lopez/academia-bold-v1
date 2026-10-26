-- Vertical en las analíticas del bot: dos recuadros (retail / restaurantes)
-- con su barra de resueltas vs no resueltas, y la vertical en cada fila del
-- explorador para pintar el badge.
--
-- Ninguna de las dos RPCs sabía hoy qué es una vertical, aunque la columna
-- existe en bodi_conversations desde add_cruce_vertical.sql.
--
-- OJO con la cobertura: `vertical` solo se escribe cuando Bold manda el
-- contexto por postMessage (js/assistant.js la escribe en el mismo bloque que
-- account_id, que al 2026-10-26 cubre el 55-65% de las conversaciones). Por eso
-- el agregado incluye un bucket `sin_vertical`: sin él, los dos recuadros no
-- sumarían el total y parecería que faltan conversaciones.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

-- ── 1. El resumen aprende a contar por vertical ─────────────────────────────
-- COPIA EXACTA de update_analytics_bot_summary_friccion.sql, que es la
-- VIGENTE, con dos agregados: `vertical` en el CTE y la clave `by_vertical`.
-- Nada de lo que ya devolvía cambia — by_category y heatmap quedan tal cual,
-- que es lo que leen "Qué atender ahora" y el mapa de calor.

drop function if exists public.analytics_bot_summary(timestamptz, timestamptz);
create or replace function public.analytics_bot_summary(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      support_redirected,
      sentiment,
      status,
      bot_no_info,
      vertical,
      coalesce(bot_asked_clarification, false) as asked_clarification,
      coalesce(support_redirected, false) as escalo,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(
        resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end
      ) as eff_status,
      case when support_redirected   then 'escalada'
           when status = 'completed' then 'cerrada_cliente'
           when status = 'abandoned' then 'abandonada'
           else 'en_curso' end as lifecycle,
      started_at
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total',       (select count(*) from res),
      'resolved',    (select count(*) from res where eff_status = 'resuelta'),
      'unresolved',  (select count(*) from res where eff_status = 'no_resuelta'),
      'ambiguous',   (select count(*) from res where eff_status = 'ambigua'),
      'resolved_pct', (
        select round(100.0 * count(*) filter (where eff_status = 'resuelta')
                      / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0))
        from res
      ),
      'abandoned',   (select count(*) from res where status = 'abandoned'),
      'support',     (select count(*) from res where support_redirected),
      'resolved_without_support_pct', (
        select round(100.0 * count(*) filter (where not coalesce(support_redirected, false))
                      / nullif(count(*), 0))
        from res
      ),
      'lifecycle', jsonb_build_object(
        'cerrada_cliente', (select count(*) from res where lifecycle = 'cerrada_cliente'),
        'abandonada',      (select count(*) from res where lifecycle = 'abandonada'),
        'escalada',        (select count(*) from res where lifecycle = 'escalada'),
        'en_curso',        (select count(*) from res where lifecycle = 'en_curso')
      ),
      -- Fricción: la conversación en la que el bot NO pudo resolver por sí mismo,
      -- sea porque no tenía contenido (no_info) o porque derivó a soporte. Es
      -- señal medida, no inferida por un LLM. Los buckets son excluyentes para
      -- poder apilarlos: no_info gana sobre la derivación a soporte.
      'friction', jsonb_build_object(
        'total',   (select count(*) from res),
        'con',     (select count(*) from res where bot_no_info or escalo),
        'pct',     (
          select round(100.0 * count(*) filter (where bot_no_info or escalo) / nullif(count(*), 0))
          from res
        ),
        'no_info', (select count(*) from res where bot_no_info),
        'support', (select count(*) from res where escalo and not bot_no_info),
        'clarify', (select count(*) from res where asked_clarification and not bot_no_info and not escalo),
        'sin',     (select count(*) from res where not (bot_no_info or escalo))
      ),
      -- NUEVO. Las mismas tres cajas que usa "Resolucion real" arriba, pero por
      -- vertical, para que los recuadros no inventen su propia aritmetica.
      -- `sin_vertical` NO es relleno: es la porcion que llego sin contexto de
      -- Bold, y esconderla haria que los dos recuadros no cierren contra el
      -- total.
      'by_vertical', (
        select coalesce(jsonb_object_agg(v, datos), '{}'::jsonb)
        from (
          select coalesce(nullif(btrim(vertical), ''), 'sin_vertical') as v,
                 jsonb_build_object(
                   'total',      count(*),
                   'resolved',   count(*) filter (where eff_status = 'resuelta'),
                   'unresolved', count(*) filter (where eff_status = 'no_resuelta'),
                   'ambiguous',  count(*) filter (where eff_status = 'ambigua')
                 ) as datos
            from res
           group by 1
        ) t
      ),
      'sentiment_net', (
        select round(100.0 * (count(*) filter (where sentiment = 'positivo')
                              - count(*) filter (where sentiment = 'negativo'))
                      / nullif(count(*), 0))
        from res
      ),
      -- 'neutro' ya NO absorbe los NULL: "todavía sin evaluar" y "evaluada como
      -- neutra" son cosas distintas y mezclarlas inflaba el neutro.
      'sentiment', jsonb_build_object(
        'positivo',    (select count(*) from res where sentiment = 'positivo'),
        'neutro',      (select count(*) from res where sentiment = 'neutro'),
        'negativo',    (select count(*) from res where sentiment = 'negativo'),
        'sin_evaluar', (select count(*) from res where sentiment is null)
      )
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', cat, 'total', c,
        'resolved_pct', rp, 'negative_pct', np, 'support_pct', sp,
        'no_info', ni, 'no_info_pct', nip, 'dominant_sentiment', dom) order by c desc), '[]'::jsonb)
      from (
        select cat,
               count(*) as c,
               round(100.0 * count(*) filter (where eff_status = 'resuelta')
                     / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as rp,
               round(100.0 * count(*) filter (where sentiment = 'negativo') / nullif(count(*), 0)) as np,
               round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as sp,
               count(*) filter (where bot_no_info) as ni,
               round(100.0 * count(*) filter (where bot_no_info) / nullif(count(*), 0)) as nip,
               mode() within group (order by coalesce(sentiment, 'neutro')) as dom
        from res group by cat
      ) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', c) order by dow, hr), '[]'::jsonb)
      from (
        select extract(dow from started_at at time zone 'America/Bogota')::int as dow,
               extract(hour from started_at at time zone 'America/Bogota')::int as hr,
               count(*) as c
        from res group by 1, 2
      ) t
    )
  );
$$;

revoke execute on function public.analytics_bot_summary(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_bot_summary(timestamptz, timestamptz) to authenticated;

-- ── 2. El explorador filtra y devuelve la vertical ──────────────────────────
-- Base: update_analytics_bot_conversations_no_info.sql, la VIGENTE. Se agrega
-- `p_vertical` al final (con default) y `vertical` a las filas que devuelve.
-- Cambia la firma → hay que dropear la versión de 10 args.
--
-- Se filtra en el SERVIDOR, igual que p_no_info y por la misma razón: p_limit
-- corta antes, así que filtrar en el cliente mostraría un número arriba y otro
-- abajo en cuanto el rango pase de 100 conversaciones.

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
  p_vertical  text default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      bot_no_info, vertical,
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
      -- 'sin_vertical' es el mismo bucket que arma by_vertical arriba: si el
      -- recuadro lo muestra, el explorador tiene que saber filtrarlo.
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
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text) to authenticated;
