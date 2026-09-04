import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

export const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Cliente que se identifica ante RLS con el header x-student-id.
// `studentId` explícito es para el registro: en ese momento el UUID ya existe
// pero todavía no está en localStorage, y sin el header el INSERT falla al
// devolver la fila (ver registerStudent en js/course.js).
export function studentClient(studentId) {
  const id = studentId || localStorage.getItem('bold_session_id') || ''
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { 'x-student-id': id } }
  })
}
