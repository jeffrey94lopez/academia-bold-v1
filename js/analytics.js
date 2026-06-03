// js/analytics.js
import { supabase } from './supabase.js'

export function track(eventType, payload = {}) {
  const session_id = localStorage.getItem('bold_session_id') || null
  const mode = localStorage.getItem('bold_mode') || (session_id ? 'course' : null)

  supabase
    .from('analytics_events')
    .insert({ event_type: eventType, payload, session_id, mode })
    .then(({ error }) => {
      if (error) console.error('[analytics] track error:', error)
    })
}
