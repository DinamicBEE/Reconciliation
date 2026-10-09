// Contrato de errores del auth-service acordado con backend — TODO error de
// negocio responde `{ error: string, code: string }` (GlobalExceptionHandler
// en el backend real). El frontend decide SOLO por `code` (estable) — nunca
// por el texto de `error` (pensado para mostrarse, puede cambiar de
// redacción).
//
// `ERROR_CODE_MESSAGES` es el catálogo COMPLETO de los códigos de la
// sección "Códigos de error" de la `Guia_Endpoints_Usuarios_Roles_Permisos`
// (AuthController + UserAdminController, ver GlobalExceptionHandler.java) —
// se actualiza cada vez que el backend agrega uno nuevo. `notifyBackendError` (`features/auth/data/mock-http-error-alert.ts`) lo usa para
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
  INVALID_PERMISSION: 'Uno de los permisos indicados no es válido.',
  INVALID_LOCATION: 'Una de las subsidiarias o ubicaciones indicadas no existe o no está activa.',
  INVALID_USER_STATUS: 'El estado indicado no es válido.',
  ROLE_ASSIGNMENT_FORBIDDEN: 'No tienes permiso para asignar roles a un usuario.',
  CANNOT_DELETE_SELF: 'No puedes eliminar tu propia cuenta.',
};

// 403 SIN `code`: lo rechaza Spring Security (`SecurityConfig`, la
// autoridad requerida falta en el JWT) ANTES de llegar al
// `GlobalExceptionHandler`, así que no trae el cuerpo `{ error, code }`.
// Con la autorización por permiso (`hasAuthority("manage_users")`, etc.)
// el mensaje habla de permisos, no de roles.
export const FORBIDDEN_WITHOUT_CODE_MESSAGE =
  'Tu cuenta no tiene el permiso necesario para realizar esta acción. Contacta al administrador.';

// Mensaje cuando el backend responde 5xx sin `code`.
export const SERVER_ERROR_MESSAGE = 'El servidor no pudo procesar la solicitud. Intenta de nuevo en unos minutos.';

export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';
export const INVALID_CREDENTIALS_CODE = 'INVALID_CREDENTIALS';

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

// Texto `error` que el backend manda para mostrarse tal cual — p. ej.
// ACCOUNT_LOCKED incluye los minutos restantes del bloqueo temporal. Solo
// para MOSTRAR (la decisión siempre va por `code`); `null` si no viene.
export function serverErrorText(err: unknown): string | null {
  const text = (err as Partial<AuthErrorResponse> | null)?.error?.error;
  return typeof text === 'string' && text.trim() ? text : null;
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
// el fallback genérico en `notifyBackendError`).
export function backendErrorMessage(err: unknown): string | null {
  const code = extractErrorCode(err);
  return code ? (ERROR_CODE_MESSAGES[code] ?? null) : null;
}

// Por qué terminó la última sesión — la lee `Login` para explicarlo en
// pantalla. `null` = no hay nada que avisar (primera visita, logout manual o
// ya se mostró). `invalid_token`: un 401 en CUALQUIER llamada autenticada
// que no sea el propio refresh (ver `AuthService.request`) — el access
// token fue rechazado fuera de la ventana de refresco proactivo (revocado
// del lado del servidor, reloj desincronizado, etc.), distinto de
// `idle_timeout` (ese lo detecta específicamente `POST /auth/refresh`).
export type SessionEndReason = 'idle_timeout' | 'invalid_token';
