import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

export const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function studentClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { 'x-student-id': localStorage.getItem('bold_session_id') || '' } }
  })
}
