-- Control de add_cruce_vertical.sql. Correr DESPUÉS de la migración, en el
-- SQL Editor, como un script aparte.
--
-- No crea ni deja nada: inserta dos filas de prueba, comprueba el flujo con
-- los dos roles reales y las borra. No usa `begin`/`rollback` a propósito —
-- el editor de Supabase ya envuelve todo en una transacción, y mezclar las dos
-- cosas fue lo que rompió la migración el 2026-10-06.
--
-- Si sale un error que empieza con FALLO, NO despliegues el portal: el
-- registro de cruces quedaría vacío o entero en null, sin avisar.

do $$
declare
  v_id  uuid := gen_random_uuid();
  n     int;
  fallo text := null;
begin
  -- ── Como `anon`: es el rol con el que escribe el portal ──────────────────
  set local role anon;

  -- Sin policy de INSERT para anon, esto aborta con 42501.
  insert into public.bot_cruces_vertical
    (id, account_id, vertical_comercio, vertical_contenido, leccion_id, leccion_titulo)
    values (v_id, 'PRUEBA', 'retail', 'restaurantes', gen_random_uuid(), 'Prueba');

  -- Sin grant de execute para anon, esto aborta.
  perform public.responder_cruce(v_id, true);

  -- Control NEGATIVO: anon NO debe poder leer. Es la propiedad de privacidad
  -- que justifica que responder_cruce sea security definer.
  select count(*) into n from public.bot_cruces_vertical;
  if n <> 0 and fallo is null then
    fallo := format('anon PUEDE leer bot_cruces_vertical (%s filas). Sobra una policy de select para anon.', n);
  end if;

  reset role;

  -- Ya como dueño, que sí lee: ¿responder_cruce escribió de verdad? Un UPDATE
  -- de 0 filas no lanza, así que esta es la única forma de saberlo.
  select count(*) into n from public.bot_cruces_vertical where id = v_id and acepto;
  if n <> 1 and fallo is null then
    fallo := format('responder_cruce no actualizo la fila (n=%s)', n);
  end if;

  -- ── Como `authenticated`: el panel admin y el dashboard ──────────────────
  v_id := gen_random_uuid();
  set local role authenticated;

  insert into public.bot_cruces_vertical
    (id, account_id, vertical_comercio, vertical_contenido, leccion_id, leccion_titulo)
    values (v_id, 'PRUEBA', 'restaurantes', 'retail', gen_random_uuid(), 'Prueba');

  select count(*) into n from public.bot_cruces_vertical where id = v_id;
  if n <> 1 and fallo is null then
    fallo := format('authenticated no puede leer lo que inserto (n=%s). Falta la policy de select.', n);
  end if;

  reset role;

  -- Limpieza SIEMPRE antes de reportar: si se reporta primero, la excepcion
  -- aborta y las filas de prueba podrian quedar.
  delete from public.bot_cruces_vertical where account_id = 'PRUEBA';

  if fallo is not null then
    raise exception 'FALLO: %', fallo;
  end if;
end $$;

select 'CONTROL OK: insert y responder_cruce funcionan con anon y con authenticated; anon no puede leer' as resultado;
