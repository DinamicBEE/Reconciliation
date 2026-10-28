# Conciliación bancaria

Porqué del código de corridas de conciliación, el proceso paso a paso, el extracto bancario, el
cruce venta contra liquidación, la agrupación por medio de pago y día y los stores compartidos. Lo
visual y los flujos están en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón:
conciliaciones", "Patrón: cruce transacción a transacción entre dos fuentes", "Patrón: conciliación
por tender media y fecha" y "Patrón: importar movimientos bancarios". Los mocks de ventas y
liquidaciones están en [`ventas.md`](ventas.md#liquidaciones-mock). Convención: [README](README.md).

<a id="corridas"></a>
## Corridas de conciliación (modelo, store y estado)

- Una corrida (`ReconciliationRun`, id `CON-NNNN`) compara las ventas del POS contra los
  movimientos del banco de una empresa, un restaurante y un periodo. Su estado
  (`conciliado` / `pendiente` / `desconciliado`) es de la corrida completa: no es
  `ReconciliationStatus`, que es por día + medio de pago, y su tercer valor es "Pendiente" (aún no
  termina), no "Por conciliar".
- `ReconciliationRunsStore` es `root` porque la tabla (`ReconciliationService`, por ruta) y la
  comparativa (que busca la corrida por el `:runId` de la URL) deben ver la misma corrida recién
  creada al navegar. Vive en memoria: se pierde al recargar.
- Sin endpoint: `MOCK_RECONCILIATION_RUNS` se reemplaza por el listado del backend cuando exista.
  Empresas y restaurantes usan las etiquetas de los catálogos del DEV (Coctel del Mar, Hipermar
  Fish).
- `create` asigna el siguiente id, estado `pendiente` y `createdAt` con la fecha local real (no el
  "hoy" fijo de los mocks). El resultado final lo fijará el proceso de comparación.
- Reglas de fila: "Desconciliar" solo sobre `conciliado`; "Descargar" solo sobre una corrida
  terminada (no `pendiente`). `markDesconciliado` no revalida la regla: la aplica la tabla.
- El CSV de "Descargar" lleva solo los datos generales de la corrida (encabezado y una fila).

Código: `src/app/features/reconciliation-dashboard/data/reconciliation-run.model.ts`,
`reconciliation-run.util.ts`, `reconciliation-runs.store.ts`, `reconciliation-runs.mock-data.ts`,
`run-status-tag/run-status-tag.ts`.

<a id="tabla-de-conciliacion"></a>
## Tabla de "Conciliación bancaria" y modal "Nueva conciliación"

- Una fila por corrida. Filtros: estatus y rango de la fecha de creación (columna "Fecha"), no del
  periodo conciliado. El rango es inclusivo por día local.
- La "x" del `nz-range-picker` emite `[undefined, undefined]` en lugar de `null`;
  `setDateRange` y `onNewPeriodChange` lo normalizan a `null`.
- Permisos: "Nueva conciliación" exige `import_settlements` (matriz 7.16 del DED; no hay permiso
  propio para iniciar conciliaciones), el mismo que protege la ruta del proceso. "Descargar" exige
  además `export_reports`. La tabla y la comparativa exigen `view_reconciliation`.
- "Desconciliar" es irreversible en la sesión y se confirma con un modal.
- El modal toma empresa y restaurante de los catálogos de la sesión (`CatalogService`, lo que trajo
  el login). La tienda se filtra por la empresa elegida con la subsidiaria de cada ubicación de `GET /catalogs/ubicaciones` (`OrganizationCatalogService`); si esa relación no está cargada, muestra las de la sesión. Cambiar de empresa descarta la tienda. Los tres campos son
  obligatorios; al iniciar se crea la corrida y se navega a `/conciliacion/:runId/proceso`.
- Los CSV se generan con BOM UTF-8 para que Excel respete los acentos.

Código: `reconciliation-dashboard.ts`, `.html`, `.scss`, `data/reconciliation.service.ts`.

<a id="proceso-paso-a-paso"></a>
## Proceso paso a paso y confirmación al salir

- Tres pasos (Carga de archivos, Validación, Resultado); solo se avanza con "Siguiente": sin `(nzIndexChange)` los steps no son clicables y
  no hay "Anterior". Solo los pasos 1 (carga del extracto) y 2 (validación y resultado) están definidos; el 3 es un espacio reservado.
- Paso 1: el archivo se valida por extensión (`.xlsx`) también al arrastrarlo, porque `accept` solo
  filtra el selector. Cada carga invalida la anterior con un contador (`readSeq`): si se elige otro
  archivo mientras se revisa uno, el resultado viejo no se pinta.
- Paso 2: al entrar se envía el extracto ([envío](#envio-y-resultado)). La barra sube 10% por
  segundo hasta el 80% y el 100% llega con la respuesta; si responde antes, se corta el
  temporizador para que la barra no retroceda. "Siguiente" se habilita con la respuesta.
- Cada línea del resultado abre su detalle en un drawer ([detalle de línea](#detalle-de-linea)). Las
  líneas `diferencia` y `sin_coincidencia` no se pueden marcar hasta registrar una acción; "Siguiente"
  del paso 2 exige la respuesta del back y todas las líneas marcadas.
- `confirmLeaveGuard` (`canDeactivate`) cubre toda salida: flecha de volver, breadcrumb, menú
  lateral y "atrás" del navegador. Con un archivo cargado pregunta; si el diálogo ya está abierto,
  devuelve `false` sin abrir otro. "Finalizar" sale sin preguntar.

Código: `src/app/features/reconciliation-dashboard/reconciliation-process/**`.

<a id="extracto-bancario"></a>
## Extracto bancario: lectura y validación del formato

- Único formato soportado: el "Reporte Conciliar" de Bancolombia
  (`bancolombia_Reporte_Conciliar_<AAAAMMDD>_<AAAAMMDD>.xlsx`): una fila de encabezados con 27
  columnas en orden fijo (A a AA) y un movimiento por fila.
- Solo importan "VALOR TOTAL" (columna N) y "FECHA DE CANJE" (`yyyyMMdd`). El periodo del nombre
  del archivo es el de la fecha de canje (cuándo abona el banco), no el de la venta.
- Estados: `valid`; `invalid` (faltan columnas, que se listan TODAS en `missingColumns`; columnas
  fuera de orden; o no hay movimientos); `missing_fields` (hay filas con monto o fecha ilegibles, que
  se listan TODAS en `invalidRows` con su número de fila y campos); `error` (no se pudo leer).
  Colores de la leyenda: success, error, warning y error.
- El total se suma en centavos enteros: sumar miles de decimales en flotante acumula error.
- `BankStatementReader` carga `read-excel-file` con import dinámico (fuera del bundle inicial),
  cede un turno para que se pinte el loading (el reporte trae unas 13 mil filas) y nunca rechaza:
  un fallo de lectura se devuelve como `state: 'error'`. Es un servicio aparte para poder
  sustituirlo en las pruebas del componente.

Código: `data/bank-statement-reader.service.ts`, `data/bank-statement.util.ts`.

<a id="envio-y-resultado"></a>
## Envío al backend (simulado) y resultado

- No hay endpoint: `ReconciliationProcessApi.submitBankStatement` responde tras
  `SIMULATED_VALIDATION_MS` (10 s) con `MOCK_RECONCILIATION_RESULT` y no falla. Cuando exista, se
  sustituye el cuerpo por la llamada HTTP con el mismo contrato de entrada y salida, y se quita la
  constante.
- El front solo muestra el resultado: conteos, porcentajes (0 a 100, un decimal) y el estado de
  cada línea (`coincide`, `diferencia`, `sin_coincidencia`) llegan calculados. Las pruebas usan KPI
  que no cuadran con las líneas a propósito.
- El mock usa `crossMatchTransactions` sobre las mismas ventas y liquidaciones de la app, para que
  cada referencia exista también en "Gestión de diferencias". `bank.amount` es el total liquidado de
  la orden (puede venir en varios depósitos); `sale_only` y `settlement_only` dan
  `sin_coincidencia`.
- El mock conserva solo 10 líneas por gestionar (`TO_MANAGE`: 1 diferencia y 9 sin coincidencia) y todas las
  coincidentes: 57 líneas, con las gestionables repartidas en las páginas 1 a 3 de la tabla.
- El CSV del resultado lleva montos sin formato de moneda (sumables en Excel) y deja vacío el lado
  que no existe.

Código: `data/reconciliation-process-api.service.ts`, `reconciliation-result.model.ts`,
`reconciliation-result.util.ts`, `reconciliation-result.mock-data.ts`,
`reconciliation-process/result-status-tag/**`.

<a id="detalle-de-linea"></a>
## Detalle de una línea del resultado

- El back entrega por línea el lado POS y el lado banco (`pos`/`bank`: referencia, monto,
  concepto y método de pago; `null` si no existe ese lado), la diferencia y un comentario. El front
  solo los pinta.
- Diferencia (un tercio) y notas (dos tercios) van en la misma fila; los botones, debajo.
  `coincide`: sin acciones y notas de solo lectura (el comentario del back). `diferencia` y
  `sin_coincidencia`: "Marcar pendiente", "Ajustar monto" y "Reconciliar", que exigen
  `manage_differences`. Las notas se activan solo con los dos últimos y son obligatorias.
- Las notas pasan `validateNote`: 10 caracteres, dos palabras distintas de 2 letras o más y 4
  letras diferentes; así un "." o una letra suelta no habilitan el botón. No detecta texto sin
  sentido más largo.
- "Ajustar monto" reutiliza `CandidateList`: con candidatos seleccionados, el monto del banco y la
  diferencia salen de su suma (`selectedSettledAmount`), y confirma con `service.save()`, que
  reasigna liquidaciones en `ResolvedMatchesStore` y no se deshace. "Reconciliar" reutiliza
  `BankFileDropzone` y `StatementResult` (mismas reglas que el paso 1) y se habilita con un archivo
  `valid`; no llama a `save()`.
- `LineDetail` aloja su propio `DifferenceManagementService` y lo liga a la línea con `bindOrder`.
- Registrar la acción habilita la marca de la línea y la marca; con la acción ya registrada el detalle
  queda de solo lectura. Las acciones viven en memoria del proceso (`resolutions`).

Código: `reconciliation-process/line-detail/**`, `components/**`, `difference-management/components/**`.

<a id="resumen-final"></a>
## Resumen del paso "Resultado"

- Se muestra al pulsar "Siguiente" con todas las líneas marcadas. Total POS y Total banco vienen del
  back (`ReconciliationResult.totals`); los conteos salen de las acciones registradas.
- "Diferencias resueltas" cuenta las acciones distintas de "Marcar pendiente". "Conciliados" suma las
  líneas `coincide` y esas resueltas, con su porcentaje sobre el total. Las pendientes no cuentan,
  aunque el texto del banner siempre dice que todo quedó conciliado.
- El indicador "Por gestionar" del paso anterior cuenta las líneas con el checkbox aún bloqueado.

Código: `reconciliation-process.ts` (`summary`, `pendingCount`).

<a id="importacion-masiva"></a>
## Importación masiva de movimientos bancarios

- Mismo formato que el CSV de "Gestión de diferencias" (`referencia,descripcion,monto,fecha`, con
  encabezado opcional), pero el resultado no se ata a una orden: el archivo se resume en
  incorporados, duplicados y líneas con error. Por eso no reutiliza `parseSettlementsCsv`, que
  construye liquidaciones listas para el pool de una orden.
- El archivo se parsea una vez y ese resultado se pasa a `summarizeBankImport` y
  `simulateBankImportRejection`.
- "Duplicado" se simula contra las referencias de las liquidaciones mock del medio de pago elegido,
  para anclar el resumen a datos de la app.
- El rechazo es simulado y lo decide quien llama, no el contenido del archivo: usa el primer error
  real del parser o, si no lo hay, uno sintético sobre la última línea con datos.
- Hoy ninguna pantalla consume este util.

Código: `data/bank-import.util.ts`.

<a id="agrupacion-por-tender-y-dia"></a>
## Agrupación por medio de pago y día

- `groupByTenderDay` totaliza lo vendido y lo liquidado por día + medio de pago, porque el banco
  liquida en lote por día; comparar totales diarios es lo que se concilia contra el estado de
  cuenta. Los totales salen de sumar ventas y liquidaciones (redondeo a 2 decimales), no del cruce
  por orden.
- Estado del grupo: `por_conciliar` si hay venta y nada liquidado, `conciliado` si los totales
  coinciden y `desconciliado` en otro caso (incluye la liquidación sin venta).
- `actionableOrder` es la primera orden `sale_only` o `amount_mismatch` del grupo, para que
  "Gestionar" abra una resolución concreta (que es por orden). Es `null` si el grupo está
  conciliado o solo tiene liquidaciones sin venta.
- Hoy ninguna pantalla consume este util.

Código: `data/group-by-tender-day.util.ts`.

<a id="cruce-de-transacciones"></a>
## Cruce de transacciones y estados de cruce

- `crossMatchTransactions` empareja ventas del POS y liquidaciones por `orderId`. Es la única fuente
  del estado por orden (`MatchStatus`); "Gestión de diferencias" y el resultado simulado lo usan.
- Una orden puede liquidarse en varios depósitos (p. ej. abono parcial más ajuste): se suman todas
  sus liquidaciones para `status` y `difference`. `TransactionMatch.settlement` es solo la primera,
  como fila representativa para mostrar folio, lote o descripción; el monto no depende de ella.
- `difference` es venta menos total liquidado; `date` es la de la venta si existe. Las
  liquidaciones sin venta quedan como `settlement_only` (anomalía: duplicado o venta no capturada).
- `ReconciliationStatus` (3 estados, por día + medio de pago) agrupa en `desconciliado` las dos
  causas por orden que no cuadran (monto distinto y liquidación sin venta). Por ser otro concepto,
  `ReconciliationStatusTag` no reutiliza `MatchStatusTag`.

Código: `src/app/shared/utils/cross-match.util.ts`,
`src/app/shared/models/reconciliation-item.model.ts`,
`src/app/shared/components/match-status-tag/**`, `reconciliation-status-tag/**`.

<a id="stores-compartidos"></a>
## Stores compartidos: "Desconciliar" y matches resueltos

- `ResolvedMatchesStore` guarda los matches manuales confirmados en "Gestión de diferencias", por
  `tenderMedia|orderId`: monto liquidado (suma de lo elegido), ids de liquidaciones, nota y fecha.
  Es `root` porque `DifferenceManagementService` y el servicio de la tabla se proveen por ruta (una
  instancia por visita) y no hay backend: así la vista de conciliación refleja el match al volver sin
  recargar.
- `ReconciliationOverridesStore` guarda el "Desconciliar" manual por grupo `tenderMedia|date` (la
  fila que lo dispara ya es un total agrupado): fuerza `desconciliado` aunque los montos cuadren. Es
  `root` por el mismo motivo. No hay "volver a conciliar"; si se necesita, se agrega un método
  simétrico en este store. Hoy ninguna pantalla lo consume.
- Ambos viven en memoria: se pierden al recargar.

Código: `src/app/shared/data/reconciliation-overrides.store.ts`,
`resolved-matches.store.ts`.

<a id="comparativa"></a>
## Comparativa POS contra banco

- `/conciliacion/:runId`, desde "Ver" o la fila de la tabla. Qué se compara y cómo se presenta está
  por definir: la pantalla muestra el resumen de la corrida y un espacio reservado.
- Si el id no existe, muestra un aviso con enlace de vuelta.

Código: `src/app/features/reconciliation-dashboard/reconciliation-compare/**`.

<a id="datos-mock"></a>
## Mocks propios de conciliación (cuentas bancarias, series de KPI)

- `BANK_ACCOUNTS` usa bancos de Colombia, donde se usará la app. Es un catálogo independiente de
  `TenderMedia`: uno es cómo se cobró la venta y el otro a qué cuenta propia se importa el estado
  de cuenta; cualquier cuenta puede recibir liquidaciones de cualquier medio.
- Las series de 7 días de los KPI son ilustrativas; los movimientos salen de los mocks compartidos
  de ventas y liquidaciones.

Código: `data/bank-accounts.mock-data.ts`, `data/reconciliation-mock.data.ts`.
