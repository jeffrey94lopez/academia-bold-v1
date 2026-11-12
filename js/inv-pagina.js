// js/inv-pagina.js — arranque de inventario.html: la misma conversación del chat de
// BolBot en una página propia.
import { iniciarConversacion } from './inv-chat.js'

const caja = document.getElementById('inv-raiz')
iniciarConversacion({ via: 'pagina', host: () => caja, alDesplazar: () => caja.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }) })
