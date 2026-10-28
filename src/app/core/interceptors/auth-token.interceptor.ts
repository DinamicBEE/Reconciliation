import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { INVALID_CREDENTIALS_CODE, extractErrorCode, isSessionIdleTimeout } from '../auth/auth-errors';

// `permitAll()` en el backend: van sin Bearer. Ver docs/codigo/interceptores-y-errores.md#token-bearer
const PUBLIC_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

function isBackendRequest(url: string): boolean {
  return url.startsWith(environment.apiUrl);
}

function isPublicPath(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url.startsWith(`${environment.apiUrl}${path}`));
}

/**
 * Agrega `Authorization: Bearer` a toda petición al backend salvo las rutas públicas, y cierra la sesión ante un 401.
 *
 * @remarks Un 401 `INVALID_CREDENTIALS` no cierra la sesión; las rutas públicas (incluido el refresh) no pasan por el manejo de 401.
 * @see docs/codigo/interceptores-y-errores.md#token-bearer
 * @see docs/codigo/interceptores-y-errores.md#renovacion-ante-401
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (!isBackendRequest(req.url) || isPublicPath(req.url)) {
    return next(req);
  }

  const accessToken = auth.accessToken();
  const authReq = accessToken ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }) : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // `POST /auth/change-password` responde 401 `INVALID_CREDENTIALS` si la contraseña actual es incorrecta.
        if (extractErrorCode(err) !== INVALID_CREDENTIALS_CODE) {
          auth.invalidateSession(isSessionIdleTimeout(err) ? 'idle_timeout' : 'invalid_token');
        }
      }
      return throwError(() => err);
    }),
  );
};
