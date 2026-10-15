import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import {
  FORBIDDEN_WITHOUT_CODE_MESSAGE,
  PASSWORD_CHANGE_REQUIRED_CODE,
  ERROR_CODE_MESSAGES,
  SERVER_ERROR_MESSAGE,
  backendErrorMessage,
  extractErrorCode,
} from '../auth/auth-errors';

// Códigos que YA tienen su propia UI dedicada en el punto donde ocurren —
// mostrar TAMBIÉN un toast genérico aquí sería un segundo aviso del MISMO
// error:
// - INVALID_CREDENTIALS/ACCOUNT_LOCKED: alerta inline en el formulario de
//   login (`Login.loginError`) y en "Actualizar contraseña"
//   (`ChangePassword.formError`, solo INVALID_CREDENTIALS).
// - SESSION_IDLE_TIMEOUT: aviso inline en login (`AuthService.sessionEndReason`
//   + `Login.sessionNotice`).
// Cualquier OTRO código del catálogo (`auth-errors.ts`, `ERROR_CODE_MESSAGES`)
// — incluido uno que el backend agregue después y este archivo todavía no
// liste — no tiene UI propia, así que este interceptor es la única alerta
// que el usuario ve para ellos.
const CODES_WITH_OWN_UI = new Set(['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'SESSION_IDLE_TIMEOUT']);

const CHANGE_PASSWORD_URL = '/cambiar-password';

/**
 * Alerta genérica para errores de negocio del backend real (auth-service)
 * que ningún llamador maneja de forma específica — ver `CODES_WITH_OWN_UI`
 * arriba. Vive como interceptor (no en cada `.subscribe({ error })`) porque
 * aplica igual a cualquier llamada presente O FUTURA contra el backend
 * (`/auth/**`, `/users/**`) sin tener que repetir el mapeo código→mensaje en
 * cada componente — un solo lugar, igual que `auth-errors.ts` es el único
 * lugar que conoce los códigos.
 *
 * Gestión por código (lista "Códigos de error" de la guía de endpoints):
 * - `PASSWORD_CHANGE_REQUIRED` (403, cualquier endpoint protegido mientras
 *   `mustChangePassword` sea true): aviso + marca la sesión como "debe
 *   cambiar contraseña" + redirige a /cambiar-password — así el usuario no
 *   se queda en una pantalla cuyas llamadas fallan todas.
 * - Resto de códigos con catálogo: toast con el mensaje del catálogo. Los de
 *   sesión (`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`,
 *   `REFRESH_TOKEN_EXPIRED`, `USER_LOCKED_OR_INACTIVE`) además cierran la
 *   sesión en `AuthService.refreshAccessToken`.
 * - 403 SIN código (Spring Security rechazó por falta de permiso): toast
 *   genérico de "sin permiso". EXCEPCIÓN: el Gateway rechaza con ese mismo 403
 *   sin código (formato de Spring, ver la guía) cuando el token todavía lleva
 *   `mustChangePassword` — probado contra DEV: `GET /users` con el token de
 *   una cuenta con contraseña temporal responde `{ timestamp, status: 403,
 *   error: "Forbidden", path }`, nunca `PASSWORD_CHANGE_REQUIRED`. Si la sesión
 *   está marcada como "debe cambiar contraseña", ese 403 se trata igual que
 *   `PASSWORD_CHANGE_REQUIRED` (aviso + redirección) en vez de decir "sin
 *   permiso", que sería engañoso.
 * - 5xx sin código: toast genérico de error del servidor.
 * - 400 sin código (validación de campos) NO se avisa aquí: cada formulario
 *   decide el texto (p. ej. contraseña corta en "Actualizar contraseña").
 *
 * SIEMPRE re-lanza el error (`throwError`) después de mostrar el toast: el
 * `.subscribe({ error })` de quien hizo la llamada debe seguir corriendo
 * igual (p. ej. para reactivar un botón "Guardando…", o para el manejo
 * propio de `AuthService.refreshAccessToken` ante REFRESH_TOKEN_REUSED) —
 * este interceptor solo AGREGA el aviso visual, nunca reemplaza el manejo
 * existente.
 */
export const httpErrorAlertInterceptor: HttpInterceptorFn = (req, next) => {
  const message = inject(NzMessageService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const code = extractErrorCode(err);
        const gatewayPendingPassword = !code && err.status === 403 && auth.currentUser()?.mustChangePasswordHint === true;
        if (code === PASSWORD_CHANGE_REQUIRED_CODE || gatewayPendingPassword) {
          auth.markPasswordChangeRequired();
          if (!router.url.startsWith(CHANGE_PASSWORD_URL)) {
            message.warning(ERROR_CODE_MESSAGES[PASSWORD_CHANGE_REQUIRED_CODE]);
            void router.navigateByUrl(CHANGE_PASSWORD_URL);
          }
        } else if (code) {
          if (!CODES_WITH_OWN_UI.has(code)) {
            message.error(backendErrorMessage(err) ?? `Ocurrió un error inesperado (${code}).`);
          }
        } else if (err.status === 403) {
          message.error(FORBIDDEN_WITHOUT_CODE_MESSAGE);
        } else if (err.status >= 500) {
          message.error(SERVER_ERROR_MESSAGE);
        }
      }
      return throwError(() => err);
    }),
  );
};
