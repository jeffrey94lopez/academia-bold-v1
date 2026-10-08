// js/cruce-vertical.js — registro de los cruces entre verticales del bot.
//
// Una fila por cruce: se inserta cuando el bot lo OFRECE (con `acepto` en null)
// y se marca cuando el usuario responde. No son dos filas: "ofrecido" y
// "aceptado" son dos estados del mismo hecho, y contarlos aparte duplicaria el
// volumen en la analitica.
//
// Responde tres preguntas: si una leccion deberia estar marcada 'ambas'
// (agrupando por leccion_id), si un comercio esta mal clasificado (agrupando
// por account_id), y cuanto pasa esto.
//
// DOS RESTRICCIONES DE RLS que moldean este archivo (no "simplificar"):
//  - El `id` lo genera el CLIENTE (la columna no tiene default). Un
//    `.insert().select('id')` usa RETURNING, que exige una policy de SELECT;
//    darle lectura a anon expondria los account_id de los comercios.
//  - Marcar la respuesta va por la RPC `responder_cruce`, NO por `.update()`:
//    un UPDATE ... WHERE id necesita tambien SELECT para hallar la fila, y
//    sin esa policy no actualiza nada y no da error (queda todo en null).
import { supabase } from './supabase.js'

/** Inserta el cruce ofrecido. Devuelve el id que generó, o null si falló. */
export async function registrarCruce({ conversationId, accountId, verticalComercio, cross }) {
  if (!cross?.leccion_id) return null
  const id = crypto.randomUUID()
  try {
    // Sin .select(): ver nota del encabezado.
    const { error } = await supabase
      .from('bot_cruces_vertical')
      .insert({
        id,
        conversation_id:    conversationId || null,
        account_id:         accountId || null,
        vertical_comercio:  verticalComercio,
        vertical_contenido: cross.vertical,
        leccion_id:         cross.leccion_id,
        leccion_titulo:     cross.titulo || null,
      })
    // supabase-js NO lanza en error: sin este chequeo un INSERT bloqueado por
    // RLS dejaria la analitica vacia sin que nadie se entere.
    if (error) { console.warn('[cruce-vertical] insert:', error.message); return null }
    return id
  } catch (e) {
    console.warn('[cruce-vertical] insert:', e.message)
    return null
  }
}

/** Marca si el usuario aceptó ver el contenido de la otra vertical. */
export async function marcarCruce(id, acepto) {
  if (!id) return
  try {
    const { error } = await supabase.rpc('responder_cruce', { p_id: id, p_acepto: acepto })
    if (error) console.warn('[cruce-vertical] responder_cruce:', error.message)
  } catch (e) {
    console.warn('[cruce-vertical] responder_cruce:', e.message)
  }
}
