// js/inv-pagina.js — arranque de inventario.html: la misma conversación del chat de
// BolBot en una página propia. En producción la herramienta todavía no existe.
import { APP_ENV } from './env.js'
import { iniciarConversacion } from './inv-chat.js'

if (APP_ENV === 'prod') location.replace('index.html')
else {
  const caja = document.getElementById('inv-raiz')
  iniciarConversacion({ host: () => caja, alDesplazar: () => caja.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }) })
}
