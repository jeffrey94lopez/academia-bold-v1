// Acceso a los datos que dependen del entorno del deploy: los toggles de
// app_settings y la visibilidad por lección. Único lugar del front que habla
// con esas dos tablas — si alguien vuelve a hacer un .from('app_settings') o
// un .from('leccion_visibilidad') suelto, se rompe el aislamiento entre
// sandbox y producción.
import { supabase } from './supabase.js'
import { APP_ENV, mergeSettings } from './env.js'

// Devuelve { settings, error }: el mapa {key: value} ya mezclado (prod de
// base, el entorno actual encima) y el error crudo de Supabase si lo hubo.
// `keys` opcional acota el select, igual que hacían los llamadores.
//
// Los llamadores que distinguen "falló la lectura" de "no hay filas" usan esta
// variante: el panel de Sugerencias pinta un aviso y deshabilita los switches,
// y los loaders del chat se quedan con los valores que ya tenían en vez de
// volver a los defaults. Los demás usan loadSettings().
export async function loadSettingsResult(keys) {
  let q = supabase
    .from('app_settings')
    .select('key,value,env')
    .in('env', ['prod', APP_ENV])
  if (keys) q = q.in('key', keys)

  const { data, error } = await q
  if (error) {
    // Antes este error se descartaba en varios de estos sitios. Un {} vacío se
    // lee exactamente igual que "todos los módulos habilitados", así que el
    // fallo tiene que quedar a la vista en consola aunque el llamador decida
    // seguir con los defaults.
    console.error('[settings] no se pudo leer app_settings:', error.message)
    return { settings: {}, error }
  }
  return { settings: mergeSettings(data, APP_ENV), error: null }
}

// Variante indulgente: ante un fallo devuelve {}, que por la convención del
// proyecto (clave ausente ⇒ habilitado) deja los módulos encendidos. No lanza
// a propósito: lessons.js, resources.js y el panel de Lecciones hacen este
// await dentro de su render, y un throw les dejaría la pantalla clavada en
// "Cargando…" por un parpadeo de red.
export async function loadSettings(keys) {
  const { settings } = await loadSettingsResult(keys)
  return settings
}

// Escribe SIEMPRE en el entorno actual: desde el sandbox nunca se toca la fila
// de producción. onConflict nombra la PK compuesta (key, env) que crea
// supabase/migrations/add_env_app_settings.sql; sin esa migración aplicada el
// upsert choca contra la unicidad vieja de `key` y falla.
export async function saveSetting(key, value) {
  return supabase
    .from('app_settings')
    .upsert({ key, value: String(value), env: APP_ENV }, { onConflict: 'key,env' })
}

// ── Visibilidad de lecciones (ver js/lesson-visibility.js) ─────────────────

// Overrides de visibilidad del entorno actual. En prod devuelve [] SIN
// consultar: producción vive en lecciones.active y la tabla tiene un check que
// prohíbe filas 'prod'. Así el portal real no paga latencia por esto y, más
// importante, no hay forma de que un override lo afecte.
export async function loadVisibilityOverrides() {
  if (APP_ENV === 'prod') return []

  const { data, error } = await supabase
    .from('leccion_visibilidad')
    .select('leccion_id,active,env')
    .eq('env', APP_ENV)

  if (error) {
    // Igual que loadSettings: no lanzamos (esto se await-ea dentro de renders),
    // pero el fallo no se descarta en silencio. Sin overrides el entorno ve la
    // visibilidad de producción, que es el lado conservador.
    console.error('[settings] no se pudo leer leccion_visibilidad:', error.message)
    return []
  }
  return data || []
}

// El switch del ojo en el admin. En prod escribe la columna de siempre; en
// cualquier otro entorno escribe su propio override y no toca lecciones.
export async function saveLessonVisibility(leccionId, active) {
  if (APP_ENV === 'prod') {
    return supabase.from('lecciones').update({ active }).eq('id', leccionId)
  }
  return supabase
    .from('leccion_visibilidad')
    .upsert({ leccion_id: leccionId, env: APP_ENV, active, updated_at: new Date().toISOString() },
            { onConflict: 'leccion_id,env' })
}
