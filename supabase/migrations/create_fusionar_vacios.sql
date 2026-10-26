-- Fusionar dos vacíos: mover TODAS las preguntas de uno a otro que ya existe.
--
-- Por qué existe: el detector agrupa por similitud de embedding con un umbral
-- fijo (0.80, provisional). Dos formas de preguntar lo mismo que caen por
-- debajo del umbral nacen como dos vacíos distintos, y quien los lee ve
-- enseguida que son uno solo. Caso real: dar de baja la cuenta, partido en dos.
--
-- Es el espejo de dividir_vacio, con una asimetría que importa: acá el vacío
-- ORIGEN se borra. Por eso un vacío resuelto no puede ser origen: se llevaría
-- su `leccion_id`, el único enlace a contenido que alguien escribió. Al revés
-- sí vale, y es lo que se quiere: mover lo pendiente hacia el resuelto hace que
-- esas preguntas cuenten como llegadas después del cierre, que es exactamente
-- la señal de "resuelto pero siguen preguntando".
--
-- El DESTINO conserva su ancla, su título y su clasificación: recalcular el
-- ancla sería el centroide móvil que descarta la decisión 3 de la spec,
-- entrando por la puerta de atrás.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

drop function if exists public.fusionar_vacios(uuid, uuid);
create or replace function public.fusionar_vacios(
  p_origen uuid, p_destino uuid
) returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_origen  bot_vacios%rowtype;
  v_total   int;
begin
  if p_origen is null or p_destino is null then raise exception 'vacio_inexistente'; end if;
  if p_origen = p_destino then raise exception 'mismo_vacio'; end if;

  -- Las dos filas se bloquean en ORDEN DE ID, no en orden origen-destino: dos
  -- fusiones cruzadas simultáneas (A→B y B→A) tomarían los locks al revés una
  -- de la otra y se abrazarían en un deadlock. El lock del origen no es
  -- decorativo: ver el comentario del delete.
  perform 1 from bot_vacios where id in (p_origen, p_destino) order by id for update;

  select * into v_origen from bot_vacios where id = p_origen;
  if not found then raise exception 'vacio_inexistente'; end if;
  perform 1 from bot_vacios where id = p_destino;
  if not found then raise exception 'destino_inexistente'; end if;

  if v_origen.estado = 'resuelto' then raise exception 'origen_resuelto'; end if;

  update bot_vacios_preguntas set vacio_id = p_destino where vacio_id = p_origen;

  -- Mover PRIMERO, borrar DESPUÉS, y nunca al revés: bot_vacios_preguntas
  -- tiene `on delete cascade`, así que borrar el origen con preguntas todavía
  -- colgando de él borraría las preguntas reales. Son el dato irrecuperable de
  -- todo este módulo.
  delete from bot_vacios where id = p_origen;

  -- Contadores recalculados desde las filas, nunca sumados. El agregado sin
  -- group by siempre devuelve una fila, así que el update siempre ataca al
  -- destino incluso si quedara sin preguntas.
  update bot_vacios v
     set preguntas_total = coalesce(s.total, 0),
         primera_vez = s.primera, ultima_vez = s.ultima
    from (select count(*) total, min(created_at) primera, max(created_at) ultima
            from bot_vacios_preguntas where vacio_id = p_destino) s
   where v.id = p_destino
  returning v.preguntas_total into v_total;

  return v_total;
end;
$$;
revoke execute on function public.fusionar_vacios(uuid, uuid) from public, anon;
grant  execute on function public.fusionar_vacios(uuid, uuid) to authenticated;
