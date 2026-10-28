# Catálogos

Porqué de los catálogos de sesión (subsidiaria y ubicación), de los catálogos organizacionales del
Core Service (`GET /catalogs/...`) y de la pantalla de solo lectura "Catálogos cargados". Lo visual
está en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón: catálogos cargados" y
"Actualización: catálogos organizacionales del Core Service". Convención: [README](README.md).

<a id="catalogos-de-sesion"></a>
## Catálogos de la sesión (subsidiarias y ubicaciones del login)

- `CatalogService` deriva de `AuthService` las listas que trae el login (`AuthUser.subsidiarias` y
  `AuthUser.ubicaciones`, desde `/auth/login` y `/auth/me`) en lugar de duplicarlas, igual que
  `AccessControlService` deriva los permisos.
- Regla general: todo select cuyo campo sea una subsidiaria (negocio, marca, empresa) o una
  ubicación (tienda, store, punto de venta, sucursal) en una pantalla operativa toma sus opciones de
  `subsidiarias()` / `ubicaciones()`; nunca un arreglo fijo ni un enum del front. Aplica también a
  cualquier select nuevo de esos campos.
- Son las listas a las que tiene acceso quien inició sesión, no un catálogo global. Para asignar
  organización a otra persona se usa [#catalogos-organizacionales](#catalogos-organizacionales).

Código: `src/app/core/services/catalog.service.ts`.

<a id="catalogos-organizacionales"></a>
## Catálogos organizacionales completos (`GET /catalogs/...`)

- Seis catálogos del Core Service (Guia_Integracion_Frontend §7.1): `subsidiarias`, `ubicaciones`,
  `cargos`, `puestos`, `departamentos` y `areas`. Alimentan los combos del alta y de la sección
  "Organización" del detalle de usuario; el `id` de cada opción viaja en `POST /users` y
  `PATCH /users/{id}`.
- La llave del catálogo coincide con el campo de `UserDetailDto` que trae lo asignado (`cargos`,
  `puestos`…) y, con sufijo `Ids`, con el de `PATCH /users/{id}` (`cargoIds`…).
- `GET /catalogs/ubicaciones` trae además `subsidiariaId`, que permite filtrar las ubicaciones por
  las subsidiarias elegidas (`ubicacionesFor`) y quitar las que dejan de pertenecer al deseleccionar
  una subsidiaria (`pruneUbicaciones`).
- No exigen un permiso concreto, basta una sesión válida. Son listas cortas, sin paginar, filtradas
  a `enabled = TRUE` y ordenadas por nombre en el backend. En una base nueva cargos, puestos,
  departamentos y áreas llegan vacíos porque el cliente aún no entrega las listas: la UI debe
  tolerar `[]`.
- Carga perezosa (`ensureLoaded`, una vez por sesión) con un `rxResource` por catálogo (ADR-0002,
  punto 3), para que la falla de uno no vacíe a los otros cinco; las llamadas posteriores reintentan
  solo los fallidos y `reload()` vuelve a pedir los seis. Al cerrar sesión `params` pasa a
  `undefined` y los valores vuelven a `[]` sin un `effect`. El aviso de error lo da
  `httpErrorAlertInterceptor`. Un recurso en error lanza al leer `value()`, por eso se lee con
  `hasValue()`.

Código: `src/app/core/services/organization-catalog.service.ts`.

<a id="entrada-de-catalogo"></a>
## `CatalogEntry`

`{id, nombre}` es la forma completa de `SubsidiariaSummaryDto` y `UbicacionSummaryDto`
(`UserSummaryDto.subsidiarias` / `.ubicaciones` del login) y de las opciones de
`GET /catalogs/...`, así que un solo tipo sirve para todos. La regla de no usar listas propias del
front está en [#catalogos-de-sesion](#catalogos-de-sesion).

Código: `src/app/shared/models/catalog-entry.model.ts`.

<a id="pantalla-catalogos-cargados"></a>
## Pantalla "Catálogos cargados"

- CU14 del DED (sección 7.14, prueba 30 de la matriz): relación de catálogos fijos de la autoridad
  fiscal (SAT o DIAN según el país), homologaciones, catálogos sincronizados desde NetSuite y datos
  maestros de la carga inicial por plantilla, con su número de registros y fecha de actualización.
- Solo lectura para todos los roles: el portal no tiene mantenimiento de catálogos (DED 2.2) y las
  correcciones se piden por soporte (DED 7.17), por eso ni el modelo ni el servicio tienen
  operaciones de escritura. Hoy lee de `MOCK_CATALOGS`; cuando exista backend las listas llegarán
  del Core / Ventas Service.
- El detalle de una lista se abre en un Drawer con búsqueda, no en una ruta, porque no tiene flujo
  propio. La búsqueda dentro de la lista (CU14 paso 3: comprobar si un valor está cargado) coincide
  contra cualquier columna y se reinicia al abrir otra lista.
- Cada catálogo define sus columnas (`CatalogColumn`) porque cada lista tiene su forma; el número
  de registros se deriva de `rows.length`.
- `CatalogsService` se provee en el componente (ADR-0002, punto 4): el estado no sobrevive a salir
  de la pantalla.
- La tabla usa `nzNoResult` y no una fila `@empty`: con datos vacíos `nz-table` ya pinta su propio
  mensaje y saldría duplicado.

Código: `src/app/features/catalogs/catalogs.*`, `data/catalogs.service.ts`,
`data/catalogs.model.ts`, `data/catalog-filter.util.ts`.

<a id="datos-mock-por-pais"></a>
## Mock de catálogos por país

- Los valores salen del DED: tender media, Major/Family Group, prefijos de ubicación y cuentas
  homologadas (7.21 y 7.23). Los números de cuenta contable, los códigos de establecimiento y los
  ids de tienda Rappi son ilustrativos: el cliente aún no entrega su plan de cuentas ni sus
  homologaciones (supuestos del DED, sección 3.1).
- Lo que depende del país activo (`environment.country`) vive aparte: catálogos fiscales de la
  autoridad, homologación de impuestos y códigos de impuesto de NetSuite
  (`country-catalogs.mx.ts`, `country-catalogs.co.ts`). México usa los catálogos oficiales del
  Anexo 20 del CFDI 4.0, solo con los códigos que usa la venta al público. El resto
  (homologaciones de tender, grupos, ubicaciones, adquirencia, Rappi y maestros) es igual en ambos
  países.
- Las 8 ubicaciones (`HIPERMAR_PREFIXES`) son las que expone el API del facturador (DED 7.23), cada
  una con su prefijo fiscal, y se reutilizan en varias homologaciones.

Código: `src/app/features/catalogs/data/catalogs-mock.data.ts`,
`country-catalogs.mx.ts`, `country-catalogs.co.ts`.
