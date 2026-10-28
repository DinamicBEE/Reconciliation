# Gestión de diferencias

Porqué de la resolución manual de un cruce: candidatos, importación CSV, guardado y permiso. Lo
visual está en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón: resolución manual
de un cruce (candidatos seleccionables + CSV)". El store de matches resueltos se documenta en
[`conciliacion.md#stores-compartidos`](conciliacion.md#stores-compartidos). Convención: [README](README.md).

<a id="pantalla"></a>
## Pantalla y estado

- La pantalla aplica solo a órdenes `sale_only` o `amount_mismatch`. Con tender inválido, orden
  inexistente u orden ya cruzada (`matched`) se muestra un estado vacío (`isUsable`).
- `tenderMedia` y `orderId` llegan como `input()` desde la ruta (`withComponentInputBinding`). El
  componente entrega esos signals una vez a `DifferenceManagementService.bindOrder`; el servicio
  deriva todo con `computed` y no copia parámetros de ruta con `effect`
  ([ADR-0002](../architecture/decisions/0002-estado-signals-en-servicios.md), punto 6).
- El servicio se provee en el componente. Selección, nota y liquidaciones importadas son
  `linkedSignal` sobre la clave `tender|orden`: al pasar a otra orden se reinician solas.
- La orden se calcula con `crossMatchTransactions` sobre los mocks del tender, el mismo motor que
  "Detalle por tender media", para que el estado de la orden tenga una sola fuente
  ([`conciliacion.md#cruce-de-transacciones`](conciliacion.md#cruce-de-transacciones)).
- La lista de candidatos (`CandidateList`) y la importación de CSV (`SettlementsImport`) son componentes
  aparte que leen y escriben en el `DifferenceManagementService` del anfitrión; los usan esta
  pantalla y el [detalle de línea](conciliacion.md#detalle-de-linea) del proceso de conciliación.
- Selección: un `Map` `settlement.id → origen` que solo guarda las seleccionadas. Con
  `amount_mismatch` arranca con la liquidación que el motor vinculó (origen `backend`); cualquier
  toggle del usuario la deja como `manual`, aunque viniera del motor. `suggestedByBackend` del
  candidato no cambia al tocarla.
- "Monto liquidado" y "Diferencia" del resumen suman lo seleccionado en vivo, no el `settlement`
  original de la orden.

Código: `difference-management.ts`, `data/difference-management.service.ts`,
`data/difference-management.model.ts`.

<a id="candidatos"></a>
## Selección y orden de candidatos

- Pool: todas las liquidaciones del tender, menos las de órdenes ya cruzadas limpiamente
  (`matched`), más las importadas por CSV en la sesión. Se excluye por `orderId` y no por el id de
  `TransactionMatch.settlement`: una orden puede liquidarse en varios depósitos, y excluir solo la
  fila representativa dejaría las demás disponibles para asignarse a otra orden ya cuadrada.
- `findMatchCandidates` es pura: ordena primero la liquidación vinculada por el motor, luego por
  cercanía de monto y de fecha, y corta en 20. El tope deja margen sobre las 15 liquidaciones
  sueltas de RAPPI del mock ([`ventas.md#liquidaciones-mock`](ventas.md#liquidaciones-mock)); la
  lista tiene scroll interno de 5 tarjetas y un filtro por referencia, porque crece tras importar.

Código: `data/candidate-match.util.ts`, `data/difference-management.service.ts` (`candidatePool`),
`difference-management.ts` (`filteredCandidates`).

<a id="importacion-csv"></a>
## Importación CSV

- Formato: `referencia,descripcion,monto,fecha` (fecha `AAAA-MM-DD`), encabezado opcional. Cada
  línea inválida produce un error con su número de línea y no detiene las demás.
- Parser deliberadamente simple: separa por coma, sin comillas ni comas dentro de un campo. Basta
  para el CSV de referencia; con un import real lo sustituye la validación del backend.
- Las filas reciben id `IMP-<tender>-<línea>-<referencia>` y lote `CSV-IMPORTADO`, y solo viven en
  el servicio mientras no cambie la orden.
- El `<input type="file">` se vacía tras leer para poder elegir el mismo archivo otra vez.

Código: `data/csv-import.util.ts`, `difference-management.ts` (`onCsvSelected`).

<a id="guardado"></a>
## Guardado (sin backend) y payload

- No hay endpoint todavía. `save()` arma el payload que se enviaría (`SaveResult`: orden, ids de
  liquidaciones, monto liquidado y nota) y lo registra en `ResolvedMatchesStore` (root, sobrevive la
  navegación) para que la fila agrupada de "Conciliación" refleje el match al volver
  ([`conciliacion.md#stores-compartidos`](conciliacion.md#stores-compartidos)).
- Requiere al menos una liquidación seleccionada y nota no vacía (`canSave`). Como el guardado
  reasigna liquidaciones y no se deshace, el componente pide confirmación con modal antes; luego
  muestra el toast y navega (o emite `saved` en modo incrustado).

Código: `data/difference-management.service.ts` (`save`), `difference-management.ts` (`onSave`).

<a id="permisos"></a>
## Permiso para confirmar un match

Confirmar un match exige el permiso `manage_differences` (matriz 7.16 del DED), distinto de
`view_reconciliation`, que da acceso a la pantalla. Hoy ambos los tienen los mismos roles
(Admin y Tesorería), pero se evalúan por separado. El botón se deshabilita en la plantilla y
`onSave` vuelve a comprobarlo como defensa en profundidad.

Código: `difference-management.ts` (`onSave`), `difference-management.html`.

<a id="estilos"></a>
## Estilos de la pantalla

- `.text-muted` y `.text-destructive` se copian de `shared/styles/_data-table.scss` en vez de
  `@use` del partial completo, que trae reglas que esta pantalla no usa y pesa en el budget de
  estilos del componente.
- `.order-summary-card` usa el grid de `.summary-strip` a 4 columnas (7 campos = 4 + 3); el
  separador izquierdo se quita en cada inicio de fila (`:nth-child(4n + 1)`), porque el
  `:first-child` del partial solo cubre la primera.

Código: `difference-management.scss`.
