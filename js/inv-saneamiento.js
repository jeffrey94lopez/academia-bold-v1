// js/inv-saneamiento.js — quita caracteres que Bold rechaza en el import.
//
// Las tildes aguda y grave aisladas se reemplazan por apóstrofe (una de las dos
// no se usa en español; la otra, como apóstrofe, se puede reemplazar sin perder
// significado). El símbolo ° se reemplaza por # cuando aparece suelto (uso
// típico: "N°5" → "N#5"). El pipe pasa a espacio porque separa palabras. Los demás son prohibidos por seguridad de Bold y se
// borran. Las tildes normales dentro de palabras ("canción") NO se tocan: la
// regex se aplica al carácter crudo, no a tildes combinadas.

const REEMPLAZOS = [
  [/[`´]/g, "'"],   // acentos sueltos → apóstrofe
  [/°/g, '#'],      // grado → numeral
  [/\|/g, ' '],      // pipe: el cliente lo usa como separador ("Ferretería|varios")
  [/[{}%?¡!]/g, ''], // prohibidos sin reemplazo
]

export function sanear(texto) {
  if (texto === null || texto === undefined) return ''
  let s = String(texto)
  for (const [patron, reemplazo] of REEMPLAZOS) s = s.replace(patron, reemplazo)
  return s.replace(/\s+/g, ' ').trim()
}
