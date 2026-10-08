-- Lectura de la bandeja de vacíos. security definer + grant a authenticated:
-- las tablas tienen RLS sin policies, así que este es el único camino.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

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
           -- Preguntas llegadas DESPUÉS de cerrarlo. Es lo que convierte un
           -- "resuelto" en "resuelto pero siguen preguntando": no falta
           -- contenido, el bot no lo está recuperando.
           (select count(*) from bot_vacios_preguntas p
             where p.vacio_id = v.id
               and v.resuelto_at is not null
               and p.created_at > v.resuelto_at) as preguntas_desde_cierre
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
               -- Los mensajes viajan acá y no se consultan aparte: el
               -- explorador de conversaciones expande por índice de la página
               -- cargada, así que NO hay forma de abrir una conversación por
               -- id. Traerlos por esta RPC (security definer) además evita
               -- depender de si `authenticated` tiene SELECT sobre
               -- bodi_conversations, que el repo no refleja.
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

-- Salud del registro: alimenta el badge y el detector de silencio. Los dos
-- max() que comparan "el bot reportó vacíos" contra "se registró alguno".
drop function if exists public.analytics_vacios_salud();
create or replace function public.analytics_vacios_salud()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'pendientes',      (select count(*) from bot_vacios where estado = 'pendiente'),
    'sin_clasificar',  (select count(*) from bot_vacios_preguntas where vacio_id is null),
    'ultimo_gap_conversacion',
      (select max(started_at) from bodi_conversations where knowledge_gap is true),
    'ultima_pregunta_registrada',
      (select max(created_at) from bot_vacios_preguntas)
  );
$$;
revoke execute on function public.analytics_vacios_salud() from public, anon;
grant  execute on function public.analytics_vacios_salud() to authenticated;
