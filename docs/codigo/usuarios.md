# Administración de usuarios: modelo, servicio y API

Porqué del modelo `AppUser`, de `UserManagementService` (estado y sincronización con el backend),
del cliente `UsersApiService`, de la bitácora y del mock de usuarios. Las pantallas se documentan
en [`usuarios-pantallas.md`](usuarios-pantallas.md) y los roles en
[`roles-y-permisos.md`](roles-y-permisos.md). Lo visual y la historia de cada endpoint conectado
están en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón: módulo de administración
(CRUD + estado + auditoría)" y en las secciones "Actualización". Convención: [README](README.md).

<a id="modelo-appuser"></a>
## Modelo `AppUser`

`AppUser` es el registro administrable completo (datos personales, seguridad, organización) que
ve este módulo. No es `AuthUser` (`core/auth/auth.service.ts`), que solo describe quién inició
sesión. El tipo vive en el feature, no en `shared/models`, mientras ningún otro feature lo
necesite (MASTER.md, "Estructura de carpetas (por feature)"); los tipos de acceso (`RoleId`,
`PermissionKey`, ...) viven en `shared/models/access.model.ts` (ADR-0001) y se re-exportan aquí.

- **Dos ids.** `id` (`uXXXX`) es local del registro en memoria; `backendUserId` es `app_user.id`
  del backend y es el que va en toda ruta `/users/{id}`. No deben confundirse.
- **Fechas.** `createdAt`, `lastAccessAt`, `lastActivityAt` y `lockedUntil` son ISO con hora;
  `birthDate`, `hireDate` y `contractEndDate` son ISO solo fecha. `lastAccessAt` es el último
  login (`null` = nunca entró); `lastActivityAt` es la última acción dentro de la app y el backend
  no la modela.
- **Dirección.** `AppUserAddress` es un sub-objeto porque se edita y muestra como unidad. Solo
  `street2` e `interiorNumber` son opcionales; el resto es requerido en la práctica aunque el tipo
  no lo valide. En el DTO del backend `zipCode` se llama `postalCode`.
- **Avatar.** `avatarUrl` es `null` cuando no hay foto (caso real; el backend no modela avatar).
  `nz-avatar` cae a iniciales + color tanto si es `null` como si la imagen falla, así que la UI no
  distingue los dos casos.
- **Permisos.** `permissions` son los efectivos de la persona y pueden diferir de los defaults de
  sus roles (ver [#roles-asignados](#roles-asignados)). `roleIds` lleva al menos uno.
- **Contraseña temporal.** `mustChangePassword` llega del backend con ese nombre; obliga a pasar
  por `/cambiar-password` antes de cualquier otra pantalla (`authGuard`, MASTER.md "Patrón: refresh
  token de un solo uso + cambio obligatorio de contraseña"). `temporaryPassword` es la contraseña
  generada por el backend en el alta o el reset; `GET /users/{id}` la recalcula mientras
  `mustChangePassword` siga en `true`. `null` = sin contraseña temporal vigente.
- **Listas cerradas.** `GENDER_OPTIONS` y `STATUS_OPTIONS` alimentan `nz-select` (no texto libre);
  `PHONE_PATTERN` es la validación única de teléfono para todos los formularios del dominio.

Código: `src/app/features/user-management/data/user-management.model.ts`.

<a id="estados-de-cuenta"></a>
## Estados de cuenta (activo, inactivo, bloqueado)

`UserStatus` usa minúsculas (`active`, `inactive`, `blocked`); el backend responde en mayúsculas
(`ACTIVE`, `INACTIVE`, `LOCKED`) y `backendStatusToLocal` traduce, con `active` como valor por
defecto para un código desconocido. `PATCH /users/{id}/status` recibe las minúsculas tal cual.

- **Bloqueo temporal vs. manual.** El bloqueo por intentos fallidos tiene `lockedUntil`: al vencer,
  el backend desbloquea solo (2 h por defecto, guía de endpoints §6). El bloqueo manual
  (`status: blocked`) no vence y deja `lockedUntil` en `null`.
- **Colores.** `STATUS_META` usa los tokens `--color-tag-*` (fondo tenue + borde, MASTER.md
  "Colores de tag"), no los de relleno sólido: misma semántica (activo verde, inactivo rojo,
  bloqueado naranja) con aspecto de tag. Son fijos, no siguen la paleta. `tagPreset` es el nombre de
  color de `nz-tag` para mostrar el mismo estado como tag plano en "Seguridad y acceso".
- **`StatusChip`.** Es el único control que cambia el estado (lista y detalle); vive en el feature
  porque solo lo usa este feature. No aplica el cambio: emite `statusChange` y el consumidor
  confirma antes de llamar a `UserManagementService.setStatus`. Elegir el estado actual no emite.

Código: `user-management.model.ts` (`STATUS_META`),
`src/app/features/user-management/status-chip/status-chip.ts`.

<a id="organizacion-y-responsables"></a>
## Organización, subsidiarias, ubicaciones y responsables

- **Catálogos del Core.** `cargoIds`, `puestoIds`, `departamentoIds` y `areaIds` son ids numéricos
  de `GET /catalogs/cargos|puestos|departamentos|areas` (`OrganizationCatalogService`), varios por
  persona; `[]` = sin asignar. El backend ya no acepta ni devuelve `department`/`area`/`jobTitle`
  de texto libre (Guia_Integracion_Frontend §5.2): si se envían, los ignora en silencio.
- **Subsidiarias y ubicaciones.** `subsidiariaIds` y `ubicacionIds` son ids de
  `GET /catalogs/subsidiarias|ubicaciones`. Son arreglos porque el backend modela relaciones N:M
  (`empleado_subsidiaria`, `empleado_ubicacion`). A diferencia del resto de la organización, se
  piden en el alta.
- **Resto de "Organización".** `managerId`, `employeeId`, `hireDate`, `contractEndDate`
  (`null` = indefinido) y los datos personales adicionales no se piden en el alta; se completan
  editando el detalle.
- **Responsables.** `MANAGER_ROLE_IDS` (`ADMIN`, `ALTAS`) define quién puede ser "Administrador
  responsable". Contabilidad, Tesorería y Costos quedan fuera a propósito: son roles de un módulo
  operativo, no de gestión de personas. `managerId` es un id local `uXXXX`; antes de enviarlo se
  traduce al `backendUserId` del responsable (`supervisorId` en el alta, `managerId` en la
  edición), y al leer el detalle `manager.id` se traduce de vuelta con `findByBackendUserId`. Si el
  responsable no tiene registro local, queda `null`. El componente excluye a la propia persona de
  los candidatos.

Código: `user-management.model.ts` (`MANAGER_ROLE_IDS`, campos de organización),
`user-management.service.ts` (`managerCandidates`, `organizationIdsFromDetail`).

<a id="servicio-de-usuarios"></a>
## `UserManagementService`: alcance, filtros y selección

- **`providedIn: 'root'`.** Lista, detalle y auditoría son rutas de nivel superior distintas; un
  proveedor por componente perdería el estado al navegar entre ellas. Los servicios de un solo
  árbol de pantalla (`SalesDashboardService`, `ReconciliationService`) sí se proveen en el
  componente.
- **Estado.** El registro (`usersSignal`) arranca de `MOCK_USERS` y se reconcilia con el backend
  (ver [#sincronizacion-con-backend](#sincronizacion-con-backend)). Búsqueda, filtros y selección
  son estado de la pantalla de lista y solo se escriben con métodos (ADR-0002, punto 4).
- **Sesión.** `currentAppUser` vincula la sesión con el registro por correo (`AuthUser.username`),
  porque la sesión no guarda ese vínculo (ADR-0001, punto 5). Es `null` si el correo no tiene
  registro; la sesión sigue autenticada.
- **Selección.** Su alcance son los usuarios filtrados visibles: "seleccionar todo" con un filtro
  activo no toca los ocultos. `toggleSelectAllFiltered` sigue el criterio habitual de tabla: si no
  están todos, el clic los completa (el estado indeterminado cuenta como incompleto).

Código: `src/app/features/user-management/data/user-management.service.ts`.

<a id="sincronizacion-con-backend"></a>
## Sincronización del registro local con `GET /users`

`syncFromBackend` lo dispara `UserList` al entrar; no es una fuente en vivo. El backend es la fuente
de verdad:

1. Cada registro con `backendUserId` toma de `UserSummaryDto` roles, permisos, estado,
   `emailVerified`, `lastLoginAt`, `mustChangePassword`, subsidiarias y ubicaciones.
2. Un registro con `backendUserId` que ya no aparece en `GET /users` se quita (baja lógica o base
   re-sembrada). Los registros sin `backendUserId` se dejan intactos.
3. Una cuenta del backend sin registro local (alta de otra sesión o de fuera del front) se inserta:
   `fetchAndInsertUser` pide `GET /users/{id}`, porque el resumen no trae nombre, fecha de alta ni
   organización, y `buildUserFromDetail` arma el `AppUser`. Si para entonces la cuenta ya tiene
   registro (sync concurrente), no se duplica.

Lo que el backend no modela (avatar, 2FA, última actividad) cae a su valor por defecto. Los errores
se ignoran: se conserva lo último conocido. `findUserByEmail` compara sin mayúsculas ni espacios.

Código: `user-management.service.ts` (`syncFromBackend`, `fetchAndInsertUser`,
`buildUserFromDetail`, `findByBackendUserId`, `findUserByEmail`).

<a id="alta-de-usuario"></a>
## Alta de usuario y contraseña temporal

`POST /users` (CU3 pasos 1-2). El backend genera `id`, roles y permisos efectivos (copia de los
defaults de los roles) y `temporaryPassword`; el front no genera nada salvo el id local `uXXXX`
(mínimo 4 dígitos, mayor que cualquiera de `MOCK_USERS`).

- `roleIds` solo se respeta si quien da de alta tiene `manage_roles` (claim `permissions` del JWT,
  no por rol); si no, 403 `ROLE_ASSIGNMENT_FORBIDDEN`.
- `status` solo admite `ACTIVE`/`INACTIVE`: `LOCKED` lo genera el sistema y el backend lo rechaza.
  El formulario solo ofrece Activo/Inactivo.
- Errores: 409 `EMAIL_ALREADY_REGISTERED`, 400 `INVALID_ROLE`/`INVALID_USER_STATUS`,
  403 `ROLE_ASSIGNMENT_FORBIDDEN`. Los avisa `httpErrorAlertInterceptor`; el llamador solo reacciona.
- `NewUserResult` es distinto de `UserSummaryDto` (igual que en el backend) porque
  `temporaryPassword` solo se muestra una vez. El sistema no envía correos: el administrador la
  entrega.

Código: `user-management.service.ts` (`createUser`), `users-api.service.ts`.

<a id="edicion-de-perfil"></a>
## Edición administrativa (información personal y organización)

Hay dos casos de uso con métodos distintos a propósito:

- **Self-service** (`Profile`, `/perfil`): `updateInfo` con `UpdateUserInfoInput`, solo datos
  personales; nadie edita su propia organización. Es local, no llama al backend.
- **Administrativo** (`UserDetail`): `updateUserProfile` con `UpdateUserProfileInput`, datos
  personales y organización en una sola llamada a `PATCH /users/{id}` (CU3 paso 3).

Contrato de `PATCH /users/{id}`:

- No incluye estado (`PATCH /users/{id}/status`) ni roles/permisos (`PATCH /users/{id}/roles`).
- Los campos escalares solo se sobreescriben si llegan no nulos: un `null` no borra un texto. El
  front siempre manda el formulario completo.
- Las listas (`subsidiariaIds`, `ubicacionIds`, `cargoIds`, `puestoIds`, `departamentoIds`,
  `areaIds`) reemplazan la actual; vacía quita todo; omitida (`undefined`) no toca nada. El front
  manda siempre las seis. Un id inexistente rechaza todo el PATCH: 400 `INVALID_LOCATION`
  (subsidiaria/ubicación) o 400 `INVALID_CATALOG_ITEM` (catálogos del Core).
- Responde `UserSummaryDto`, sin los campos enviados. El `AppUser` resultante combina el `input`
  (nombre, dirección, cargos...) con lo que trae la respuesta, autoritativa para roles, permisos,
  estado, `mustChangePassword`, `emailVerified`, subsidiarias y ubicaciones.

Código: `user-management.service.ts` (`updateUserProfile`, inputs), `users-api.service.ts`.

<a id="roles-asignados"></a>
## Cambio de roles asignados

`PATCH /users/{id}/roles` guarda roles y/o permisos. Los permisos son independientes del rol: al
cambiar de rol, el componente parte de la unión de defaults
(`AccessCatalogService.defaultPermissionsForRoles`), el admin ajusta y el servicio envía el
resultado final, que el backend guarda tal cual.

- Ambos campos son opcionales: omitido = no tocar; una lista reemplaza la actual. El servicio solo
  envía lo que cambió (comparación como conjuntos) y no llama si nada cambió.
- Exige `manage_roles` también para cambiar solo permisos (probado contra DEV; la guía solo lo dice
  de los roles): 403 `ROLE_ASSIGNMENT_FORBIDDEN`. Otros errores: 400 `INVALID_ROLE`/
  `INVALID_PERMISSION`, 404 `USER_NOT_FOUND`.
- Si la persona editada es la de la sesión, se llama a `AuthService.renewSession` para que el
  token refleje los permisos nuevos sin esperar al siguiente refresh.
- Si el backend rechaza el cambio, el registro se re-emite con arreglos nuevos para que los
  selectores (`ngModel`) vuelvan a mostrar los roles reales.

Código: `user-management.service.ts` (`changeRoles`, `accessChanged`), `users-api.service.ts`.

<a id="acciones-administrativas"></a>
## Estado, desbloqueo, verificación de correo, reset de contraseña y baja lógica

Todas exigen `backendUserId` y responden con error de `Observable` (sin llamar) si falta o si la
acción no aplica (mismo estado, correo ya verificado). Las de `/users/{id}` piden `manage_users`
(403 si falta, 401 con token inválido).

- **Estado** (`PATCH /users/{id}/status`, CU3 paso 4). La respuesta reconcilia roles, permisos,
  estado, subsidiarias y ubicaciones. `active` también desbloquea (contador de intentos a 0,
  `lockedUntil` a `null`); `blocked` es manual y no vence. Como `UserSummaryDto` no trae esos dos
  campos, el front los refleja localmente.
- **Desbloqueo** (`PATCH /users/{id}/unlock`, CU3 paso 5). Mismo efecto que `status: active` sobre
  el contador y `lockedUntil`.
- **Verificar correo** (`POST /users/{id}/verify-email`, CU3 paso 6). El backend fuerza
  `emailVerified=true` sin validar token. El front evita la llamada si ya está verificado (el botón
  ya está oculto), no porque el backend lo exija.
- **Cerrar sesiones** (`POST /users/{id}/close-sessions`). Revoca los refresh tokens vigentes; no
  cambia contraseña ni estado. El access token emitido vive hasta 15 min. Responde
  `{ id, activeSessions: 0 }`.
- **Reset de contraseña** (`POST /users/{id}/reset-password`). Devuelve a la contraseña temporal
  (nombre + primer apellido + año de alta), marca `mustChangePassword` y revoca las sesiones; no
  cambia el estado (un bloqueo se levanta con "Desbloquear"). La contraseña se devuelve para que el
  administrador la entregue.
- **Baja** (`DELETE /users/{id}`). Lógica (`enabled = false`): la cuenta no puede entrar y sale de
  listados, pero conserva su fila y su bitácora y libera el correo. 409 `CANNOT_DELETE_SELF` (la UI
  además lo deshabilita). El registro sale de la lista y de la selección.

404 `USER_NOT_FOUND` aplica a todas.

Código: `user-management.service.ts`, `users-api.service.ts`.

<a id="contrato-users-api"></a>
## Contrato de `/users/**` tal como lo consume el front (DTOs y paginación)

`UsersApiService` es el cliente HTTP de `/users/**`, separado de `AuthService` para que la sesión
no cargue con el CRUD (ADR-0001, punto 4). Los errores de negocio los avisa
`httpErrorAlertInterceptor` ([interceptores-y-errores.md](interceptores-y-errores.md#codigos-con-ui-propia)).
Todo `{id}` es `backendUserId`.

- **`UserSummaryDto`** (`GET /users` y respuesta de las mutaciones): estado compartido (roles,
  permisos, estado en mayúsculas, subsidiarias/ubicaciones, `mustChangePassword`, `emailVerified`,
  `lastLoginAt`). Lo define `core/auth/auth.service.ts`.
- **`UserDetailDto`** (`GET /users/{id}`): detalle completo; ningún dato relacional sale como id
  suelto (manager, subsidiarias, ubicaciones y catálogos llegan como `{ id, nombre }`). Incluye los
  contadores de seguridad (`failedLoginAttempts`, `activeSessions` = refresh tokens sin revocar ni
  vencer, `lockedUntil`). `temporaryPassword` solo viene mientras `mustChangePassword` es `true`:
  el backend la recalcula, nunca la guarda en texto plano.
- **Roles en respuestas** llegan como `string[]` y el front los castea a `RoleId[]` sin validar.

<a id="paginacion-users"></a>
### Paginación de `GET /users`

`page` empieza en 0 y el backend usa 20 por defecto; el front pide de 100 en 100 y `listAllUsers`
recorre todas las páginas en serie (cada una depende del `totalPages` anterior).

Riesgo: el backend (DEV) pagina con `PageRequest.of(page, size)` sin `Sort` y con `DISTINCT`, así
que el orden no es estable entre peticiones y recorrer páginas puede repetir y omitir cuentas
(probado: páginas de 10 sobre 27 cuentas dieron 21 distintas). Por eso las páginas se juntan por
`id` y, si faltan cuentas respecto de `totalElements`, se pide una sola página de ese tamaño (un
`SELECT` es una instantánea consistente). Con 100 cuentas o menos nunca se llega al respaldo.

Código: `src/app/features/user-management/data/users-api.service.ts`.

<a id="bitacora"></a>
## Bitácora (`GET /audit-log`)

El backend registra cada acción de administración (alta, edición, estado, roles, contraseña,
sesiones, baja) por su cuenta; el front no lleva bitácora local. `AuditLogService` es además el
cliente HTTP de estos endpoints (ADR-0001, punto 4).

- `GET /audit-log` (global, filtro opcional `userId`) y `GET /users/{id}/audit-log` (una persona,
  también dada de baja; 404 solo si nunca existió). Ambos exigen `view_audit_log`, independiente de
  `manage_users`.
- Filtros (`action`, `search` sobre detalle y nombre o correo de actor/afectado) y paginación del
  lado del servidor: `page` desde 0, `size` 20 por defecto. Orden: más reciente primero.
- `actor` es `null` cuando actuó el sistema (bloqueo/desbloqueo automático); la UI muestra
  "Sistema". `target` puede ser una persona ya dada de baja.
- `action` llega como texto. `AuditAction` lista los códigos conocidos (guía de endpoints, "Acciones
  que se registran"); un código nuevo se muestra tal cual (`auditActionLabel`).

Código: `src/app/features/user-management/data/audit-log.service.ts`,
`user-management.model.ts` (`AuditAction`, `AuditLogEntry`, `auditActionLabel`).

<a id="datos-mock"></a>
## Mock de usuarios: semilla, cuentas demo y puente a ids del backend

`MOCK_USERS` es el punto de partida del registro local; la sincronización con el backend lo
corrige (ver [#sincronizacion-con-backend](#sincronizacion-con-backend)). Invariantes:

- **26 cuentas** (`u0001`–`u0008`, `u0010`–`u0027`; `u0009` no existe), todas sembradas también en
  el backend. `BACKEND_USER_ID` es el puente a su `app_user.id`; si se re-siembra el backend, hay
  que actualizarlo. Un usuario creado después recibe su `backendUserId` en la respuesta del alta.
- **Cuentas demo** de login: `u0001`, `u0006`, `u0011`, `u0018` y `u0027` (Costos, el único con ese
  rol). Su `email` es el puente hacia la sesión (`findUserByEmail`), así que debe coincidir con lo
  sembrado en coctel-del-mar.
- **Variedad deliberada**: roles, estados, último acceso (incluido "nunca") y campos de seguridad.
  `u0005`, `u0007`, `u0022` y `u0027` no tienen foto (caso iniciales + color). Desde `u0010` son relleno para probar
  paginación de la lista (`nzPageSize=10`, 3 páginas con la última parcial).
- **`mustChangePassword`** es `false` salvo en `u0018`, para probar el primer inicio de sesión con
  una sola cuenta demo.
- **Campos derivados**: datos personales adicionales, ID de empleado y fechas de contrato salen de
  `extraProfileFields` por índice (determinista, no `Math.random`, para que no cambien entre
  recargas). La contratación coincide con la fecha de alta; uno de cada siete tiene fin de contrato.
- **Sin valores mock**: organización (subsidiarias, ubicaciones y catálogos del Core) y
  `temporaryPassword`. Las subsidiarias y ubicaciones llegan con `GET /users`; el resto con
  `GET /users/{id}` en el detalle. `lockedUntil` es siempre `null`.

Código: `src/app/features/user-management/data/user-management-mock.data.ts`.
