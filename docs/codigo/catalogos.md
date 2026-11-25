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

- CU14 del DED (sección 7.14, prueba 30 de la matriz): relación de los catálogos que el backend
  registra en `catalog_registry` (Core Service), con su número de registros habilitados y fecha de
  última actualización. Dos endpoints: `GET /catalogs?search&type` (lista) y
  `GET /catalogs/items?code&search&page&pageSize` (detalle paginado).
- Tipos del backend: `DIAN` (fijos del Layout de facturación electrónica), `NETSUITE` (los alimenta
  la sincronización `POST /netsuite/...`) e `INTERNAL` (propios del sistema). Reemplazan la
  clasificación anterior del front (fiscal, homologación, NetSuite, dato maestro), que no existe en
  el backend. La columna "Origen" muestra `origin` tal como llega.
- Solo lectura para todos: el portal no tiene mantenimiento de catálogos (DED 2.2) y las
  correcciones se piden por soporte (DED 7.17). El backend acepta altas y ediciones con
  `manage_catalogs`, pero el front no las usa mientras el DED no cambie.
- Sin permiso propio: el backend solo pide sesión válida, así que la ruta, el menú y la búsqueda del
  header no exigen permiso. `view_catalogs` no existe en el backend; con él, ningún usuario real
  vería la pantalla. Por lo mismo `homeRoute()` cae en `/catalogos` cuando no hay otra pantalla.
- Búsqueda y filtro de tipo van al servidor (`search`, `type`; con "Todos los tipos" no se envía
  `type`). La búsqueda espera 300 ms tras teclear; borrarla aplica en el acto. El backend rechaza
  más de 100 caracteres (400), por eso los campos llevan `maxlength="100"`.
- El detalle se abre en un Drawer, no en una ruta, porque no tiene flujo propio. Hay catálogos
  grandes (códigos postales, municipios), así que la búsqueda (CU14 paso 3, contra cualquier
  columna) y la paginación son del servidor. `page` es un `linkedSignal` que vuelve a 1 al abrir
  otro catálogo o cambiar la búsqueda; la búsqueda se reinicia al abrir otro catálogo.
- Cada catálogo trae sus columnas (`key`, `label`, `type`) y cada registro un campo por `key`.
  `formatCatalogValue` da formato por tipo: `datetime` como fecha, `boolean` como Sí/No y `number`
  tal cual (suelen ser códigos o ids, no cantidades); un vacío se muestra como "—".
- `detail` se descarta si la respuesta es de otro catálogo, para no pintar las columnas del anterior
  mientras llega el nuevo. El encabezado del Drawer usa el del detalle cuando llega y, mientras,
  el de la fila de la lista.
- `CatalogsService` se provee en el componente (ADR-0002, punto 4): el estado no sobrevive a salir
  de la pantalla. Los avisos de error los da `httpErrorAlertInterceptor`; la pantalla además muestra
  "Reintentar".
- La tabla usa `nzNoResult` y no una fila `@empty`: con datos vacíos `nz-table` ya pinta su propio
  mensaje y saldría duplicado.

Código: `src/app/features/catalogs/catalogs.*`, `data/catalogs.service.ts`,
`data/catalogs.model.ts`, `data/catalog-value.util.ts`.
