-- Marca de frescura del embedding: cada vez que se re-embebe una lección se
-- guarda la fecha. Sirve para VALIDAR que todas están al día con el modelo
-- actual (un conteo de NULL no basta: un vector viejo de otro modelo no es null
-- pero está desactualizado). Tras aplicar esto y re-embeber todo, una lección
-- "al día" es la que tiene embedding_updated_at reciente; las que queden en NULL
-- son las que faltan.
-- Ejecutar UNA vez en el SQL Editor del proyecto Supabase.

alter table public.lecciones
  add column if not exists embedding_updated_at timestamptz;

-- El RPC que guarda el embedding ahora sella la fecha. Mantiene la firma y el
-- chequeo de secreto; solo agrega embedding_updated_at = now().
create or replace function public.update_lesson_embedding(
  p_lesson_id uuid,
  p_embedding double precision[],
  p_secret text default ''
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
  begin
    if p_secret != 'BoldBodi-embed-2026' then
      raise exception 'Unauthorized';
    end if;
    update lecciones
       set embedding = p_embedding::vector,
           embedding_updated_at = now()
     where id = p_lesson_id;
  end;
$function$;
