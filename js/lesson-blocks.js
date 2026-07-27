// Decide qué bloques tiene una lección a partir del `contenido` crudo.
// Import-safe (sin DOM, sin supabase): la I/O y el render viven en los
// consumidores.
//
// La columna `contenido` guarda DOS formatos: un string JSON con el array de
// bloques (el moderno) y HTML crudo escrito a mano (el legacy). Antes cada
// consumidor decidía por su cuenta y la copia del editor caía a [], que al
// guardar borraba la lección. Acá el legacy no es un caso especial: es un
// bloque más, de tipo 'html'.
//
// Propiedad central: ninguna rama que reciba contenido devuelve []. El array
// vacío es exclusivo de las entradas vacías.
export function parseLessonBlocks(raw) {
  // Defensivo: nadie debería pasar un array (los llamadores pasan el crudo de
  // la base, que es text), pero sin esta rama caería en "no-string" y se
  // perdería justo lo que hay que preservar.
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch (_) {}
  return [{ type: 'html', html: raw }]
}
