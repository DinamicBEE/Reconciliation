# Conciliación bancaria

Porqué del código de corridas de conciliación, el proceso paso a paso, el extracto bancario, el
cruce venta contra liquidación, la agrupación por medio de pago y día y los stores compartidos. Lo
visual y los flujos están en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón:
conciliaciones", "Patrón: cruce transacción a transacción entre dos fuentes", "Patrón: conciliación
por tender media y fecha" y "Patrón: importar movimientos bancarios". Los mocks de ventas y
liquidaciones están en [`ventas.md`](ventas.md#liquidaciones-mock). Convención: [README](README.md).

<a id="corridas"></a>
## Corridas de conciliación (modelo, store y estado)

- Una corrida (`ReconciliationRun`) compara las ventas del POS contra los movimientos del banco de
  una empresa, un restaurante y un periodo. Su `id` es el del backend en texto (va en la URL). Su
  estado (`conciliado` / `pendiente` / `desconciliado`) es de la corrida completa: no es
  `ReconciliationStatus`, que es por día + medio de pago. "Pendiente" es `por_conciliar` en el
  catálogo del backend (`RUN_STATUS_BY_CODE`); un código desconocido se muestra como pendiente.
- `ReconciliationRunsStore` es `root` y guarda las corridas que la sesión ya recibió del backend
  (la lista y el alta hacen `upsert`), para que la comparativa y el proceso, que buscan la corrida
  por el `:runId` de la URL, la encuentren. Vive en memoria: tras recargar una de esas pantallas por
  URL la corrida no aparece hasta volver a la tabla (el backend no tiene `GET /reconciliations/{id}`).
- "Desconciliar" no tiene endpoint: el store lo guarda por id y lo superpone a lo que llega del
  backend (`withLocalStatus`), así que sobrevive a recargar la lista pero no a recargar la página.
- Reglas de fila: "Desconciliar" solo sobre `conciliado`; "Descargar" solo sobre una corrida
  terminada (no `pendiente`). `markDesconciliado` no revalida la regla: la aplica la tabla.
- El CSV de "Descargar" lleva los datos generales de la corrida y su número de ventas. La fecha de
  creación llega como instante ISO; `createdDay` la pasa al día local.
- `MOCK_RECONCILIATION_RUNS` ya solo lo usan las pruebas (para sembrar el store).

Código: `src/app/features/reconciliation-dashboard/data/reconciliation-run.model.ts`,
`reconciliation-run.util.ts`, `reconciliation-runs.store.ts`, `run-status-tag/run-status-tag.ts`.

<a id="api-de-conciliaciones"></a>
## API de conciliaciones (`GET` / `POST /reconciliations`)

- Core Service. `GET /reconciliations` pide `view_reconciliation`; `POST` pide
  `create_reconciliation` (permiso propio, no basta con verlas).
- Lista: `{data, total, page, pageSize}`, la más reciente primero. Cada fila trae `code`
  (`CON-0011`, el que muestra el portal: `run.code`), `filesCount` y `matched`. Filtros `status` (id del catálogo
  `GET /sales/catalogs/reconciliation-statuses`), `createdFrom` / `createdTo` (`yyyy-MM-dd`, días en
  la zona `RECONCILIATION_ZONE` del backend, Bogotá por omisión; inclusive), `page` desde 1 y
  `pageSize` de 1 a 100. Solo se mandan los parámetros con valor.
- Alta: `{store, periodStart, periodEnd, comments?}`; el front no manda `comments` ni la empresa (es la subsidiaria de la tienda). Crea la conciliación en `por_conciliar` con todas las ventas habilitadas de la tienda en
  el periodo. 201 con la conciliación; 409 si no hay ventas o alguna ya está en otra conciliación
  (resultado esperado: advertencia con el `detail`); 400 datos inválidos; 403 sin permiso.
- El alta lleva `SKIP_HTTP_ERROR_ALERT` y sus errores los traduce `describeCreateReconciliationError`,
  para no duplicar el aviso genérico del interceptor.
- El id de cada estatus sale del catálogo de estados, que pide `view_dashboard`. Sin él (o mientras
  carga) se usan los ids en el orden en que los siembra la V1 (1 por_conciliar, 2 conciliado,
  3 desconciliado).

Código: `src/app/features/reconciliation-dashboard/data/reconciliation-api.service.ts`.

<a id="tabla-de-conciliacion"></a>
## Tabla de "Conciliación bancaria" y modal "Nueva conciliación"

- Una fila por corrida, con paginación y filtros en el servidor (10/20/50/100). Filtros: estatus y
  rango de la fecha de creación (columna "Fecha"), no del periodo conciliado. Cambiar un filtro o el
  tamaño vuelve a la página 1 (`page` es un `linkedSignal`). La columna "Ventas" es `salesCount`.
- La "x" del `nz-range-picker` emite `[undefined, undefined]` en lugar de `null`;
  `setDateRange` y `onNewPeriodChange` lo normalizan a `null`.
- Permisos: "Nueva conciliación" exige `create_reconciliation`, el que pide el backend. La ruta del
  proceso sigue exigiendo `import_settlements`: tras crear se navega a ella solo si la sesión lo
  tiene; si no, se queda en la tabla. "Descargar" exige además `export_reports`. La tabla y la
  comparativa exigen `view_reconciliation`.
- Si falla la carga, `nzNoResult` lo dice y aparece "Reintentar".
- "Desconciliar" es irreversible en la sesión y se confirma con un modal (ver
  [#corridas](#corridas)).
- El modal toma empresa y restaurante de los catálogos de la sesión (`CatalogService`, lo que trajo
  el login). La tienda se filtra por la empresa elegida con la subsidiaria de cada ubicación de
  `GET /catalogs/ubicaciones` (`OrganizationCatalogService`); si esa relación no está cargada,
  muestra las de la sesión. Cambiar de empresa descarta la tienda. Empresa, tienda y periodo son
  obligatorios. El banco no se pide aquí: se elige en el paso 1 del proceso (ver [#bancos](#bancos)).
- "Iniciar conciliación" queda en carga mientras responde el backend; con error el modal sigue
  abierto para corregir. En éxito se cierra, se recarga la tabla y se avisa con el número de ventas.
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

<a id="bancos"></a>
## Bancos (`GET /reconciliations/banks`)

- Core Service; pide `import_settlements` o `view_reconciliation`. Trae los bancos y canales
  habilitados (Bancolombia, Colpatria, Davivienda, Caja Social QR, Rappi y Rappi ID de pago). El
  `code` es el campo `bank` de la carga.
- `BankCatalogService` lo pide de forma perezosa (`ensureLoaded`, una vez por sesión; reintenta si
  falló) y lo usa el select "Banco o canal" del paso 1 del proceso. El modal "Nueva conciliación"
  no pide banco: el backend liga los reportes a la conciliación en la carga.
- Por ahora el front permite **un solo reporte por conciliación**, aunque el backend acepta uno por
  banco o canal. Cambiar de banco con un archivo ya elegido lo vuelve a leer con el lector de ese
  banco.

Código: `data/bank-catalog.service.ts`.

<a id="reportes-del-banco"></a>
## Reportes del banco por conciliación (`/reconciliation/reconciliations/{id}`)

- Reconciliation Service. `POST /reconciliation/bank-reports/read` (vista previa, no guarda) y, ya
  dentro de la conciliación, `POST .../files` (carga; 201, o 200 con `alreadyLoaded` si el archivo ya
  estaba y solo se liga), `POST .../match` (cruza solo la tienda y el periodo de la conciliación) y
  `POST .../confirm` piden `import_settlements`; `GET .../results` pide `view_reconciliation`.
  Multipart con `bank` y `file`; máximo 50 MB. Con la conciliación confirmada, carga y cruce
  responden 409.
- Paso 1: banco + archivo → vista previa (`toStatementResult`): sin transacciones es "Archivo
  inválido"; con filas que no cuadran, "Campos faltantes" (no deja avanzar); un 400 trae el motivo
  del back (p. ej. "No parece un reporte de Davivienda…"). "Siguiente" exige banco, archivo válido y
  que la conciliación no esté confirmada.
- Paso 2: carga → cruce → resultado; la barra avanza sola hasta el 80% y el 100% llega con el
  resultado. El resultado se trae completo (`allResults`, de 100 en 100 en paralelo) porque la
  tabla filtra, ordena y marca líneas en el front; al ir por conciliación son decenas o cientos de
  filas, no el reporte entero. Con error: mensaje del back, "Volver a la carga" y "Reintentar".
- Paso 2 → 3: el botón primario dice "Confirmar conciliación" y llama `POST .../confirm`. Solo pasa al
  paso 3 si el backend la confirmó; el paso 3 muestra cuántas ventas quedaron conciliadas, con
  diferencia y sin coincidencia. La conciliación pasa a `conciliado` también en el store.
- `GET .../results` trae el encabezado de la conciliación: si la sesión no la tiene (p. ej. tras
  recargar), el proceso arma la corrida con él (`runFromHeader`) en vez de decir que no existe. Si
  está confirmada, el paso 1 lo avisa y no admite más reportes.
- `toResultRow`: `MATCH` / `DIFFERENCE` / `UNMATCHED` → `coincide` / `diferencia` /
  `sin_coincidencia`; `pos` o `bank` en `null` es el lado sin pareja; el subtítulo (`channel`) es la
  `description` (franquicia o, si solo hay POS, el medio: "Tarjeta"); el comentario traduce la regla
  (`rule`). Sin medio de pago del portal (`tenderMedia: null`) ni `candidates`.
- Las acciones por línea (ajustar, reconciliar, marcar pendiente) siguen solo en el front: el
  backend aún no las guarda.

Código: `data/bank-report-api.service.ts`, `reconciliation-process/reconciliation-process.ts`.

<a id="envio-y-resultado"></a>
## Resultado: modelo y datos de ejemplo

- El resultado real llega de los reportes del banco ([#reportes-del-banco](#reportes-del-banco)).
  `MOCK_RECONCILIATION_RESULT` solo lo usan las pruebas y el resto de esta sección lo describe.
- El front solo muestra el resultado: conteos, porcentajes (0 a 100, un decimal) y el estado de
  cada línea (`coincide`, `diferencia`, `sin_coincidencia`) llegan calculados. Las pruebas usan KPI
  que no cuadran con las líneas a propósito.
- El mock usa `crossMatchTransactions` sobre las mismas ventas y liquidaciones de la app, para que
  cada referencia exista también en "Gestión de diferencias". `sale_only` y `settlement_only` dan
  `sin_coincidencia`.
- Relación 1 a muchos: `bank` es una lista de `ReconciliationBankMovement` (vacía si no hay
  movimientos) y `difference` = POS − suma de `bank` (`bankTotal`). Las primeras 10 líneas siguen el
  plan `ONE_TO_MANY` (una venta POS repartida en 2 a 4 abonos) y cubren los tres estados:
  `coincide` (la suma cuadra), `diferencia` (cuadra parcialmente; 5 abonos) y `sin_coincidencia` (0 abonos).
- Cada línea por gestionar trae también `candidates`: 5 movimientos sin asignar que el back sugiere al
  ajustar (liquidaciones sueltas del medio más cercanas al monto y, si faltan, depósitos sintéticos).
  Vacío en las `coincide`.
- El mock conserva solo 10 líneas por gestionar (`TO_MANAGE`: 2 diferencias y 8 sin coincidencia) y todas las
  coincidentes: 57 líneas, con las gestionables repartidas en las páginas 1 a 3 de la tabla.
- La tabla del paso muestra en "Banco" la suma de los movimientos con "N movimientos" debajo, y la
  columna "Notas" el comentario registrado. El CSV del resultado (Fecha, Referencia, Medio de pago,
  POS, Banco, Movimientos banco, Estado, Notas) lleva montos sin formato de moneda (sumables en
  Excel), deja vacío el banco sin movimientos y refleja los ajustes y notas (`buildResultCsv`).

Código: `data/reconciliation-result.model.ts`,
`reconciliation-result.util.ts`, `reconciliation-result.mock-data.ts`,
`reconciliation-process/result-status-tag/**`.

<a id="detalle-de-linea"></a>
## Detalle de una línea del resultado

- El back entrega por línea el lado POS (`pos`: referencia, monto, concepto y método de pago; `null`
  si no existe), los movimientos del banco (`bank`, lista), la diferencia y un comentario. El front
  solo los pinta: el POS en un card (un tercio) y el banco en una tabla de movimientos (dos tercios)
  con contador, "Total banco" y una barra "Cubre el X% del monto del POS" (topada en 100). La tabla
  muestra 3 movimientos (246px, encabezado fijo); con más aparece el scroll.
- Diferencia (un tercio) y notas (dos tercios) van en la misma fila; los botones, debajo.
  `coincide`: sin acciones y notas de solo lectura (el comentario del back). `diferencia` y
  `sin_coincidencia`: "Marcar pendiente", "Ajustar monto" y "Reconciliar", que exigen
  `manage_differences`. Las notas se activan solo con los dos últimos y son obligatorias.
- Las acciones van al fondo de la columna de notas, del mismo alto que la card de diferencia, y
  "Confirmar ajuste" a la derecha de la fila. Los botones con color de semáforo
  (`status-card-warning`/`-success`) llevan la clase solo mientras están habilitados: la clase usa
  `!important` y taparía el estilo deshabilitado.
- Las notas siguen el patrón `.info-field` de "Administración de usuarios": icono + "Notas" arriba y,
  abajo, el texto; al elegir "Ajustar monto" o "Reconciliar" el texto se reemplaza por un input.
- Las notas pasan `validateNote`: 10 caracteres, dos palabras distintas de 2 letras o más y 4
  letras diferentes; así un "." o una letra suelta no habilitan el botón. No detecta texto sin
  sentido más largo.
- "Ajustar monto" reutiliza `CandidateList`, sembrada con `service.bindSeed`: los movimientos actuales
  del banco (`bank`) arrancan seleccionados y detrás van las `candidates` de la línea sin seleccionar (el
  pool compartido no se usa). La tabla del banco lista lo seleccionado (`movementFromSettlement`) y la
  diferencia sale de su suma; confirma con
  `service.save()`, que reasigna liquidaciones en `ResolvedMatchesStore` y no se deshace. El ajuste
  guarda además los movimientos elegidos y la nota en `LineResolution`. "Reconciliar" reutiliza
  `BankFileDropzone` y `StatementResult` (mismas reglas que el paso 1); con un archivo `valid` aparece
  "Confirmar reconciliación" bajo el resumen, que exige una nota válida. Al pulsarlo, el resumen y el
  botón se reemplazan por `ProcessingIndicator` (espera simulada de 5 s) y, al terminar, se registra la
  acción; no llama a `save()`.
- `LineDetail` aloja su propio `DifferenceManagementService` y lo liga a la línea con `bindOrder`.
- Registrar la acción habilita la marca de la línea y la marca; con la acción ya registrada el detalle
  queda de solo lectura. Las acciones viven en memoria del proceso (`resolutions`).
- Al reabrir una línea ajustada, el detalle muestra los movimientos guardados, la diferencia
  recalculada y la nota; la tabla del paso refleja el nuevo total, "N movimientos · ajustado" y la nota.

Código: `reconciliation-process/line-detail/**`, `components/**` (incl. `processing-indicator`, también
usado en el paso "Validación"), `difference-management/components/**`.

<a id="resumen-final"></a>
## Resumen del paso "Resultado"

- Se muestra al pulsar "Siguiente" con todas las líneas marcadas. Total POS y Total banco vienen del
  back (`ReconciliationResult.totals`); los conteos salen de las acciones registradas.
- "Diferencias resueltas" cuenta las acciones distintas de "Marcar pendiente". "Conciliados" suma las
  líneas `coincide` y esas resueltas, con su porcentaje sobre el total. Las pendientes no cuentan,
  aunque el texto del banner siempre dice que todo quedó conciliado.
- El indicador "Por gestionar" del paso anterior cuenta las líneas con el checkbox aún bloqueado.
- Los 4 indicadores del paso "Validación" son botones: `toggleFocus` pone sus líneas primero en la tabla
  (partición estable en `tableRows`, sin ocultar las demás) y regresa a la página 1. "Por gestionar" se
  reordena según las acciones registradas.

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
