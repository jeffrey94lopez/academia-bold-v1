import { supabase } from './supabase.js'

export async function logActivity(action, entityType, entityName, details = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('activity_log').insert({
      user_id: user.id,
      user_email: user.email,
      action,
      entity_type: entityType,
      entity_name: entityName,
      details,
    })
  } catch {
    // silently fail — logging must never break the app
  }
}
