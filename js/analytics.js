// js/analytics.js
import { supabase } from './supabase.js'
import { storageGet } from './storage.js'

export function track(eventType, payload = {}) {
  const session_id = storageGet('bold_session_id') || null
  const mode = storageGet('bold_mode') || (session_id ? 'course' : null)

  supabase
    .from('analytics_events')
    .insert({ event_type: eventType, payload, session_id, mode })
    .then(({ error }) => {
      if (error) console.error('[analytics] track error:', error)
    })
    .catch(err => console.error('[analytics] track error:', err))
}
