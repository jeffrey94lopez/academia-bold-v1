-- Registra una pregunta que el bot no supo responder y la cuelga del vacío más
-- cercano, o abre uno nuevo. La llama n8n desde la rama de knowledge_gap del
-- workflow "Bold POS Chat".
--
-- Una sola RPC y no tres viajes (buscar → decidir → insertar) porque dos
-- preguntas parecidas que llegan a la vez abrirían dos vacíos duplicados. Acá
-- es atómico.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.registrar_pregunta_sin_respuesta(text, vector, uuid, text, text, text);
create or replace function public.registrar_pregunta_sin_respuesta(
  p_texto           text,
  p_embedding       vector default null,
  p_conversation_id uuid   default null,
  p_vertical        text   default null,
  p_plataforma      text   default null,
  p_categoria       text   default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_umbral  double precision;
  v_vacio   uuid;
  v_texto   text := nullif(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), '');
begin
  -- Sin texto no hay nada que registrar. Silencioso a propósito: es una rama
  -- del bot en producción, no queremos que un turno raro tumbe la respuesta.
  if v_texto is null or length(v_texto) < 5 then
    return null;
  end if;

  -- Sin embedding (Vertex topó cuota) la pregunta se guarda SIN clasificar en
  -- vez de perderse. El dato original es irrecuperable; no agruparlo no lo es.
  if p_embedding is null then
    insert into bot_vacios_preguntas
      (vacio_id, texto, embedding, conversation_id, categoria, vertical, plataforma)
    values (null, v_texto, null, p_conversation_id, p_categoria, p_vertical, p_plataforma);
    return null;
  end if;

  select coalesce(
           (select value::double precision from app_settings
             where key = 'gap_umbral_coseno' and env = 'prod' limit 1),
           0.85)
    into v_umbral;

  -- El vacío MÁS CERCANO por encima del umbral, dentro de la misma vertical.
  -- La misma pregunta en Retail y en Restaurantes no es el mismo vacío porque
  -- la respuesta es distinta (decisión 4).
  select v.id into v_vacio
    from bot_vacios v
   where v.embedding is not null
     and coalesce(v.vertical, '') = coalesce(p_vertical, '')
     and 1 - (v.embedding <=> p_embedding) > v_umbral
   order by v.embedding <=> p_embedding
   limit 1;

  if v_vacio is null then
    insert into bot_vacios
      (titulo, embedding, categoria, vertical, plataforma,
       preguntas_total, primera_vez, ultima_vez)
    values (v_texto, p_embedding, p_categoria, p_vertical, p_plataforma, 0, now(), now())
    returning id into v_vacio;
  end if;

  insert into bot_vacios_preguntas
    (vacio_id, texto, embedding, conversation_id, categoria, vertical, plataforma)
  values (v_vacio, v_texto, p_embedding, p_conversation_id, p_categoria, p_vertical, p_plataforma);

  -- Contadores DERIVADOS de las filas, no incrementados: un contador por suma
  -- se desincroniza en cuanto algo falla a mitad de camino, y después de
  -- dividir un vacío no habría forma de saber cuál es el bueno.
  update bot_vacios v
     set preguntas_total = s.total,
         primera_vez     = s.primera,
         ultima_vez      = s.ultima
    from (select count(*) as total, min(created_at) as primera, max(created_at) as ultima
            from bot_vacios_preguntas where vacio_id = v_vacio) s
   where v.id = v_vacio;

  return v_vacio;
end;
$$;

revoke execute on function public.registrar_pregunta_sin_respuesta(text, vector, uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.registrar_pregunta_sin_respuesta(text, vector, uuid, text, text, text) to service_role;
