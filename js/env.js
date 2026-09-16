// Entorno del deploy y mezcla de app_settings por entorno.
//
// El problema que resuelve: todos los deploys apuntan al MISMO proyecto de
// Supabase, así que los toggles de módulos —que son filas de app_settings, no
// código— eran globales. Mover un switch en el admin del sandbox cambiaba el
// portal real, y con app_settings en la publicación de realtime, al instante y
// sin recargar.
//
// Import-safe (sin DOM, sin red): lo que habla con Supabase vive en
// js/settings.js. Acá solo lo que se puede testear en aislamiento.
import { BUILD_ENV } from './build-env.js'

// Segunda red, no el mecanismo principal. El hostname NO alcanza para decidir
// el entorno: Vercel sirve producción en al menos tres nombres
// (academia.localizadoc.com, academia-bold-v1.vercel.app y el alias
// …-git-master-….vercel.app) y además le da a CADA deploy de producción su
// propia URL …-<hash>-….vercel.app. Esa lista es infinita y un allowlist nunca
// puede estar completo. Por eso manda BUILD_ENV, que sale del build, y esto
// solo cubre el caso de que el build no haya corrido: el dominio propio fuerza
// 'prod' igual y producción nunca termina leyendo los toggles del sandbox.
export const PROD_HOSTS = [
  'academia.localizadoc.com',
  'academia-bold-v1.vercel.app',
  'academia-bold-v1-git-master-jeffreymartinezhn-projects.vercel.app',
]

// Cualquiera de las dos señales que diga "producción" gana. Lo desconocido cae
// en 'sandbox', que es el lado inocuo: un entorno que no reconocemos escribe su
// propia fila en vez de pisar la de producción.
export function resolveAppEnv(buildEnv, hostname) {
  if (buildEnv === 'prod') return 'prod'
  if (PROD_HOSTS.includes(hostname)) return 'prod'
  return buildEnv || 'sandbox'
}

// En Node (tests) no existe `location`: el hostname queda vacío y decide
// BUILD_ENV, que en el repo es 'sandbox'.
export const APP_ENV = resolveAppEnv(
  BUILD_ENV, typeof location !== 'undefined' ? location.hostname : '')

// Mezcla filas de app_settings de dos entornos: 'prod' es la base y el entorno
// actual la pisa clave por clave. Así el sandbox hereda producción y solo se
// separa en las claves que alguien tocó allá — no arranca de cero ni hay que
// sembrarlo.
//
// En 'prod' el segundo paso no corre: da igual qué filas de otros entornos
// vengan en el payload, producción solo se mira a sí misma. Eso es lo que corta
// la fuga incluso cuando realtime reparte el cambio del sandbox a todos los
// suscriptores.
export function mergeSettings(rows, env = APP_ENV) {
  const map = {}
  for (const r of rows || []) if (r.env === 'prod') map[r.key] = r.value
  if (env !== 'prod') {
    for (const r of rows || []) if (r.env === env) map[r.key] = r.value
  }
  return map
}
