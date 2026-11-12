-- Topes diarios del purgador con IA, ahora ATÓMICOS. Requiere create_inventario_ia.sql y
-- update_inventario_ia_cupo.sql aplicadas antes.
--
-- Antes: n8n contaba (inventario_ia_cupo, solo lectura) y escribía la fila de uso recién
-- después de Gemini (hasta 45 s), así que N pedidos en paralelo veían el mismo conteo y
-- pasaban todos. Ahora la fila de uso de una llamada real a Gemini se inserta ANTES de
-- llamar (es la reserva) y este trigger decide, serializado por env:
--
-- inventario_ia_reservar_cupo()  BEFORE INSERT en inventario_ia_uso. Solo mira filas con
--                    cache_hit = false (los hits de caché pasan sin contar ni bloquear).
--                    Toma pg_advisory_xact_lock(hashtext('inventario_ia_cupo:' || env)),
--                    cuenta las llamadas reales de las últimas 24 h del env (global y, si
--                    ip_hash no es null, de esa IP) y si ya llegó al tope corta el INSERT con
--                    RAISE (errcode P0001, 'sin_cupo_global' | 'sin_cupo_ip'; PostgREST
--                    responde 400). El lock dura hasta el commit del INSERT, así que el
--                    siguiente ya ve la fila nueva.
--                    Topes: app_settings inventario_ia_tope_diario / inventario_ia_tope_ip,
--                    mezcla prod + env (la fila del env pisa), entero de 1 a 9 dígitos; si
--                    falta o no es válido, 500 / 30. Pasa si conteo < tope: '0' = nada pasa
--                    (apaga la IA sin tocar inventario_ia_activa), igual que antes. El cliente
--                    NO puede mandar los topes.
-- inventario_ia_uso.reserva      texto aleatorio que pone n8n en la fila reservada, para
--                    encontrarla (GET) y completarla (PATCH por id) después de Gemini.
--
-- inventario_ia_cupo (update_inventario_ia_cupo.sql) queda: el workflow nuevo ya no la usa,
-- pero el viejo sí, y borrarla antes de importar el workflow nuevo dejaría la IA apagada en
-- ese intervalo. Es solo lectura y solo service_role: se puede borrar más adelante.
--
-- Ejecutar en el SQL Editor del proyecto Supabase ANTES de importar el workflow nuevo
-- (es idempotente).

alter table public.inventario_ia_uso add column if not exists reserva text;

create unique index if not exists idx_inventario_ia_uso_reserva
  on public.inventario_ia_uso (reserva) where reserva is not null;

create or replace function public.inventario_ia_reservar_cupo()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_txt     text;
  v_tope_g  int;
  v_tope_ip int;
  v_global  int;
  v_ip      int;
begin
  -- Solo las llamadas reales a Gemini reservan cupo; caché (true) o null pasan.
  if new.cache_hit is distinct from false then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('inventario_ia_cupo:' || new.env));

  v_txt := btrim(coalesce(
    (select value from app_settings where key = 'inventario_ia_tope_diario' and env = new.env),
    (select value from app_settings where key = 'inventario_ia_tope_diario' and env = 'prod'),
    ''));
  v_tope_g := case when v_txt ~ '^[0-9]{1,9}$' then v_txt::int else 500 end;

  v_txt := btrim(coalesce(
    (select value from app_settings where key = 'inventario_ia_tope_ip' and env = new.env),
    (select value from app_settings where key = 'inventario_ia_tope_ip' and env = 'prod'),
    ''));
  v_tope_ip := case when v_txt ~ '^[0-9]{1,9}$' then v_txt::int else 30 end;

  -- plpgsql toma un snapshot nuevo por sentencia (READ COMMITTED): ya con el lock, este
  -- conteo ve la fila que el anterior acaba de confirmar.
  select count(*)::int into v_global
    from inventario_ia_uso
   where env = new.env and cache_hit = false
     and creado >= now() - interval '24 hours';
  if v_global >= v_tope_g then
    raise exception using errcode = 'P0001', message = 'sin_cupo_global';
  end if;

  if new.ip_hash is not null then
    select count(*)::int into v_ip
      from inventario_ia_uso
     where env = new.env and ip_hash = new.ip_hash and cache_hit = false
       and creado >= now() - interval '24 hours';
    if v_ip >= v_tope_ip then
      raise exception using errcode = 'P0001', message = 'sin_cupo_ip';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.inventario_ia_reservar_cupo() from public, anon, authenticated;
grant  execute on function public.inventario_ia_reservar_cupo() to service_role;

drop trigger if exists inventario_ia_uso_reservar_cupo on public.inventario_ia_uso;
create trigger inventario_ia_uso_reservar_cupo
  before insert on public.inventario_ia_uso
  for each row execute function public.inventario_ia_reservar_cupo();

-- La tabla ya es solo de service_role (create_inventario_ia.sql); se repite por las dudas.
revoke all on table public.inventario_ia_uso from anon, authenticated;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Con inventario_ia_tope_diario = '0' en sandbox, esto debe fallar con 'sin_cupo_global'
-- (y no dejar fila):
-- begin;
-- insert into public.inventario_ia_uso (env, cache_hit) values ('sandbox', false);
-- rollback;
