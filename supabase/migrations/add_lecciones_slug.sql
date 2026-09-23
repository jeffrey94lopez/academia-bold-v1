-- Slug por lección para poder compartir un link directo a una lección
-- puntual (portal: ?leccion=<slug>). El slug se genera una sola vez a
-- partir del título; una vez asignado no se vuelve a tocar (ni siquiera
-- si el título cambia), para que un link ya compartido nunca se rompa.
--
-- Ver docs/superpowers/specs (diseño en chat, cambio acotado — sin spec
-- formal) del 2026-09-22.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

alter table public.lecciones add column if not exists slug text;

-- Slugify: minúsculas, sin tildes/diacríticos, todo lo que no sea
-- alfanumérico se vuelve "-", se recortan guiones sobrantes.
create or replace function public.slugify(txt text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          coalesce(txt, ''),
          'áàäâãéèëêíìïîóòöôõúùüûñç',
          'aaaaaeeeeiiiiooooouuuunc'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

-- Backfill de las lecciones que no tienen slug todavía. Si dos títulos
-- generan el mismo slug base, se numeran (-2, -3, ...) por orden de
-- creación para que queden únicos.
with base as (
  select
    id,
    nullif(public.slugify(titulo), '') as slug_base,
    row_number() over (
      partition by nullif(public.slugify(titulo), '')
      order by created_at, id
    ) as n
  from public.lecciones
  where slug is null
)
update public.lecciones l
set slug = case when b.n = 1 then b.slug_base else b.slug_base || '-' || b.n end
from base b
where l.id = b.id
  and b.slug_base is not null;

-- Lecciones sin título usable (slug_base vacío, caso raro): se les da un
-- slug basado en el id para que la columna pueda quedar NOT NULL/UNIQUE.
update public.lecciones
set slug = 'leccion-' || id
where slug is null;

create unique index if not exists lecciones_slug_key on public.lecciones (slug);
alter table public.lecciones alter column slug set not null;
