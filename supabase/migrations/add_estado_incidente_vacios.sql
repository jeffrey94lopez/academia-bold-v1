-- Estado `incidente` para la bandeja de vacíos.
--
-- Por qué existe: al limpiar los falsos positivos del backfill, la pestaña
-- Solicitudes quedó mezclando dos cosas que lee gente distinta. Pedidos de
-- producto ("quiero borrar todo el inventario y empezar de cero") los lee
-- Producto. Incidentes ("el datáfono no reconoce la clave", "las ventas de
-- ayer aparecen con la fecha de hoy") los lee Soporte. En la misma lista, cada
-- uno es ruido para el otro.
--
-- No es un descarte: el motivo `es_soporte` existe para sacar ruido de la
-- bandeja, y manda a Descartados, que es donde nadie entra. Un incidente que
-- aparece cinco veces en un mes es un dato, y para verlo hay que contarlo.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

alter table public.bot_vacios drop constraint if exists bot_vacios_estado_check;
alter table public.bot_vacios add constraint bot_vacios_estado_check
  check (estado in ('pendiente','resuelto','descartado','solicitud','incidente'));

-- Gemela de marcar_solicitud. Dos funciones explícitas y no una genérica
-- `marcar_estado(p_estado)` a propósito: una genérica dejaría poner 'resuelto'
-- sin lección desde el cliente, saltándose resolver_vacio.
drop function if exists public.marcar_incidente(uuid, text, text);
create or replace function public.marcar_incidente(
  p_vacio_id uuid, p_nota text default null, p_email text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update bot_vacios
     set estado = 'incidente',
         nota_descarte = nullif(btrim(coalesce(p_nota, '')), ''),
         motivo_descarte = null,
         leccion_id = null,
         resuelto_at = now(),
         resuelto_por = p_email
   where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;
end;
$$;
revoke execute on function public.marcar_incidente(uuid, text, text) from public, anon;
grant  execute on function public.marcar_incidente(uuid, text, text) to authenticated;
