-- Sentimiento REAL: derivado de lo que el usuario hizo, no de lo que un modelo
-- creyó leer en el tono.
--
-- El problema medido el 2026-09-09: sobre 234 conversaciones evaluadas por
-- gemini, 'positivo' salió 0 veces — nunca, ni una. 224 neutro y 4 negativo.
-- Y sin embargo 10 usuarios habían apretado el botón "Sí, gracias" de "¿Logré
-- resolver tu duda?": las 10 estaban etiquetadas neutro. La señal más clara del
-- sistema (un clic explícito del usuario) se estaba ignorando para que un LLM
-- adivinara el tono de un texto tonalmente plano.
--
-- Regla nueva (bodi_eff_sentiment), en orden:
--   positivo → apretó "Sí, gracias" (resolved = true), o el LLM vio agrado
--   negativo → apretó "Necesito más ayuda" (resolved = false), o pidió soporte,
--              o el LLM vio queja
--   neutro   → no dio ninguna señal
--
-- Distribución resultante sobre la data real: 4% / 74% / 22%, contra el
-- 0% / 96% / 2% de antes.
--
-- La regla vive en UNA función para que el resumen y el explorador no se
-- desincronicen: si el header dice "10 positivas" y al hacer clic salen 0, es
-- porque cada uno aplicó su propio criterio.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

create or replace function public.bodi_eff_sentiment(
  p_resolved boolean,
  p_support  boolean,
  p_llm      text
) returns text
language sql
immutable
as $$
  select case
    when p_resolved is true  or p_llm = 'positivo' then 'positivo'
    when p_resolved is false or coalesce(p_support, false) or p_llm = 'negativo' then 'negativo'
    else 'neutro'
  end;
$$;

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
      bodi_eff_sentiment(resolved, support_redirected, sentiment) as eff_sentiment,
      status,
      bot_no_info,
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
      'sentiment_net', (
        select round(100.0 * (count(*) filter (where eff_sentiment = 'positivo')
                              - count(*) filter (where eff_sentiment = 'negativo'))
                      / nullif(count(*), 0))
        from res
      ),
      -- Sentimiento EFECTIVO (ver bodi_eff_sentiment): sale de lo que el usuario
      -- hizo, no de lo que un modelo interpretó. Ya no hay 'sin_evaluar': la
      -- regla siempre da un valor porque no depende de que el LLM haya corrido.
      'sentiment', jsonb_build_object(
        'positivo', (select count(*) from res where eff_sentiment = 'positivo'),
        'neutro',   (select count(*) from res where eff_sentiment = 'neutro'),
        'negativo', (select count(*) from res where eff_sentiment = 'negativo')
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
               round(100.0 * count(*) filter (where eff_sentiment = 'negativo') / nullif(count(*), 0)) as np,
               round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as sp,
               count(*) filter (where bot_no_info) as ni,
               round(100.0 * count(*) filter (where bot_no_info) / nullif(count(*), 0)) as nip,
               mode() within group (order by eff_sentiment) as dom
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

-- ------------------------------------------------- explorador de conversaciones
-- Devuelve y filtra por el sentimiento EFECTIVO, así el badge de la lista y el
-- CSV dicen lo mismo que las caritas del header.
drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100,
  p_lifecycle text default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, support_redirected,
      bodi_eff_sentiment(resolved, support_redirected, sentiment) as sentiment,
      bot_no_info,
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
      and (p_sentiment is null or bodi_eff_sentiment(resolved, support_redirected, sentiment) = p_sentiment)
      and (p_support  is null or coalesce(support_redirected, false) = p_support)
      and (p_category is null or coalesce(category, topic, 'Sin categoría') = p_category)
      and (p_search   is null or messages::text ilike '%' || p_search || '%')
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
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text) to authenticated;
