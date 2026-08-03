// Gestor de una suscripción realtime que se puede detener y REANUDAR.
//
// Bug #7: el realtime de lecciones se creaba una sola vez (dentro de
// renderLessons, al cargar). Al salir de la pestaña, main.js removía el canal y
// anulaba el cleanup, pero al VOLVER nadie re-suscribía (renderLessons no se
// vuelve a llamar) → el realtime quedaba muerto para siempre. Este gestor separa
// el ciclo de vida del render: iniciar() es idempotente y detener() no impide
// reanudar después.
//
// Recibe las operaciones con efecto (subscribe/remove) por inyección → la máquina
// de estados es pura y testeable sin supabase.

export function crearSuscripcionReanudable({ subscribe, remove }) {
  let handle = null

  return {
    iniciar() {
      if (handle) return handle   // ya suscrito: no duplicar canales
      handle = subscribe()
      return handle
    },
    detener() {
      if (!handle) return
      remove(handle)
      handle = null
    },
    activa() {
      return handle !== null
    },
  }
}
