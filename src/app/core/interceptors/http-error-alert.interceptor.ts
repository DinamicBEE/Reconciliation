import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
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

// Códigos con aviso propio en pantalla: no reciben el toast genérico.
// Ver docs/codigo/interceptores-y-errores.md#codigos-con-ui-propia
const CODES_WITH_OWN_UI = new Set(['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'SESSION_IDLE_TIMEOUT']);

const CHANGE_PASSWORD_URL = '/cambiar-password';

/**
 * Omite el toast genérico en una llamada que muestra sus propios errores (p. ej. `POST /sales/capture`).
 *
 * @remarks `PASSWORD_CHANGE_REQUIRED` se gestiona igual aunque esté activo.
 * @example `http.post(url, body, { context: new HttpContext().set(SKIP_HTTP_ERROR_ALERT, true) })`
 */
export const SKIP_HTTP_ERROR_ALERT = new HttpContextToken<boolean>(() => false);

/**
 * Muestra un toast genérico para los errores del backend que ningún llamador maneja, y lleva a `/cambiar-password` cuando el backend lo exige.
 *
 * @remarks Siempre re-lanza el error: solo agrega el aviso, el `subscribe({ error })` del llamador sigue corriendo.
 * @see docs/codigo/interceptores-y-errores.md#alerta-generica
 */
export const httpErrorAlertInterceptor: HttpInterceptorFn = (req, next) => {
  const message = inject(NzMessageService);
  const auth = inject(AuthService);
  const router = inject(Router);

  const skipGenericAlert = req.context.get(SKIP_HTTP_ERROR_ALERT);

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
        } else if (skipGenericAlert) {
          // La llamada muestra su propio error (ver SKIP_HTTP_ERROR_ALERT).
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
