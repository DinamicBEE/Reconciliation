# Sesión y acceso

Porqué del código de autenticación, sesión, tokens, guards y permisos efectivos del usuario en
sesión. El modelo de tokens y su almacenamiento se decide en
[ADR-0004](../architecture/decisions/0004-sesion-y-tokens.md) y en el §9 de
[`frontend-angular.md`](../architecture/frontend-angular.md). Los flujos visuales y la historia
están en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón: refresh token de un solo
uso + cambio obligatorio de contraseña + bloqueo por intentos fallidos" y "Patrón: control de
acceso por rol". Convención: [README](README.md).

<a id="modelo-de-sesion"></a>
## Modelo de sesión (`AuthUser` y DTOs del login)

- `AuthUser` se construye solo con datos del backend (ADR-0001, punto 5): no guarda ids del
  registro mock de `user-management`. Quien necesite el `AppUser` de la sesión lo resuelve por
  email (`username`) con `UserManagementService.currentAppUser`; así no hay ciclo
  auth ↔ user-management.
- `roles` y `permissions` se guardan tal como los devuelve el backend (`UserSummaryDto`). El
  nombre visible de un rol sale de `GET /roles` (`AccessCatalogService.roleLabel`). Un arreglo
  vacío significa "sin roles" o "sin permisos", no "usar un valor por defecto".
- `subsidiarias` y `ubicaciones` son las que la cuenta tiene asignadas y alimentan los catálogos
  de `CatalogService` (ver [`catalogos.md`](catalogos.md)).
- `UserSummaryDto` es el mismo DTO en `/auth/login`, `GET /auth/me` y los endpoints de `/users`
  (listar, crear, editar, cambiar estado); lo reutiliza `UsersApiService`. El contrato completo
  está en `docs/api-endpoints.csv` ("Login").

Código: `src/app/core/auth/auth.service.ts`.

<a id="restaurar-y-validar-sesion"></a>
## Restaurar y validar la sesión (`sessionStorage`, `GET /auth/me`)

- La sesión (usuario y tokens) se persiste en `sessionStorage`, no en `localStorage`: no debe
  sobrevivir a cerrar el navegador. Al arrancar, un payload incompleto o corrupto se descarta y
  se vuelve a login en lugar de arrancar sin tokens que rotar.
- Una sesión restaurada tras recargar reprograma el timer de refresco y se valida de inmediato con
  `GET /auth/me`: el JWT pudo invalidarse del lado del servidor (rol cambiado, cuenta bloqueada).
  La validación es best-effort: un error que no sea 401 (backend caído, red) deja la sesión como
  estaba; un 401 lo cierra `authTokenInterceptor`.
- `GET /auth/me` también actualiza roles, permisos, organización y la bandera de contraseña
  pendiente, por si cambiaron desde el login.

Código: `src/app/core/auth/auth.service.ts`.

<a id="login"></a>
## Login y respuestas del backend (401, 423, sin conexión)

- `AuthService.login` solo valida credenciales (`POST /auth/login`); la sesión la abre
  `completeLogin`, para que el llamador decida cuándo.
- Respuestas que la pantalla de login traduce:
  - **401** (`INVALID_CREDENTIALS`): "Usuario o contraseña inválidos.".
  - **423** o `ACCOUNT_LOCKED`: se muestra el texto `error` del backend tal cual, porque trae los
    minutos restantes del bloqueo temporal (5 intentos fallidos) o indica contactar al
    administrador. El texto local es solo respaldo.
  - **status 0** u otro: mensaje genérico de conexión, para no hacer sospechar de la contraseña
    cuando el problema es el servidor, la red o CORS.
- Los textos locales coinciden con la sección "Códigos de error" de la guía de endpoints del
  backend.
- Con cambio de contraseña pendiente, login navega directo a `/cambiar-password` (evita el salto
  extra por `authGuard`); si no, a `AccessControlService.homeRoute()`, que no siempre es
  `/dashboard`.

Código: `src/app/core/auth/auth.service.ts`, `src/app/features/auth/login/login.ts`.

<a id="refresh-token"></a>
## Refresh token y renovación de la sesión

- El refresh token es de un solo uso: cada `POST /auth/refresh` devuelve un par nuevo e invalida
  el anterior. Dos refresh simultáneos con el mismo token se interpretan como robo y el backend
  cierra todas las sesiones de la cuenta; por eso se cancela el timer antes de cualquier refresh
  manual (`renewSession`, cambio de contraseña) y `setSession` lo reprograma.
- El timer renueva `REFRESH_MARGIN_MS` (30 s) antes de que venza el access token (15 min por
  defecto en el backend), para no dejar una ventana sin token válido. Al dispararse lee la sesión
  vigente, no la capturada al programarlo.
- Si el refresh token presentado no coincide con el de la sesión, se trata como reuso y se cierra
  la sesión sin llamar al backend. Cualquier rechazo del backend también la cierra: no tiene
  sentido mantener un timer sobre una sesión no renovable.
- Inactividad: un refresh token con más de 30 minutos sin actividad responde 401
  `SESSION_IDLE_TIMEOUT`. Se detecta solo por `code` y deja `sessionEndReason = 'idle_timeout'`.
- `renewSession` fuerza la renovación (refresh + `GET /auth/me`) cuando la persona cambia sus
  propios roles con `PATCH /users/{id}/roles`, para no esperar hasta 15 min al siguiente refresh.
  Si falla, cierra la sesión en vez de propagar el error.
- `POST /auth/refresh` es ruta pública (sin Bearer): ver
  [`interceptores-y-errores.md#token-bearer`](interceptores-y-errores.md#token-bearer).

Código: `src/app/core/auth/auth.service.ts`.

<a id="cambio-de-contrasena"></a>
## Cambio obligatorio de contraseña

- La bandera es `AuthUser.mustChangePasswordHint`, copiada de `UserSummaryDto.mustChangePassword`
  (login o `GET /auth/me`) o encendida al recibir un 403 `PASSWORD_CHANGE_REQUIRED`
  (`markPasswordChangeRequired`).
- Tras `POST /auth/change-password`, el access token vigente sigue llevando la marca
  `mustChangePassword` dentro del JWT y el Gateway rechazaría todo con 403 hasta tener uno limpio.
  Por eso se encadena un `POST /auth/refresh` y se reemplaza la sesión con la bandera apagada. Si
  ese refresh falla, la contraseña ya cambió: no se reporta como error del cambio; se cierra la
  sesión y la persona entra con la contraseña nueva.
- La pantalla vive fuera de `Shell` (sin header ni menú mientras la obligación esté pendiente) y
  la protegen `mustChangePasswordGuard` y `authGuard` desde los dos lados (ver [#guards](#guards)).
- Formulario: la nueva exige 8 caracteres con letra y dígito (login solo exige que se escriba
  algo; ahí decide el backend). Las validaciones cruzadas ("distinta de la actual", "confirmación
  igual") se agregan al control dependiente y no al grupo, porque `nz-form-control`/`nzErrorTip`
  solo leen el estado del control que envuelven; los `valueChanges` revalidan el dependiente porque
  Angular solo revalida un control cuando cambia su propio valor.
- Errores: 401 `INVALID_CREDENTIALS` es contraseña actual incorrecta (no cierra la sesión, ver
  [`interceptores-y-errores.md#renovacion-ante-401`](interceptores-y-errores.md#renovacion-ante-401));
  400 es la nueva rechazada por el backend; el resto lo avisa `httpErrorAlertInterceptor`.

Código: `src/app/core/auth/auth.service.ts`,
`src/app/features/auth/change-password/change-password.ts`,
`src/app/core/auth/must-change-password.guard.ts`.

<a id="cierre-de-sesion"></a>
## Cierre de sesión no solicitado y motivo mostrado en login

- `logout()` es el cierre pedido por el usuario: limpia la sesión, no deja aviso e invalida el
  refresh token con `POST /auth/logout` en modo best-effort (si falla, la sesión local ya está
  cerrada).
- `invalidateSession(reason)` es el cierre no pedido: igual de completo en el cliente, pero sin
  llamar a `/auth/logout` (el backend ya invalidó ese token o el access token ya no sirve) y
  registrando el motivo en `sessionEndReason`:
  - `idle_timeout`: lo detecta `POST /auth/refresh` (401 `SESSION_IDLE_TIMEOUT`).
  - `invalid_token`: un 401 en cualquier otra llamada autenticada (token revocado, reloj
    desincronizado), ver `authTokenInterceptor`.
- El `effect()` de `App` observa `sessionEndReason` y navega a `/login`, porque los guards solo
  actúan al navegar y la pantalla actual quedaría abierta sin sesión. Vive en `App` y no en
  `Shell` para cubrir también `/cambiar-password`.
- `Login` muestra el aviso hasta el siguiente login exitoso (que limpia el motivo); un error de
  credenciales tiene prioridad en el mismo lugar.

Código: `src/app/core/auth/auth.service.ts`, `src/app/core/auth/auth-errors.ts`
(`SessionEndReason`), `src/app/app.ts`, `src/app/features/auth/login/login.ts`.

<a id="permisos-efectivos"></a>
## Permisos efectivos y pantalla inicial

- `AccessControlService` está separado de `AuthService` a propósito: `AuthService` solo sabe
  quién inició sesión y `AccessControlService` resuelve qué puede ver o hacer. No depende de
  `UserManagementService`, lo que rompe el ciclo auth ↔ user-management (ADR-0001, punto 5).
- La única fuente de permisos es `AuthUser.permissions` del backend. No hay recálculo ni fallback
  por rol: un arreglo vacío significa "sin permisos" y solo `PATCH /users/{id}/roles` lo cambia.
- Las acciones se deciden por permiso, como las pantallas. Ejemplo: "Reprocesar" exige
  `capture_sales` porque `POST /sales/capture` lo exige; mostrarlo a quien no lo tiene solo
  produciría un 403.
- `hasRole` y `data.role` siguen disponibles para una pantalla exclusiva de un rol que ningún
  permiso exprese, pero hoy ninguna ruta los usa: "Roles y permisos" pasó a `manage_roles`.
- `homeRoute()` devuelve la primera pantalla accesible en el orden del menú lateral (no
  alfabético). Se usa tras el login y en los guards. Sin ningún permiso reconocido devuelve
  `/login`, para evitar bucles de redirección entre rutas que tampoco puede ver.

Código: `src/app/core/auth/access-control.service.ts`.

<a id="catalogos-de-acceso"></a>
## Catálogos de roles y permisos (`GET /roles`, `GET /permissions`)

- Toda lista de roles o permisos del portal (selects, filtros, grid de permisos, etiquetas) sale
  de `AccessCatalogService`; no hay arreglos `ROLES`/`PERMISSIONS` propios del front. Un rol o
  permiso nuevo que el backend agregue por migración aparece solo. Es el mismo criterio que
  `CatalogService` con subsidiarias y ubicaciones.
- Los dos endpoints exigen `manage_users` o `manage_roles`. Sin ellos (p. ej. Contabilidad,
  Tesorería, Costos) el catálogo no se pide, porque daría 403, y queda vacío; las etiquetas de rol
  del encabezado y el perfil caen a una versión legible del código (`roleLabel`).
- Carga: un `rxResource` (ADR-0002, punto 3) observa la sesión; pide ambos catálogos con
  `forkJoin` al iniciar sesión con permiso y vuelve a vacío al cerrarla. Un resource en error
  lanza al leer `value()`, por eso se lee con `hasValue()`; el aviso del error lo da
  `httpErrorAlertInterceptor`.
- `defaultPermissionsForRoles`: la regla "cambio de rol → permisos por defecto" la aplica el
  front y envía el resultado final; el backend lo guarda tal cual.
- Vive en `core/auth` (ADR-0001) porque lo consumen el layout y varias features; el CRUD de roles
  es de `RolesApiService`.

Código: `src/app/core/auth/access-catalog.service.ts`. Los códigos y la pantalla de
roles se documentan en [`roles-y-permisos.md`](roles-y-permisos.md).

<a id="guards"></a>
## Guards de ruta

- `authGuard` protege todo lo que cuelga de `Shell`: sin sesión lleva a `/login`; con cambio de
  contraseña pendiente lleva a `/cambiar-password` antes de dejar pasar a cualquier pantalla.
- `mustChangePasswordGuard` es la contraparte en `/cambiar-password` (fuera de `Shell`): sin
  sesión lleva a `/login`; sin cambio pendiente lleva a `homeRoute()` (evita visitas a mano o
  quedarse en la pantalla tras completar el cambio y volver atrás). Como cada guard empuja hacia
  el otro solo en la condición opuesta, no hay bucle.
- `permissionGuard` exige `route.data['permission']` y, si se declara, `route.data['role']`. Una
  ruta sin `data.permission` queda abierta a cualquier usuario autenticado. Sin el permiso no
  devuelve `false` (dejaría una pantalla en blanco): redirige a `homeRoute()`.
- `AccessControlService.mustChangePassword` es el signal que leen `authGuard` y
  `mustChangePasswordGuard`.

Código: `src/app/core/auth/auth.guard.ts`, `permission.guard.ts`,
`must-change-password.guard.ts`. Los permisos por ruta: [`configuracion-y-pais.md#rutas`](configuracion-y-pais.md#rutas).

<a id="riesgos"></a>
## Riesgos conocidos

- **Casts sin validar de roles y permisos.** `roles` y `permissions` del backend se convierten a
  `RoleId[]` y `PermissionKey[]` sin validación en runtime (login, `GET /auth/me`,
  `AccessCatalogService`). Un código nuevo que el front no conozca circula como string suelto; en
  pantalla se muestra con `roleLabel`/`permissionLabel` o, si no está en el catálogo, con una
  versión legible del código.
- **Validación best-effort de la sesión restaurada.** Si `GET /auth/me` falla por red al recargar,
  la sesión se mantiene hasta que una petición protegida reciba un 401.

Código: `src/app/core/auth/auth.service.ts`, `src/app/core/auth/access-catalog.service.ts`.
