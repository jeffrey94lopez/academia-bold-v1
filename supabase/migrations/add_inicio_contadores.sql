-- Lo que le falta a las RPC para que el Inicio del admin se arme sin traerse
-- miles de filas solo para contarlas.
--
-- Dos cambios, los dos AGREGANDO claves. Nada de lo que ya devolvían cambia,
-- así que ningún lector existente se entera.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

-- ── 1. Salud de la bandeja, con contadores por estado ───────────────────────
-- Hoy el Inicio tendría que pedir las cinco listas completas (hasta 500 filas
-- cada una) para mostrar cinco números.

drop function if exists public.analytics_vacios_salud();
create or replace function public.analytics_vacios_salud()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'pendientes',  (select count(*) from bot_vacios where estado = 'pendiente'),
    'incidentes',  (select count(*) from bot_vacios where estado = 'incidente'),
    'solicitudes', (select count(*) from bot_vacios where estado = 'solicitud'),
    'descartados', (select count(*) from bot_vacios where estado = 'descartado'),
    'resueltos',   (select count(*) from bot_vacios where estado = 'resuelto'),
    -- Resueltos que SIGUEN recibiendo preguntas. Es la señal de que el
    -- contenido existe y el bot no lo recupera; escribir otra FAQ no lo
    -- arregla. Merece su propio número en vez de esconderse entre los
    -- resueltos, que es donde nadie vuelve a mirar.
    'resueltos_que_vuelven', (
      select count(*) from bot_vacios v
       where v.estado = 'resuelto'
         and v.resuelto_at is not null
         and exists (select 1 from bot_vacios_preguntas p
                      where p.vacio_id = v.id and p.created_at > v.resuelto_at)),
    'sin_clasificar', (select count(*) from bot_vacios_preguntas where vacio_id is null),
    'ultimo_gap_conversacion',
      (select max(started_at) from bodi_conversations where knowledge_gap is true),
    'ultima_pregunta_registrada',
      (select max(created_at) from bot_vacios_preguntas)
  );
$$;
revoke execute on function public.analytics_vacios_salud() from public, anon;
grant  execute on function public.analytics_vacios_salud() to authenticated;

-- ── 2. by_vertical aprende a contar las que se quedaron sin contenido ───────
-- COPIA EXACTA de la versión vigente (add_vertical_analytics_bot.sql) con una
-- sola clave agregada dentro de by_vertical. by_category, heatmap y friction
-- quedan tal cual: son los que leen "Qué atender ahora" y el mapa de calor.

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
                   'ambiguous',  count(*) filter (where eff_status = 'ambigua'),
                   -- NUEVO: cuántas se quedaron sin contenido, por vertical.
                   -- Es la fila "Sin contenido" de la tabla retail contra
                   -- restaurantes del Inicio.
                   'no_info',    count(*) filter (where bot_no_info)
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
