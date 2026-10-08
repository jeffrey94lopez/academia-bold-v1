-- Borra 4 de las 5 copias apagadas que creó clasificar-lecciones-ambas.sql.
-- 2026-10-08.
--
-- Motivo: la facturación en restaurantes NO es una lección aparte. Vive dentro
-- de «Creación de pedido», en el paso del cobro: "Confirmar pago ... para
-- registrar el cobro y generar el comprobante o factura electrónica". O sea que
-- el contenido ya existe y las copias de retail no hay que adaptarlas: sobran.
--
-- La copia de créditos y apartados SÍ se queda: ese flujo no está documentado
-- en ninguna lección de restaurantes y de verdad funciona distinto.
--
-- Seguro de correr dos veces.

delete from public.lecciones
where vertical = 'restaurantes'
  and active = false
  and slug in (
    'venta-por-medio-de-factura-electronica-restaurantes',
    'venta-por-medio-de-factura-electronica-desde-la-app-bold-pos-restaurantes',
    'venta-por-medio-de-comprobante-restaurantes',
    'venta-por-medio-de-comprobante-desde-la-app-bold-pos-restaurantes'
  );

-- Debe quedar 1: la de créditos.
select count(*) as copias_apagadas_restantes
from public.lecciones
where vertical = 'restaurantes' and active = false;
