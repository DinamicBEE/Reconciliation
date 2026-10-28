# Interceptores HTTP y errores del backend

Porqué de los interceptores (token Bearer, alerta genérica) y del contrato de errores del backend
tal como lo consume el front. La política general de errores está en el §8.3 de
[`frontend-angular.md`](../architecture/frontend-angular.md). Los endpoints, en
`docs/api-endpoints.csv` y en las guías del backend en `docs/`. Convención: [README](README.md).

<a id="token-bearer"></a>
## Token Bearer y rutas públicas

- `authTokenInterceptor` agrega `Authorization: Bearer <accessToken>` a toda petición cuya URL
  empieza por `environment.apiUrl`. Es el único lugar que lo hace: ningún servicio arma el header a
  mano, así una llamada nueva no puede olvidarlo.
- `PUBLIC_PATHS` son los endpoints con `permitAll()` en el `SecurityConfig` del backend y van sin
  Bearer: `/auth/login` (aún no hay sesión), `/auth/refresh` (se autentica con el refresh token del
  body) y `/auth/logout` (acepta invalidar sin access token). El resto de `/auth/**` y `/users/**`
  exige un access token válido.
- El access token lo expone `AuthService.accessToken`; el refresh token nunca sale del servicio.

Código: `src/app/core/interceptors/auth-token.interceptor.ts` (`PUBLIC_PATHS`).

<a id="renovacion-ante-401"></a>
## Access token rechazado y renovación

- Un 401 en una llamada autenticada (una que llevaba Bearer) invalida la sesión con
  `AuthService.invalidateSession`: un access token rechazado fuera de la ventana de refresco
  proactivo (revocado, reloj desincronizado) no debe quedar silencioso a la espera de cada
  `subscribe({ error })`. El interceptor solo limpia la sesión; la navegación a `/login` la hace el
  `effect()` de `App`, igual que con `idle_timeout`.
- Excepciones:
  - `INVALID_CREDENTIALS`: `POST /auth/change-password` responde 401 con ese código cuando la
    contraseña actual es incorrecta. Es un error de negocio; cerrar la sesión sacaría al usuario
    por un error de tecleo.
  - `SESSION_IDLE_TIMEOUT`: cierra la sesión con motivo `idle_timeout` (aviso de inactividad).
  - Las rutas públicas, incluido `/auth/refresh`, no pasan por este manejo: ese 401 lo maneja
    `AuthService` de forma específica y manejarlo aquí duplicaría el cierre.
- El error siempre se re-lanza al llamador.

Código: `src/app/core/interceptors/auth-token.interceptor.ts`. Relación con
[`sesion-y-acceso.md#refresh-token`](sesion-y-acceso.md#refresh-token).

<a id="alerta-generica"></a>
## Alerta genérica de errores de negocio

`httpErrorAlertInterceptor` muestra un toast para los errores que ningún llamador maneja de forma
específica. Es un interceptor, y no código en cada `subscribe({ error })`, para que cualquier
llamada presente o futura reciba el mismo mapeo código → mensaje sin repetirlo.

Gestión por caso (lista "Códigos de error" de la guía de endpoints):

- **403 `PASSWORD_CHANGE_REQUIRED`** (cualquier endpoint protegido mientras `mustChangePassword`
  sea true): marca la sesión con `AuthService.markPasswordChangeRequired`, avisa y redirige a
  `/cambiar-password` (si no está ya ahí), para no dejar al usuario en una pantalla cuyas llamadas
  fallan todas. Se gestiona aunque la llamada use `SKIP_HTTP_ERROR_ALERT`.
- **403 sin `code` con la sesión marcada como "debe cambiar contraseña"**: se trata igual que
  `PASSWORD_CHANGE_REQUIRED`. El Gateway rechaza con un 403 de formato Spring
  (`{ timestamp, status, error: "Forbidden", path }`, verificado contra DEV con `GET /users`) cuando
  el token aún lleva `mustChangePassword`; decir "sin permiso" sería engañoso.
- **Código del catálogo sin UI propia**: toast con `ERROR_CODE_MESSAGES`, o un genérico con el
  código si no está en el catálogo. Los códigos de sesión (`INVALID_REFRESH_TOKEN`,
  `REFRESH_TOKEN_REUSED`, `REFRESH_TOKEN_EXPIRED`, `USER_LOCKED_OR_INACTIVE`) además cierran la
  sesión en `AuthService`.
- **403 sin `code`**: `FORBIDDEN_WITHOUT_CODE_MESSAGE` (ver [#403-sin-codigo](#403-sin-codigo)).
- **5xx sin `code`**: `SERVER_ERROR_MESSAGE`.
- **400 sin `code`** (validación de campos): no se avisa aquí; cada formulario decide el texto.

`SKIP_HTTP_ERROR_ALERT` (`HttpContextToken`) omite el toast genérico en llamadas que muestran sus
propios errores con el detalle del backend, p. ej. `POST /sales/capture`, que responde 502 con un
resultado válido y sus 400/404/409 en formato `ProblemDetail`.

El interceptor siempre re-lanza el error: solo agrega el aviso visual y el `subscribe({ error })`
del llamador sigue corriendo (p. ej. para reactivar un botón "Guardando…").

Código: `src/app/core/interceptors/http-error-alert.interceptor.ts`.

<a id="codigos-con-ui-propia"></a>
## Códigos que tienen UI propia (no muestran alerta genérica)

Un toast genérico sería un segundo aviso del mismo error:

| Código | Dónde se avisa |
|---|---|
| `INVALID_CREDENTIALS` | Alerta inline del login (`Login.loginError`) y de "Actualizar contraseña" (`ChangePassword.formError`) |
| `ACCOUNT_LOCKED` | Alerta inline del login |
| `SESSION_IDLE_TIMEOUT` | Aviso inline del login (`AuthService.sessionEndReason` + `Login.sessionNotice`) |

Cualquier otro código, incluido uno que el backend agregue y el catálogo aún no liste, no tiene UI
propia: este interceptor es la única alerta que ve el usuario.

Código: `src/app/core/interceptors/http-error-alert.interceptor.ts`
(`CODES_WITH_OWN_UI`).

<a id="contrato-de-errores"></a>
## Contrato de errores (`{ error, code }`) y mensajes

- Todo error de negocio del auth-service responde `{ error: string, code: string }`
  (`GlobalExceptionHandler` del backend). El front decide solo por `code`, que es estable; el texto
  de `error` está pensado para mostrarse y puede cambiar de redacción.
- `serverErrorText` devuelve ese texto para mostrarlo tal cual cuando aporta datos (p. ej.
  `ACCOUNT_LOCKED` con los minutos restantes); nunca se usa para decidir.
- `ERROR_CODE_MESSAGES` es el catálogo completo de la sección "Códigos de error" de la guía de
  endpoints de usuarios, roles y permisos (AuthController y UserAdminController). Se actualiza
  cuando el backend agrega un código; mientras tanto, un código desconocido cae al mensaje genérico
  del interceptor en vez de desaparecer sin aviso.
- `backendErrorMessage` devuelve `null` si el error no trae `code` (red, CORS: cada llamador los
  maneja por `status`) o si el código no está en el catálogo.
- Las funciones aceptan `unknown` y no `HttpErrorResponse`, para que las pruebas pasen un objeto
  plano `{ status, error }`.

Código: `src/app/core/auth/auth-errors.ts` (`ERROR_CODE_MESSAGES`,
`backendErrorMessage`).

<a id="403-sin-codigo"></a>
## 403 sin `code` (rechazo de Spring Security)

Un 403 sin `code` lo emite Spring Security (`SecurityConfig`) cuando falta la autoridad requerida
en el JWT, antes de llegar al `GlobalExceptionHandler`, por eso no trae `{ error, code }`. Como la
autorización es por permiso (`hasAuthority("manage_users")`, etc.), el mensaje habla de permisos y
no de roles. Excepción: con cambio de contraseña pendiente se trata como
`PASSWORD_CHANGE_REQUIRED` (ver [#alerta-generica](#alerta-generica)).

Código: `src/app/core/auth/auth-errors.ts`.
