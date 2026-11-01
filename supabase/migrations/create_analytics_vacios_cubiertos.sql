-- "¿Qué vacíos pendientes ya tienen contenido?" — el chequeo barato.
--
-- El problema que resuelve: un vacío se registra cuando el bot falla, y ahí se
-- queda. Si alguien publica la lección que lo responde una semana después, el
-- vacío sigue en pendientes para siempre. Pasó con los 9 de Hardware el
-- 2026-10-31: 6 estaban resueltos por contenido que llegó DESPUÉS de que la
-- gente preguntara, y hubo que probarlos a mano uno por uno para darse cuenta.
--
-- Usa `match_lessons`, la MISMA función con la que el bot recupera, para que el
-- número signifique lo mismo de los dos lados. Compara contra el ANCLA del
-- vacío (su embedding), que no se recalcula nunca — decisión 3 de la spec.
--
-- Lo que esto NO dice: que el bot responda. Dice que hay una lección parecida.
-- Hoy mismo vimos 3 casos con contenido cerca que el bot igual fallaba, así que
-- el panel lo ofrece como SUGERENCIA y el veredicto lo da preguntarle al bot.
--
-- VOLATILE a propósito (sin declarar `stable`): match_lessons es plpgsql y no
-- declara volatilidad, o sea que es VOLATILE. Prometer estabilidad por encima
-- de algo que no la promete sería mentirle al planificador.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

drop function if exists public.analytics_vacios_cubiertos(double precision, int);
create or replace function public.analytics_vacios_cubiertos(
  p_umbral double precision default 0.55,
  p_limit  int default 100
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- El umbral viaja de vuelta para que la pantalla pueda decir con qué número
    -- se filtró. Un umbral escondido en el código es un número que nadie
    -- cuestiona.
    'umbral', p_umbral,
    'revisados', (
      select count(*) from bot_vacios
       where estado = 'pendiente' and embedding is not null),
    -- Sin ancla no hay con qué comparar: son los que entraron cuando Vertex
    -- topó cuota. Se cuentan aparte para que la franja no afirme que revisó
    -- todo lo pendiente.
    'sin_embedding', (
      select count(*) from bot_vacios
       where estado = 'pendiente' and embedding is null),
    'cubiertos', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.similitud desc)
      from (
        select v.id, v.titulo, v.categoria, v.vertical,
               v.preguntas_total, v.ultima_vez,
               m.id     as leccion_id,
               m.titulo as leccion_titulo,
               round(m.similarity::numeric, 3) as similitud
          from bot_vacios v
          cross join lateral (
            select * from match_lessons(v.embedding, 1, p_umbral, v.vertical, v.plataforma)
          ) m
         where v.estado = 'pendiente'
           and v.embedding is not null
         order by m.similarity desc
         limit p_limit
      ) r), '[]'::jsonb)
  );
$$;
revoke execute on function public.analytics_vacios_cubiertos(double precision, int) from public, anon;
grant  execute on function public.analytics_vacios_cubiertos(double precision, int) to authenticated;
