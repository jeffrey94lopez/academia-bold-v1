// js/onboarding-steps.js — pasos, subpasos y avance del recorrido guiado.
//
// Módulo puro, sin DOM: las pantallas (Task 5) marcan sus anclas con
// `data-onb="<ancla>"` y el controlador (Task 4) llama avanzar() con los
// eventos del usuario. Reducer inmutable: cuando el evento no corresponde al
// subpaso actual, devuelve la MISMA referencia de estado (identidad).

export const PASOS = [
  'bienvenida', 'crear_item', 'ver_items', 'venta', 'facturas', 'inventario', 'gasto', 'cierre',
]

export const TOTAL_PASOS = 6

export function numeroPaso(id) {
  const n = PASOS.indexOf(id)
  // bienvenida (0) y cierre (7) no cuentan como "paso N de 6".
  return n >= 1 && n <= TOTAL_PASOS ? n : null
}

// Tabla de subpasos por paso. Los textos son cortos, en tuteo, describiendo
// lo que el cliente ve en el Bold POS real (ver "El recorrido" del spec).
export const SUBPASOS = {
  crear_item: [
    { ancla: 'menu-items', pantalla: 'inicio', avanza: 'click', texto: 'Toca Ítems en el menú para ver tu lista de productos.' },
    { ancla: 'btn-nuevo-item', pantalla: 'items-lista', avanza: 'click', texto: 'Toca + Nuevo ítem para crear tu primer producto.' },
    { ancla: 'f-nombre', pantalla: 'item-crear', avanza: 'campo', texto: 'Escribe el nombre del ítem, tal como lo vendes.' },
    { ancla: 'f-precio-base', pantalla: 'item-crear', avanza: 'campo', texto: 'Ingresa el precio base, sin impuestos.' },
    { ancla: 'f-impuesto', pantalla: 'item-crear', avanza: 'campo', texto: 'Elige el impuesto que le aplica a este ítem.' },
    { ancla: 'f-total', pantalla: 'item-crear', avanza: 'info', texto: 'El precio total de venta se calcula solo: precio base más impuesto.' },
    { ancla: 'f-costo', pantalla: 'item-crear', avanza: 'info', texto: 'El costo es opcional, pero te ayuda a calcular tu utilidad.' },
    { ancla: 'f-existencias-toggle', pantalla: 'item-crear', avanza: 'click', texto: 'Actívalo si quieres controlar cuántas unidades tienes.' },
    { ancla: 'f-existencias', pantalla: 'item-crear', avanza: 'campo', texto: 'Escribe cuántas unidades tienes disponibles.' },
    { ancla: 'btn-crear-item', pantalla: 'item-crear', avanza: 'click', texto: 'Toca Crear ítem para guardarlo.' },
  ],
  ver_items: [
    { ancla: 'fila-item-cliente', pantalla: 'items-lista', avanza: 'info', texto: 'Así se ve tu ítem en la lista, con precio y existencia.' },
    { ancla: 'col-existencia', pantalla: 'items-lista', avanza: 'info', texto: 'Aquí ves cuántas unidades te quedan.' },
    { ancla: 'switch-activo', pantalla: 'items-lista', avanza: 'info', texto: 'Este switch activa o desactiva el ítem para la venta.' },
    { ancla: 'btn-editar', pantalla: 'items-lista', avanza: 'info', texto: 'Toca el lápiz cuando necesites editar el ítem.' },
    { ancla: 'buscador-items', pantalla: 'items-lista', avanza: 'info', texto: 'Usa el buscador para encontrar un ítem rápido.' },
  ],
  venta: [
    { ancla: 'btn-nueva-venta', pantalla: 'items-lista', avanza: 'click', texto: 'Toca + Nueva venta para empezar a vender.' },
    { ancla: 'producto-cliente', pantalla: 'pos', avanza: 'click', texto: 'Toca tu producto para agregarlo al carrito.' },
    { ancla: 'carrito-lineas', pantalla: 'pos', avanza: 'info', texto: 'Si tocas el producto otra vez agregas otra línea; la cantidad se cambia en la casilla.' },
    { ancla: 'btn-vender', pantalla: 'pos', avanza: 'click', texto: 'Toca Vender para continuar con el pago.' },
    { ancla: 'metodo-efectivo', pantalla: 'pago', avanza: 'click', texto: 'Elige Efectivo como método de pago.' },
    { ancla: 'opciones-rapidas', pantalla: 'pago-efectivo', avanza: 'info', texto: 'Estas opciones rápidas te ayudan a calcular el cambio.' },
    { ancla: 'btn-pagar', pantalla: 'pago-efectivo', avanza: 'click', texto: 'Toca Pagar para completar la venta.' },
    { ancla: 'venta-completada', pantalla: 'venta-ok', avanza: 'info', texto: 'Tu venta quedó registrada; desde aquí podrías enviarla o imprimirla.' },
  ],
  facturas: [
    { ancla: 'menu-ingresos', pantalla: 'venta-ok', avanza: 'click', texto: 'Toca Ingresos en el menú para ver tus ventas.' },
    { ancla: 'filtros-facturas', pantalla: 'facturas-lista', avanza: 'info', texto: 'Con estos filtros buscas por fecha, forma de pago o estado.' },
    { ancla: 'factura-cliente', pantalla: 'facturas-lista', avanza: 'click', texto: 'Toca tu venta para ver el detalle completo.' },
    { ancla: 'factura-detalle', pantalla: 'factura-detalle', avanza: 'info', texto: 'Aceptada es el estado ante la DIAN, Contado es la forma de pago y Pagada confirma que ya recibiste el dinero.' },
  ],
  inventario: [
    { ancla: 'menu-flujo', pantalla: 'factura-detalle', avanza: 'click', texto: 'Toca Flujo de inventario para ver los movimientos de tu ítem.' },
    { ancla: 'ledger-entrada', pantalla: 'flujo', avanza: 'info', texto: 'La entrada muestra las existencias iniciales que registraste.' },
    { ancla: 'ledger-salida', pantalla: 'flujo', avanza: 'info', texto: 'La salida en rojo es por tu venta; así queda la existencia resultante.' },
  ],
  gasto: [
    { ancla: 'menu-egresos', pantalla: 'flujo', avanza: 'click', texto: 'Toca Egresos en el menú para registrar un gasto.' },
    { ancla: 'btn-nuevo-gasto', pantalla: 'gastos-lista', avanza: 'click', texto: 'Toca + Nuevo gasto para crear uno.' },
    { ancla: 'g-metodo', pantalla: 'gasto-crear', avanza: 'campo', texto: 'Elige el método de pago del gasto.' },
    { ancla: 'g-categoria', pantalla: 'gasto-crear', avanza: 'campo', texto: 'Elige la categoría que mejor describe el gasto.' },
    { ancla: 'g-valor', pantalla: 'gasto-crear', avanza: 'campo', texto: 'Ingresa el valor del gasto.' },
    { ancla: 'g-turno', pantalla: 'gasto-crear', avanza: 'info', texto: 'Asociarlo al turno hace que afecte el cierre de caja.' },
    { ancla: 'btn-crear-gasto', pantalla: 'gasto-crear', avanza: 'click', texto: 'Toca Crear gasto para guardarlo.' },
    { ancla: 'gasto-detalle', pantalla: 'gasto-detalle', avanza: 'info', texto: 'Así queda tu gasto registrado, con un número único.' },
  ],
}

function coincide(subpaso, evento) {
  if (evento.tipo === 'click') return subpaso.avanza === 'click' && evento.ancla === subpaso.ancla
  if (evento.tipo === 'campo') return subpaso.avanza === 'campo' && evento.ancla === subpaso.ancla && evento.valido === true
  if (evento.tipo === 'siguiente') return subpaso.avanza === 'info'
  return false
}

export function subpasoActual(estado) {
  const subpasos = SUBPASOS[estado.step]
  if (!subpasos) return null
  return subpasos[estado.sub] ?? null
}

export function avanzar(estado, evento) {
  const actual = subpasoActual(estado)
  if (!actual || !coincide(actual, evento)) return estado

  const subpasos = SUBPASOS[estado.step]
  const siguienteSub = estado.sub + 1
  if (siguienteSub < subpasos.length) return { ...estado, sub: siguienteSub }

  const siguientePaso = PASOS[PASOS.indexOf(estado.step) + 1]
  return { ...estado, step: siguientePaso, sub: 0 }
}
