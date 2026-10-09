import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/auth/data/auth.service';
import { INVALID_CREDENTIALS_CODE, extractErrorCode, isSessionIdleTimeout } from '../../features/auth/data/auth-errors';

// Endpoints del auth-service real que NO llevan Bearer — `permitAll()` en
// SecurityConfig.java (coctel_midd): login todavía no tiene sesión, refresh
// se autentica con el refreshToken del BODY (no un access token), logout
// acepta invalidar sin uno. Cualquier otro endpoint de `/auth/**` o
// `/users/**` exige un access token válido (`anyRequest().authenticated()` /
// `hasAnyRole(...)`).
const PUBLIC_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

function isBackendRequest(url: string): boolean {
  return url.startsWith(environment.apiUrl);
}

function isPublicPath(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url.startsWith(`${environment.apiUrl}${path}`));
}

/**
 * CU2 — "Token validado en cada petición (API Gateway)": antes, cada método
 * de `AuthService` agregaba el Bearer a mano (y varios directamente no lo
 * hacían — sin este interceptor una llamada nueva era fácil de olvidar). Con
 * este interceptor, CUALQUIER petición al backend real
 * (`environment.apiUrl`) lo lleva automáticamente salvo los 3 endpoints
 * públicos de arriba — un solo lugar que lo garantiza, no una convención que
 * cada método debe recordar seguir.
 *
 * Además, un 401 en cualquier llamada autenticada (una que SÍ llevaba Bearer)
 * invalida la sesión — antes no había NINGÚN manejo global: un access token
 * rechazado fuera de la ventana de refresco proactivo de `AuthService`
 * (revocado del lado del servidor, reloj desincronizado, etc.) se quedaba
 * silencioso hasta que cada `.subscribe({ error })` decidiera qué hacer, si
 * es que hacía algo. `AuthService.invalidateSession` solo limpia la sesión;
 * el redirect a /login lo hace el `effect()` de `App` que ya observa
 * `sessionEndReason` (mismo mecanismo que `idle_timeout`, un solo lugar que
 * decide cuándo navegar). Se excluye `/auth/refresh` del manejo de 401 de
 * este interceptor porque ESE 401 ya lo maneja
 * `AuthService.refreshAccessToken` de forma específica (distingue
 * `SESSION_IDLE_TIMEOUT` de cualquier otro rechazo) — manejarlo aquí TAMBIÉN
 * duplicaría el cierre de sesión. Un 401 con código `INVALID_CREDENTIALS`
 * (contraseña actual incorrecta en change-password) NO cierra la sesión, y
 * uno con `SESSION_IDLE_TIMEOUT` la cierra con el aviso de inactividad.
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
        // `INVALID_CREDENTIALS` en una llamada autenticada es un error de
        // NEGOCIO, no un token rechazado: `POST /auth/change-password` lo
        // devuelve (401) cuando la contraseña ACTUAL es incorrecta. Cerrar la
        // sesión ahí sacaría al usuario por un simple error de tecleo.
        if (extractErrorCode(err) !== INVALID_CREDENTIALS_CODE) {
          auth.invalidateSession(isSessionIdleTimeout(err) ? 'idle_timeout' : 'invalid_token');
        }
      }
      return throwError(() => err);
    }),
  );
};
