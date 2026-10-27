// js/inv-pagina.js — arranque de inventario.html. En producción la herramienta
// todavía no existe: se vuelve al portal.
import { APP_ENV } from './env.js'
import { montarConversor } from './inv-ui.js'

if (APP_ENV === 'prod') location.replace('index.html')
else montarConversor(document.getElementById('inv-raiz'))
