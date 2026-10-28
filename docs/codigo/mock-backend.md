# Backend simulado (rama `main`)

`main` no habla con el Gateway: `mockBackendInterceptor` (`core/mock-backend/`) responde todas las
rutas que usa el portal con datos locales. La rama `feature/login-coctel-del-mar-integration` no lo
registra y usa el backend real. Convención: [README](README.md).

<a id="como-funciona"></a>
## Cómo funciona

- Se registra al final de `withInterceptors([...])` en `app.config.ts`: va después de
  `authTokenInterceptor` (lee el Bearer que este agrega) y de `httpErrorAlertInterceptor` (los errores
  simulados pasan por los mismos avisos que los reales).
- Cada ruta simulada responde tras 250 ms con el mismo contrato que el Gateway: mismos DTOs, códigos
  HTTP y `HttpErrorResponse` con cuerpo `{ error, code }`. Una ruta no simulada sigue su camino y
  falla como sin backend.
- Rutas: `/auth/**`, `/users/**` (incluida su bitácora), `/audit-log`, `/roles` (CRUD),
  `/permissions`, `/catalogs/{subsidiarias,ubicaciones,cargos,puestos,departamentos,areas}`,
  `/sales`, `/sales/capture` y `/sales/catalogs/*`.

<a id="auth-y-usuarios"></a>
## Auth, usuarios y roles

- `AuthMockBackend` (`core/auth/auth-mock-backend.ts`) guarda cuentas, tokens, roles y bitácora en
  `sessionStorage` (`conciliation-mock-backend`), así que sobrevive a un F5 y se reinicia al cerrar la
  pestaña. Cada `AppUser` de `user-management-mock.data.ts` es una cuenta; las que no traen empresas ni
  tiendas ven todas.
- Cuentas demo y contraseñas: `auth-mock.data.ts` (las de la pantalla de login). El `accessToken` dura
  90 s para poder ver la rotación del refresh. 5 intentos fallidos bloquean la cuenta 2 horas.
- Inactividad: cada petición autenticada anota la actividad (`mock-session-activity.ts`) y el refresh
  responde `SESSION_IDLE_TIMEOUT` tras 30 minutos sin ella.
- Los roles se crean, editan y dan de baja en el estado simulado (`ROLE_ALREADY_EXISTS`,
  `ROLE_NOT_FOUND`, `ROLE_IN_USE`); cambiar sus permisos se propaga a quienes lo tienen.

<a id="ventas-y-catalogos"></a>
## Ventas y catálogos

- `/sales` filtra y pagina las ventas mock del POS (`sales-mock.data.ts`) y las convierte a
  `SaleListItem` (`mock-sales-backend.ts`); las 4 sucursales del POS apuntan a 4 ubicaciones del
  catálogo. `/sales/capture` responde una captura completa que no inserta nada.
- Catálogos de organización: 2 empresas (Coctel del Mar, Hipermar Fish) y 16 tiendas, cada una con su
  `subsidiariaId`, en `auth-mock.data.ts`.

<a id="volver-al-backend-real"></a>
## Volver al backend real

Quitar `mockBackendInterceptor` de `app.config.ts`: ninguna pantalla ni servicio cambia.

Código: `core/mock-backend/**`, `core/auth/auth-mock-backend.ts`, `auth-mock.data.ts`,
`mock-session-activity.ts`, `mock-token.util.ts`.
