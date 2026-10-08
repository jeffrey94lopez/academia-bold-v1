-- Acciones de la bandeja: resolver, descartar, dividir.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

drop function if exists public.resolver_vacio(uuid, uuid, text);
create or replace function public.resolver_vacio(
  p_vacio_id uuid, p_leccion_id uuid, p_email text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update bot_vacios
     set estado = 'resuelto', leccion_id = p_leccion_id,
         resuelto_at = now(), resuelto_por = p_email,
         motivo_descarte = null, nota_descarte = null
   where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;
end;
$$;
revoke execute on function public.resolver_vacio(uuid, uuid, text) from public, anon;
grant  execute on function public.resolver_vacio(uuid, uuid, text) to authenticated;

drop function if exists public.descartar_vacio(uuid, text, text);
create or replace function public.descartar_vacio(
  p_vacio_id uuid, p_motivo text, p_nota text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- `p_motivo is null or` no es redundante: NULL not in (...) da NULL, y un IF
  -- de plpgsql trata NULL como falso, así que un motivo nulo pasaría la
  -- validación y dejaría el vacío descartado sin motivo, sin forma de reabrirlo.
  if p_motivo is null or p_motivo not in ('no_aplica','es_soporte','duplicado','ruido') then
    raise exception 'motivo_invalido';
  end if;
  update bot_vacios
     set estado = 'descartado', motivo_descarte = p_motivo, nota_descarte = p_nota,
         resuelto_at = now(), leccion_id = null
   where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;
end;
$$;
revoke execute on function public.descartar_vacio(uuid, text, text) from public, anon;
grant  execute on function public.descartar_vacio(uuid, text, text) to authenticated;

-- Dividir. El vacío ORIGINAL conserva su ancla: recalcularla sería el centroide
-- móvil que descarta la decisión 3, entrando por la puerta de atrás. El nuevo
-- toma el embedding de la pregunta más antigua de las seleccionadas.
drop function if exists public.dividir_vacio(uuid, uuid[], text);
create or replace function public.dividir_vacio(
  p_vacio_id uuid, p_pregunta_ids uuid[], p_titulo text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_total    int;
  v_sel      int;
  v_nuevo    uuid;
  v_ancla    vector(768);
  v_origen   bot_vacios%rowtype;
begin
  select * into v_origen from bot_vacios where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;

  if p_pregunta_ids is null or array_length(p_pregunta_ids, 1) is null then
    raise exception 'seleccion_vacia';
  end if;

  select count(*) into v_total from bot_vacios_preguntas where vacio_id = p_vacio_id;
  select count(*) into v_sel   from bot_vacios_preguntas
   where vacio_id = p_vacio_id and id = any(p_pregunta_ids);

  -- Rechaza ENTERA, no parcial: una selección con una pregunta ajena es un bug
  -- del cliente, y dividir "lo que sí se pudo" deja un estado que nadie pidió.
  if v_sel <> array_length(p_pregunta_ids, 1) then raise exception 'pregunta_ajena'; end if;
  -- Mover todo no divide nada: dejaría el original con cero preguntas.
  if v_sel = v_total then raise exception 'seleccion_total'; end if;

  select embedding into v_ancla from bot_vacios_preguntas
   where id = any(p_pregunta_ids) order by created_at asc limit 1;

  insert into bot_vacios
    (titulo, embedding, categoria, vertical, plataforma, estado, preguntas_total)
  values (coalesce(nullif(btrim(p_titulo), ''), v_origen.titulo),
          v_ancla, v_origen.categoria, v_origen.vertical, v_origen.plataforma,
          -- Nace PENDIENTE aunque el original estuviera resuelto: la FAQ que se
          -- escribió no cubre lo que se acaba de separar.
          'pendiente', 0)
  returning id into v_nuevo;

  update bot_vacios_preguntas set vacio_id = v_nuevo
   where vacio_id = p_vacio_id and id = any(p_pregunta_ids);

  -- Contadores recalculados desde las filas en AMBOS lados, nunca restados.
  update bot_vacios v set
    preguntas_total = s.total, primera_vez = s.primera, ultima_vez = s.ultima
    from (select vacio_id, count(*) total, min(created_at) primera, max(created_at) ultima
            from bot_vacios_preguntas
           where vacio_id in (p_vacio_id, v_nuevo) group by vacio_id) s
   where v.id = s.vacio_id;

  return v_nuevo;
end;
$$;
revoke execute on function public.dividir_vacio(uuid, uuid[], text) from public, anon;
grant  execute on function public.dividir_vacio(uuid, uuid[], text) to authenticated;
