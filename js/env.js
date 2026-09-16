// Entorno del deploy y mezcla de app_settings por entorno.
//
// El problema que resuelve: todos los deploys (producción y las previews de
// Vercel del sandbox) apuntan al MISMO proyecto de Supabase, así que los
// toggles de módulos —que son filas de app_settings, no código— eran globales.
// Mover un switch en el admin del sandbox cambiaba el portal real, y con
// app_settings en la publicación de realtime, al instante y sin recargar.
//
// Import-safe (sin DOM, sin red): lo que habla con Supabase vive en
// js/settings.js. Acá solo lo que se puede testear en aislamiento.

// Allowlist a propósito, nunca denylist: cualquier host que no esté en esta
// lista resuelve a 'sandbox', que es el lado inocuo (un entorno desconocido
// jamás escribe sobre producción). El precio es que si el dominio de
// producción cambia o se agrega otro, hay que meterlo ACÁ; si no, el portal
// real empieza a leer los toggles del sandbox. Es el único punto frágil del
// esquema, y por eso es una constante a la vista y no una heurística sobre el
// hostname. El embed en el POS de Bold es un iframe de este mismo dominio, así
// que resuelve 'prod' como corresponde.
export const PROD_HOSTS = ['academia.localizadoc.com']

export function resolveEnv(hostname) {
  return PROD_HOSTS.includes(hostname) ? 'prod' : 'sandbox'
}

// En Node (tests) no existe `location`: el hostname vacío cae en 'sandbox'.
export const APP_ENV = resolveEnv(
  typeof location !== 'undefined' ? location.hostname : '')

// Mezcla filas de app_settings de dos entornos: 'prod' es la base y el entorno
// actual la pisa clave por clave. Así el sandbox hereda producción y solo se
// separa en las claves que alguien tocó allá — no arranca de cero ni hay que
// sembrarlo.
//
// En 'prod' el segundo paso no corre: da igual qué filas de otros entornos
// vengan en el payload, producción solo se mira a sí misma. Eso es lo que
// corta la fuga incluso cuando realtime reparte el cambio del sandbox a todos
// los suscriptores.
export function mergeSettings(rows, env = APP_ENV) {
  const map = {}
  for (const r of rows || []) if (r.env === 'prod') map[r.key] = r.value
  if (env !== 'prod') {
    for (const r of rows || []) if (r.env === env) map[r.key] = r.value
  }
  return map
}
