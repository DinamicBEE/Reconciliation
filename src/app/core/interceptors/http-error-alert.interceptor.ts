import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { catchError, throwError } from 'rxjs';
import { backendErrorMessage, extractErrorCode } from '../../features/auth/data/auth-errors';

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

/**
 * Alerta genérica para errores de negocio del backend real (auth-service)
 * que ningún llamador maneja de forma específica — ver `CODES_WITH_OWN_UI`
 * arriba. Vive como interceptor (no en cada `.subscribe({ error })`) porque
 * aplica igual a cualquier llamada presente O FUTURA contra el backend
 * (`/auth/**`, `/users/**`) sin tener que repetir el mapeo código→mensaje en
 * cada componente — un solo lugar, igual que `auth-errors.ts` es el único
 * lugar que conoce los códigos.
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

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const code = extractErrorCode(err);
        if (code && !CODES_WITH_OWN_UI.has(code)) {
          message.error(backendErrorMessage(err) ?? `Ocurrió un error inesperado (${code}).`);
        }
      }
      return throwError(() => err);
    }),
  );
};
