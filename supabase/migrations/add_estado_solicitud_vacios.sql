-- Estado `solicitud` para la bandeja de vacíos.
--
-- Por qué existe: no todo vacío es falta de contenido. Hay preguntas donde el
-- bot YA responde bien —porque la respuesta correcta es "eso lo gestiona
-- Soporte"— pero que igual son señal: clientes pidiendo algo que la plataforma
-- no hace. Descartarlas las entierra, y el motivo `es_soporte` está pensado
-- para limpiar ruido, no para guardar un pedido de producto.
--
-- Caso que lo motivó, medido en producción: 13 conversaciones en 30 días
-- pidiendo dar de baja la cuenta. El bot contesta correctamente (la FAQ
-- "Como eliminar información de prueba" está en el contexto), así que no hay
-- nada que escribir — pero el equipo de producto quiere ver esa demanda.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

-- El check es inline en create_bot_vacios.sql, así que Postgres le puso el
-- nombre generado. Se dropea por ese nombre y se recrea con el valor nuevo.
alter table public.bot_vacios drop constraint if exists bot_vacios_estado_check;
alter table public.bot_vacios add constraint bot_vacios_estado_check
  check (estado in ('pendiente','resuelto','descartado','solicitud'));

-- Marca un vacío como pedido de producto. A diferencia de descartar, NO lo
-- esconde: sigue contado y visible en su propia pestaña.
--
-- `nota_descarte` se reutiliza a propósito en vez de agregar otra columna: es
-- el mismo campo semántico (por qué este vacío salió de pendientes) y evita
-- una columna que habría que mantener en las RPCs de lectura.
drop function if exists public.marcar_solicitud(uuid, text, text);
create or replace function public.marcar_solicitud(
  p_vacio_id uuid, p_nota text default null, p_email text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update bot_vacios
     set estado = 'solicitud',
         nota_descarte = nullif(btrim(coalesce(p_nota, '')), ''),
         -- Se limpia el motivo de descarte: una solicitud no es un descarte, y
         -- dejarlo puesto haría que la fila se leyera como las dos cosas.
         motivo_descarte = null,
         leccion_id = null,
         resuelto_at = now(),
         resuelto_por = p_email
   where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;
end;
$$;
revoke execute on function public.marcar_solicitud(uuid, text, text) from public, anon;
grant  execute on function public.marcar_solicitud(uuid, text, text) to authenticated;
