-- analytics_conversations_to_evaluate: lote de conversaciones cerradas y aún sin
-- evaluar por el LLM (resolution_status is null), con al menos un mensaje de
-- usuario, más viejas primero. La usa el workflow n8n de auto-evaluación (①c)
-- "Bold POS - Auto-eval calidad" (id DQ5aV81TeeUbtTsC).
-- security definer + grant solo a service_role: el job la llama con la
-- credencial service-role; ningún rol anónimo la ejecuta.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create or replace function public.analytics_conversations_to_evaluate(
  p_limit int default 50
) returns table(id uuid, messages jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select id, messages
  from bodi_conversations
  where status in ('completed','abandoned')
    and resolution_status is null
    and exists (
      select 1 from jsonb_array_elements(coalesce(messages,'[]'::jsonb)) m
      where m->>'role' = 'user'
    )
  order by started_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke execute on function public.analytics_conversations_to_evaluate(int) from public, anon, authenticated;
grant  execute on function public.analytics_conversations_to_evaluate(int) to service_role;
