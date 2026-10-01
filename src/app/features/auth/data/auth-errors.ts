// Contrato de errores del auth-service acordado con backend — TODO error de
// negocio responde `{ error: string, code: string }` (GlobalExceptionHandler
// en el backend real). El frontend decide SOLO por `code` (estable) — nunca
// por el texto de `error` (pensado para mostrarse, puede cambiar de
// redacción).
//
// `ERROR_CODE_MESSAGES` es el catálogo COMPLETO de códigos que el backend
// puede devolver hoy (AuthController + UserAdminController, ver
// GlobalExceptionHandler.java) — se actualiza cada vez que el backend agrega
// uno nuevo. `httpErrorAlertInterceptor` (`core/interceptors/`) lo usa para
// mostrar una alerta genérica ante CUALQUIER código de esta lista que no
// tenga ya su propia UI dedicada (ver `CODES_WITH_OWN_UI` ahí) — así un
// código nuevo que el backend agregue mañana, aunque este mapa no lo liste
// todavía, cae al mensaje genérico de `backendErrorMessage` en vez de
// desaparecer sin avisar nada.
export const ERROR_CODE_MESSAGES: Record<string, string> = {
  // /auth/login
  INVALID_CREDENTIALS: 'Usuario o contraseña inválidos.',
  ACCOUNT_LOCKED: 'Usuario bloqueado por intentos fallidos. Contacte al administrador.',
  // Cualquier endpoint protegido, mientras mustChangePassword sea true.
  PASSWORD_CHANGE_REQUIRED: 'Debes cambiar tu contraseña antes de continuar.',
  // /auth/refresh
  INVALID_REFRESH_TOKEN: 'Tu sesión ya no es válida. Inicia sesión de nuevo.',
  REFRESH_TOKEN_REUSED: 'Se detectó un uso indebido de tu sesión. Por seguridad, se cerraron todas tus sesiones activas.',
  REFRESH_TOKEN_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  SESSION_IDLE_TIMEOUT: 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo para continuar.',
  USER_LOCKED_OR_INACTIVE: 'Tu cuenta está bloqueada o inactiva. Contacta al administrador.',
  // /users/** (administración de usuarios)
  USER_NOT_FOUND: 'No se encontró el usuario solicitado.',
  EMAIL_ALREADY_REGISTERED: 'Ya existe un usuario con ese correo electrónico.',
  INVALID_ROLE: 'Uno de los roles indicados no es válido.',
  INVALID_USER_STATUS: 'El estado indicado no es válido.',
  ROLE_ASSIGNMENT_FORBIDDEN: 'No tienes permiso para asignar roles a un usuario.',
};

export const SESSION_IDLE_TIMEOUT_CODE = 'SESSION_IDLE_TIMEOUT';

export interface AuthErrorBody {
  error: string;
  code?: string;
}

// Misma forma que `HttpErrorResponse` (`status` + `error` = body parseado),
// para que el mock de hoy y la llamada HTTP real se validen igual.
export interface AuthErrorResponse {
  status: number;
  error: AuthErrorBody | null;
}

// `unknown`, no `HttpErrorResponse` — así un test puede pasar un objeto
// plano `{ status, error }` sin construir una `HttpErrorResponse` real,
// mismo criterio que ya usaba `isSessionIdleTimeout`.
export function extractErrorCode(err: unknown): string | null {
  const res = err as Partial<AuthErrorResponse> | null;
  return res?.error?.code ?? null;
}

export function isSessionIdleTimeout(err: unknown): boolean {
  const res = err as Partial<AuthErrorResponse> | null;
  return res?.status === 401 && extractErrorCode(err) === SESSION_IDLE_TIMEOUT_CODE;
}

// Mensaje para mostrar al usuario dado un error del backend — `null` si el
// error no trae `code` (no es un error de negocio del backend: caída de
// red, CORS, etc. — esos ya los maneja cada llamador por status, no por
// código) o si el código no está en el catálogo (no debería pasar salvo que
// el backend agregue uno nuevo antes de que este archivo se actualice; ver
// el fallback genérico en `httpErrorAlertInterceptor`).
export function backendErrorMessage(err: unknown): string | null {
  const code = extractErrorCode(err);
  return code ? (ERROR_CODE_MESSAGES[code] ?? null) : null;
}

// Por qué terminó la última sesión — la lee `Login` para explicarlo en
// pantalla. `null` = no hay nada que avisar (primera visita, logout manual o
// ya se mostró). `invalid_token`: un 401 en CUALQUIER llamada autenticada
// que no sea el propio refresh (ver `authTokenInterceptor`) — el access
// token fue rechazado fuera de la ventana de refresco proactivo (revocado
// del lado del servidor, reloj desincronizado, etc.), distinto de
// `idle_timeout` (ese lo detecta específicamente `POST /auth/refresh`).
export type SessionEndReason = 'idle_timeout' | 'invalid_token';
