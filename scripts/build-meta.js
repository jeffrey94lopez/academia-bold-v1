// Corre en el build de Vercel (ver buildCommand en vercel.json). Escribe los
// dos archivos que el front necesita saber sobre el deploy en curso.
//
// Esto vivía inline en el buildCommand como dos `node -e`, pero Vercel limita
// ese campo a 256 caracteres y el segundo paso ya no entraba.
const fs = require('fs')

// 1. version.json — js/live-updates.js lo consulta para detectar un deploy
//    nuevo y recargar la sesión.
fs.writeFileSync('version.json', JSON.stringify({
  v: process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(),
}))

// 2. js/build-env.js — el entorno de este deploy, que decide en qué fila de
//    app_settings se leen y escriben los toggles de módulos (ver js/env.js).
//    VERCEL_ENV es 'production' solo en la rama de producción; las previews
//    usan el nombre de su rama, así cada una tiene su propio silo de toggles
//    en vez de compartir uno con las demás.
const env = process.env.VERCEL_ENV === 'production'
  ? 'prod'
  : (process.env.VERCEL_GIT_COMMIT_REF || 'preview')

fs.writeFileSync('js/build-env.js',
  '// GENERADO EN EL BUILD por scripts/build-meta.js — no editar.\n' +
  'export const BUILD_ENV = ' + JSON.stringify(env) + '\n')

console.log('[build-meta] BUILD_ENV=' + env)
