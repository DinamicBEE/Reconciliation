# Ventas ("Resumen de venta") y mocks compartidos

Porqué del modelo de venta, de la pantalla "Resumen de venta" sobre `GET /sales`, de "Reprocesar"
(`POST /sales/capture`) y de los mocks de ventas y liquidaciones que también usa conciliación. Lo
visual (drawer, filtros, tabla) está en [MASTER.md](../../design-system/conciliation/MASTER.md),
"Patrón: Drawer de detalle", "Patrón: filtros de tabla" e "Invariantes del mock de ventas
(`sales-mock.data.ts`)". El ejemplo de arquitectura de esta pantalla está en el §13 de
[`frontend-angular.md`](../architecture/frontend-angular.md). Convención: [README](README.md).

<a id="modelo-de-venta"></a>
## Modelo de venta (comprobante fiscal, NetSuite, referencia de conciliación)

`Sale` es el modelo del POS que usan el mock y la conciliación; los campos con nombre neutro se
etiquetan según el país activo (`CountryProfile`).

- **Comprobante fiscal (`ElectronicInvoice`)**: CFDI en México (SAT) o factura electrónica en
  Colombia (DIAN). Es obligatorio para toda venta, sin importar quién compre. `series` + `number`
  son serie y folio del CFDI o prefijo y consecutivo de la resolución DIAN; `fiscalId` es el UUID
  del timbre SAT o el CUFE de la DIAN, lo que codifica el QR y permite consultar el documento
  (`CountryProfile.invoice.queryUrl`). `cfdiUse` y `paymentMethod` solo existen en CFDI
  (`hasCfdiFields`). No confundir con `Sale.folio`, el folio interno del POS sin validez fiscal.
- **Cliente**: `taxId` es RFC (MX) o NIT/cédula (CO); un cliente sin identificar lleva el id
  genérico del país (`taxId.genericId`). `personType` y `taxRegime` son opcionales: un receptor
  genérico ("Cliente mostrador") no los trae y el Drawer muestra un texto de respaldo.
- **Pagos**: `payments` es un arreglo para admitir pagos divididos. `Sale.reference` existe aparte
  para que la tabla no tenga que asumir "el primer pago".
- **`netsuite`** (CU4/CU11 del DED): asiento contable cuando la venta ya está contabilizada; `null`
  mientras no. La contabilización es independiente de la conciliación bancaria.
- **`reconciliation`** (CU4/CU7): la conciliación registrada y su fecha; `null` si la venta sigue
  por conciliar o fue desconciliada. Es la referencia, distinta de `reconciliationStatus` (el estado).
- **`subsidiariaId`**: id del catálogo de sesión (`CatalogService.subsidiarias()`), no un valor
  propio del mock; alimenta el filtro "Empresa".
- `Store` vive en `sale.model.ts` mientras tenga un solo consumidor.

Código: `src/app/shared/models/sale.model.ts`, `src/app/features/sales-dashboard/data/sale.util.ts`.

<a id="resumen-de-venta"></a>
## Pantalla y estado de "Resumen de venta"

- La tabla lee `GET /sales` con paginación en el servidor (`page` base 1, `pageSize` ≤ 100,
  `nzFrontPagination` apagado y `nzTotal` del backend). Cualquier cambio de filtro vuelve a la
  página 1; un `debounceTime` de 300 ms agrupa cambios seguidos y evita consultar en cada tecla;
  una consulta nueva cancela la anterior (`switchMap`). `reload()` sube un contador que repite la
  misma consulta sin viajar al backend.
- `SalesDashboardService` se provee en el componente (`SalesDashboard.providers`): el estado vive
  lo que vive la pantalla.
- Filtros: rango de fechas, tienda (ubicaciones del login vía `CatalogService`), medio de pago y
  estado (`SalesCatalogService`) y búsqueda por folio, documento o cliente. Todos viajan como ids
  del backend. La "x" del range-picker emite `[undefined, undefined]`; se normaliza a `null`.
- Filtro "Empresa": el select existe pero va deshabilitado con tooltip, porque `GET /sales` aún no
  filtra por subsidiaria y las ubicaciones del login no traen su subsidiaria.
- Estado de la fila: `ReconciliationStatusTag` pinta los 3 estados del portal; el `code` del
  backend usa los mismos valores y un código desconocido cae a "por conciliar".
- Drawer: el backend no expone `GET /sales/{id}`, así que el detalle muestra solo lo que trae la
  fila del listado (sin productos, impuestos por línea, pagos ni datos fiscales).

Código: `src/app/features/sales-dashboard/sales-dashboard.*`, `data/sales-dashboard.service.ts`.

<a id="api-de-ventas"></a>
## `GET /sales`: paginación y filtros

- Core Service, permiso `view_dashboard` (Guia_Integracion_Frontend §8.1). Solo lee lo ya
  capturado; traer ventas nuevas de Facturiza es `POST /sales/capture` (ver
  [#reprocesar](#reprocesar)).
- Una fila es un documento: factura (`INVOICE`) o nota crédito (`CREDIT_NOTE`). Los importes llegan
  tal como están guardados: en una nota crédito son positivos.
- `tenderMedia` es el medio de pago principal (el de mayor monto) o `null` sin pagos; `mixed` y
  `paymentCount` indican pagos adicionales. `time` es `null` en documentos capturados antes de que
  el backend guardara la hora.
- Filtros `store`, `tenderMedia` y `status`: ids de los combos, no códigos ni nombres. `page`
  empieza en 1 y `pageSize` va de 1 a 100 (`SALES_MAX_PAGE_SIZE`).

Código: `src/app/features/sales-dashboard/data/sales-api.service.ts`.

<a id="catalogos-de-filtros"></a>
## Catálogos de filtros (medios de pago, `pendingReview`)

- `GET /sales/catalogs/tender-media` y `GET /sales/catalogs/reconciliation-statuses` (Core
  Service, Guia_Integracion_Frontend §7.2). El `id` de cada opción es el valor de los filtros
  `tenderMedia` y `status` de `GET /sales`.
- Exigen `view_dashboard`: sin el permiso no se piden (darían 403).
- `pendingReview = true`: el código llegó en una venta sin estar sembrado y aún no se revisa; el
  combo lo marca "(por revisar)". `dianCode` es el código del medio en el catálogo 12 de la DIAN
  (10 Efectivo, 48 Tarjeta Crédito, 49 Tarjeta Débito, ZZZ Otro…) según la homologación
  Simphony → DIAN; `null` sin homologar y ausente en backends anteriores.
- Subsidiarias y tiendas no salen de aquí sino de las listas del login (`CatalogService`).
  `GET /sales/catalogs/stores` no se usa por decisión de producto (ver
  `docs/analisis-front-vs-back-dev`).
- Carga perezosa (`ensureLoaded`, una vez por sesión) con un `rxResource` por catálogo para que la
  falla de uno no vacíe al otro; llamadas posteriores reintentan solo los fallidos. Al cerrar
  sesión `params` pasa a `undefined` y vuelven a vacío. El aviso de error lo da
  `httpErrorAlertInterceptor`.

Código: `src/app/features/sales-dashboard/data/sales-catalog.service.ts`.

<a id="reprocesar"></a>
## "Reprocesar" (`POST /sales/capture`)

- Capture Service, permiso `capture_sales` (`AccessControlService.canReprocessSales`, ver
  [`sesion-y-acceso.md#permisos-efectivos`](sesion-y-acceso.md#permisos-efectivos)). Sin el
  permiso el botón no se muestra; el método del componente repite la comprobación como defensa en
  profundidad.
- La captura es síncrona desde Facturiza, para una o varias tiendas y un día o rango (hasta 31
  tiendas × días), e idempotente: repetirla no duplica documentos (cuentan como omitidos). El front
  la pide para un día y una tienda, por eso el botón solo se habilita cuando los filtros acotan a
  un día exacto y una tienda (`reprocessTarget()`); el tooltip va en un `<span>` porque un botón
  `disabled` no dispara hover.
- Respuestas: 200 todo OK, 207 mixto y 502 con el mismo `CaptureBatchResult` si Facturiza no
  respondió en ninguna captura. Estados: `OK`, `INCOMPLETE` (faltan o fallaron documentos, o hay
  conflicto de folio), `ERROR` (Facturiza no respondió o se interrumpió) y `RUNNING` (ya se estaba
  capturando).
- La petición va con `SKIP_HTTP_ERROR_ALERT`: los errores no pasan por la alerta genérica porque el
  502 trae un resultado válido y los 400/404/409 llegan como `ProblemDetail` con `detail`.
  `describeCaptureResult` / `describeCaptureError` traducen resultado o error (403 sin permiso, 0
  sin conexión, 409 captura en curso) a un aviso; `reload` indica que entraron documentos nuevos y
  hay que recargar la tabla.
- `nzOnOk` devuelve una Promise para que el botón quede en carga mientras dura la captura.

Código: `sales-dashboard.ts`, `sales-dashboard.html`, `data/capture-result.util.ts`,
`data/sales-api.service.ts`.

<a id="estado-de-conciliacion-de-venta"></a>
## Estado de conciliación de una venta (4 a 3 estados)

`Sale.reconciliationStatus` es un `MatchStatus` de 4 estados por orden (el mismo tipo y tag que
"Gestión de diferencias"); el Drawer lo usa porque necesita esa granularidad. La columna "Estado"
de la tabla usa en cambio el `ReconciliationStatus` de 3 estados de "Conciliación", para que toda
la app hable el mismo idioma. `saleReconciliationStatus()` traduce con el criterio de `statusFor()`
en `group-by-tender-day.util.ts`, aplicado a una orden: `matched` → conciliado; `sale_only` (aún
sin liquidación) → por conciliar; cualquier otra discrepancia (monto distinto, liquidación sin
venta) → desconciliado. Ver también
[`conciliacion.md#agrupacion-por-tender-y-dia`](conciliacion.md#agrupacion-por-tender-y-dia).

Impuestos: sin tasa por producto, cada impuesto del país activo (IVA 16 % MX, IVA 19 % CO) se aplica
a la base gravable de toda la venta (subtotal menos descuento).

Código: `src/app/features/sales-dashboard/data/sale.util.ts`,
`src/app/shared/components/sale-status-tag/sale-status-tag.ts`.

<a id="exportacion"></a>
## Exportación del listado

- Permiso propio `export_reports` (matriz 7.16 del DED), independiente de `view_dashboard`: ver la
  pantalla no implica poder exportar. Sin él el botón se oculta y el método también lo comprueba.
- Exporta todo lo filtrado, no solo la página visible: `listAll` recorre `GET /sales` en páginas de
  100 porque el backend no tiene `GET /sales/export`.
- CSV con BOM UTF-8 para que Excel respete los acentos; la columna de ubicación toma su etiqueta del
  país activo.

Código: `src/app/features/sales-dashboard/data/sale-list-export.util.ts`,
`data/sales-api.service.ts`, `sales-dashboard.ts`.

<a id="mock-de-ventas"></a>
## Mock de ventas: generador y datos derivados

Las invariantes (total > $1,000, ≥ 5 productos, ≥ 2 métodos de pago, comprobante en toda venta)
están en MASTER.md, "Invariantes del mock de ventas (`sales-mock.data.ts`)". Además:

- 7 ventas de "hoy" (27 ago) escritas a mano para la demo del Drawer (contacto, identificación
  fiscal, descuento, pago mixto en V-2007); el resto de agosto lo genera `buildDay` para dar volumen
  a la paginación y los filtros. `buildDay` salta el 16 y el 23 de agosto (ver
  [#liquidaciones-mock](#liquidaciones-mock)).
- Todo es determinístico por índice (sin `Math.random()`) para que los datos no cambien entre
  builds. Los pools y `buildDay` deben declararse antes de `RAW_SALES`, que llama a `buildDay` al
  evaluar el módulo: con `const` declarados después, los pools llegarían `undefined`.
- Todas las ventas pertenecen a la subsidiaria 1, la única sembrada en el backend.
- Solo V-2001/2/3 traen `netsuite`; V-2002 está contabilizada pero sin conciliar, a propósito sin
  `reconciliation`.
- `withFiscalData()` arma comprobante e identificación fiscal del país activo para toda venta: el
  cliente "en bruto" solo trae `vatResponsible`, que se traduce a régimen (SAT 601/612/616, DIAN
  48/49) y a RFC/NIT con formato real. Sin `personType` es receptor genérico y lleva el id genérico
  del país. Una serie CFDI / prefijo DIAN global para las 4 sucursales; consecutivo desde 84210 más
  el índice. `fiscalId` es un hex FNV-1a + LCG con la forma del UUID o CUFE real, no un hash real.
  `issuedAt` usa el offset fiscal del país (-06:00 MX, -05:00 CO).
- `withPayment()` respeta `payments` explícito (V-2007: tarjeta cubre cuenta + IVA, efectivo la
  propina) y, si no, reparte el total 80/20 con `SECONDARY_TENDER`.

Código: `src/app/features/sales-dashboard/data/sales-mock.data.ts`.

<a id="liquidaciones-mock"></a>
## Mock de liquidaciones derivado de ventas

El detalle (fuente única, derivación por `reconciliationStatus`, abonos de V-2007, huérfanas) está
en MASTER.md, "Fuente única: `sales-settlements.mock-data.ts` deriva de `sales-dashboard`". Lo que
el código asume:

- `shared/mock-data` importa de `features/sales-dashboard`: es la única excepción documentada a
  "shared no importa de features"; queda pendiente mover el mock de ventas a `shared/`.
- `orderId = sale.reference`, la referencia visible en "Resumen de venta", para mantener la
  trazabilidad entre pantallas.
- Ninguna venta se excluye por `cancelada`: V-2005 es la única `amount_mismatch` del mock.
- `MISMATCH_RATIO = 0.88` es una proporción, no un delta fijo, para seguir válida si cambia el
  total. En los abonos de V-2007 el último se calcula por resta para que la suma cuadre exacta.
- Las liquidaciones sin venta están el 16 y 23 de agosto (únicos días sin ventas) para producir un
  grupo "Sin venta" limpio en vez de mezclarse con ventas de ese día+medio. Sus referencias nunca
  coinciden con un `sale.reference`.
- 14 liquidaciones Rappi sueltas más `L-ORPHAN-RAPPI-01` dan 15 candidatas el 23 de agosto para la
  demo de "Gestión de diferencias" (ver [`diferencias.md#candidatos`](diferencias.md#candidatos)).

Código: `src/app/shared/mock-data/sales-settlements.mock-data.ts`.

<a id="mock-salud-por-medio-de-pago"></a>
## Mock de salud de conciliación por medio de pago

`MOCK_TENDER_MEDIA_STATUS` alimenta el KPI "Medios de pago" de "Conciliación" (solo lectura, sin
navegación). Se mantiene en `shared/mock-data` para que otra pantalla pueda reutilizarlo.

Código: `src/app/shared/mock-data/tender-media-status.mock-data.ts`.
