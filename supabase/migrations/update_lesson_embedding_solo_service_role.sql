-- update_lesson_embedding pasa a ser solo de service_role.
--
-- Por qué: el RPC es SECURITY DEFINER y se "protegía" con el parámetro p_secret,
-- pero ese valor quedó en el repo (migraciones y workflows de n8n), así que ya no
-- protege nada: cualquiera con la anon key podía sobrescribir el embedding de
-- cualquier lección. Desde que la indexación pasa por /api/embed, n8n llama a este
-- RPC con la credencial service-role de Supabase, y es el único que lo necesita.
--
-- Antes de aplicar: confirmar que la credencial de Supabase del workflow
-- embed-lesson en n8n es la service-role (no la anon); si no, la indexación falla
-- con "permission denied for function update_lesson_embedding".
-- Ejecutar UNA vez en el SQL Editor del proyecto Supabase.

revoke execute on function public.update_lesson_embedding(uuid, double precision[], text)
  from public, anon, authenticated;

grant execute on function public.update_lesson_embedding(uuid, double precision[], text)
  to service_role;
