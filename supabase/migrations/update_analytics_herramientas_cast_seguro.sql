-- analytics_herramientas: conteos tolerantes a eventos mal formados.
--
-- analytics_events acepta INSERT desde anon (la anon key es pública), así que el
-- payload no es confiable. La versión anterior hacía `nullif(payload->>'filas','')::int`
-- y `...'productos'...::int`: un solo evento con "filas": "abc" (o un número de más de
-- 9 dígitos) hacía fallar la RPC para cualquier rango que lo incluyera, y la pestaña
-- Herramientas del admin quedaba rota hasta borrar la fila a mano.
--
-- Ahora solo se suman valores que son enteros de 1 a 9 dígitos; lo demás cuenta como
-- vacío. El resto de la función queda idéntico a create_analytics_herramientas.sql.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase (reemplaza la función).

create or replace function public.analytics_herramientas(
  p_from timestamptz,
  p_to   timestamptz,
  p_env  text default 'prod'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select event_type, payload, session_id, created_at,
           payload->>'tool'   as tool,
           payload->>'run_id' as run_id,
           nullif(payload->>'account_id', '') as account_id
      from analytics_events
     where event_type in ('tool_start', 'tool_step', 'tool_error', 'tool_complete')
       and created_at >= p_from and created_at <= p_to
       and coalesce(payload->>'env', 'prod') = p_env
       and payload->>'tool' in ('inventario', 'codigos')
       and payload->>'run_id' is not null
  ),
  -- Una fila por conversación, con el paso más lejano al que llegó.
  runs as (
    select tool, run_id,
           min(created_at) as inicio,
           max(created_at) as ultimo,
           max(account_id) as account_id,
           max(payload->>'business_name') as business_name,
           max(payload->>'vertical') as vertical,
           max(session_id) as session_id,
           bool_or(event_type = 'tool_complete') as terminada,
           coalesce(max(case when event_type = 'tool_step' then
             case tool
               when 'inventario' then case payload->>'paso'
                 when 'plantillas' then 1 when 'origen' then 2 when 'columnas' then 3
                 when 'preguntas' then 4 when 'resultado' then 5 else 0 end
               else case payload->>'paso'
                 when 'datos' then 1 when 'formato' then 2 when 'diseno' then 3
                 when 'resultado' then 4 else 0 end
             end
           end), 0) as rango_paso
      from ev
     group by tool, run_id
  ),
  herramientas as (
    select t.tool,
      jsonb_build_object(
        'corridas',      (select count(*) from runs r where r.tool = t.tool),
        'comercios',     (select count(distinct account_id) from runs r where r.tool = t.tool),
        'visitantes',    (select count(distinct session_id) from runs r where r.tool = t.tool),
        'sin_identificar', (select count(*) from runs r where r.tool = t.tool and r.account_id is null),
        'terminaron',    (select count(*) from runs r where r.tool = t.tool and r.terminada),
        'comercios_terminaron', (select count(distinct account_id) from runs r where r.tool = t.tool and r.terminada),
        'pasos', coalesce((
          select jsonb_agg(jsonb_build_object('paso', paso, 'corridas', n) order by paso)
            from (select payload->>'paso' as paso, count(distinct run_id) as n
                    from ev e where e.tool = t.tool and e.event_type = 'tool_step'
                   group by 1) s), '[]'::jsonb),
        'errores', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'paso', paso, 'codigo', codigo, 'veces', veces, 'corridas', corridas,
                   'comercios', comercios, 'filas', filas) order by corridas desc, veces desc)
            from (select payload->>'paso' as paso, payload->>'codigo' as codigo,
                         count(*) as veces, count(distinct run_id) as corridas,
                         count(distinct account_id) as comercios,
                         sum(case when payload->>'filas' ~ '^[0-9]{1,9}$' then (payload->>'filas')::int end) as filas
                    from ev e where e.tool = t.tool and e.event_type = 'tool_error'
                   group by 1, 2) x), '[]'::jsonb),
        'acciones', coalesce((
          select jsonb_agg(jsonb_build_object('accion', accion, 'corridas', n) order by n desc)
            from (select payload->>'accion' as accion, count(distinct run_id) as n
                    from ev e where e.tool = t.tool and e.event_type = 'tool_complete'
                   group by 1) a), '[]'::jsonb),
        -- Qué eligen quienes llegan hasta el final (solo códigos).
        'elecciones', coalesce((
          select jsonb_agg(jsonb_build_object('campo', campo, 'valor', valor, 'corridas', n) order by campo, n desc)
            from (select c.campo, e.payload->>c.campo as valor, count(distinct e.run_id) as n
                    from ev e
                    cross join (values ('tipo'), ('formato'), ('papel'), ('origen_datos')) as c(campo)
                   where e.tool = t.tool and e.event_type = 'tool_complete'
                     and e.payload->>'accion' in ('impresion', 'zip')
                     and e.payload->>c.campo is not null
                   group by 1, 2) q), '[]'::jsonb),
        'productos', coalesce((
          select sum(case when payload->>'productos' ~ '^[0-9]{1,9}$' then (payload->>'productos')::int end)
            from ev e where e.tool = t.tool and e.event_type = 'tool_complete'), 0),
        'crearon_codigos', (
          select count(distinct run_id) from ev e
           where e.tool = t.tool and e.event_type = 'tool_step' and e.payload->>'paso' = 'codigos_creados')
      ) as datos
    from (values ('inventario'), ('codigos')) as t(tool)
  ),
  comercios as (
    select account_id,
           max(business_name) as business_name,
           max(vertical) as vertical,
           max(ultimo) as ultimo,
           jsonb_object_agg(tool, jsonb_build_object(
             'corridas', corridas, 'terminadas', terminadas, 'rango_paso', rango)) as herramientas
      from (
        select account_id, tool,
               max(business_name) as business_name, max(vertical) as vertical, max(ultimo) as ultimo,
               count(*) as corridas, count(*) filter (where terminada) as terminadas,
               max(rango_paso) as rango
          from runs where account_id is not null
         group by account_id, tool
      ) por_tool
     group by account_id
     order by max(ultimo) desc
     limit 200
  )
  select jsonb_build_object(
    'herramientas', (select jsonb_object_agg(tool, datos) from herramientas),
    'comercios', coalesce((select jsonb_agg(to_jsonb(c) order by c.ultimo desc) from comercios c), '[]'::jsonb)
  );
$$;

revoke execute on function public.analytics_herramientas(timestamptz, timestamptz, text) from public, anon;
grant  execute on function public.analytics_herramientas(timestamptz, timestamptz, text) to authenticated;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Debe devolver el mismo JSON que antes, sin error aunque haya eventos con "filas"
-- o "productos" no numéricos:
-- select public.analytics_herramientas(now() - interval '30 days', now(), 'sandbox');
