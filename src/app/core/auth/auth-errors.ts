/**
 * Mensaje de UI por cada `code` de error de negocio del backend (`{ error, code }`).
 *
 * @remarks El front decide solo por `code`, nunca por el texto de `error`.
 * @see docs/codigo/interceptores-y-errores.md#contrato-de-errores
 */
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
  ROLE_NOT_FOUND: 'El rol no existe o ya fue dado de baja.',
  ROLE_ALREADY_EXISTS: 'Ya existe un rol con ese nombre (incluidos los dados de baja).',
  ROLE_IN_USE: 'El rol está asignado a usuarios; quítaselo antes de eliminarlo.',
  INVALID_PERMISSION: 'Uno de los permisos indicados no es válido.',
  INVALID_LOCATION: 'Una de las subsidiarias o ubicaciones indicadas no existe o no está activa.',
  INVALID_CATALOG_ITEM: 'Uno de los cargos, puestos, departamentos o áreas indicados no existe o no está activo.',
  INVALID_USER_STATUS: 'El estado indicado no es válido.',
  ROLE_ASSIGNMENT_FORBIDDEN: 'No tienes permiso para asignar roles a un usuario.',
  CANNOT_DELETE_SELF: 'No puedes eliminar tu propia cuenta.',
};

/**
 * Mensaje para un 403 sin `code` (rechazo de Spring Security por permiso faltante en el JWT).
 *
 * @see docs/codigo/interceptores-y-errores.md#403-sin-codigo
 */
export const FORBIDDEN_WITHOUT_CODE_MESSAGE =
  'Tu cuenta no tiene el permiso necesario para realizar esta acción. Contacta al administrador.';

/** Mensaje cuando el backend responde 5xx sin `code`. */
export const SERVER_ERROR_MESSAGE = 'El servidor no pudo procesar la solicitud. Intenta de nuevo en unos minutos.';

/** `code` del 403 que exige cambiar la contraseña antes de continuar. */
export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';
/** `code` del 401 de `/auth/login` por credenciales inválidas. */
export const INVALID_CREDENTIALS_CODE = 'INVALID_CREDENTIALS';

/** `code` del 401 de `/auth/refresh` tras 30 minutos de inactividad. */
export const SESSION_IDLE_TIMEOUT_CODE = 'SESSION_IDLE_TIMEOUT';

/** Cuerpo de error de negocio del backend. */
export interface AuthErrorBody {
  error: string;
  code?: string;
}

/** Subconjunto estructural de `HttpErrorResponse` (`status` y body parseado en `error`). */
export interface AuthErrorResponse {
  status: number;
  error: AuthErrorBody | null;
}

/**
 * Extrae el `code` del cuerpo de error del backend.
 *
 * @param err - Cualquier error; acepta un objeto plano `{ status, error }` además de `HttpErrorResponse`.
 * @returns `null` si no trae `code`.
 */
export function extractErrorCode(err: unknown): string | null {
  const res = err as Partial<AuthErrorResponse> | null;
  return res?.error?.code ?? null;
}

/**
 * Texto `error` del backend para mostrarse tal cual (p. ej. los minutos restantes de `ACCOUNT_LOCKED`).
 *
 * @returns `null` si no viene o está vacío. Solo para mostrar: las decisiones van por `code`.
 */
export function serverErrorText(err: unknown): string | null {
  const text = (err as Partial<AuthErrorResponse> | null)?.error?.error;
  return typeof text === 'string' && text.trim() ? text : null;
}

/** Indica si el error es un 401 con `code` `SESSION_IDLE_TIMEOUT`. */
export function isSessionIdleTimeout(err: unknown): boolean {
  const res = err as Partial<AuthErrorResponse> | null;
  return res?.status === 401 && extractErrorCode(err) === SESSION_IDLE_TIMEOUT_CODE;
}

/**
 * Mensaje de {@link ERROR_CODE_MESSAGES} para el `code` del error.
 *
 * @returns `null` si no trae `code` (red, CORS) o el código no está en el catálogo.
 * @see docs/codigo/interceptores-y-errores.md#contrato-de-errores
 */
export function backendErrorMessage(err: unknown): string | null {
  const code = extractErrorCode(err);
  return code ? (ERROR_CODE_MESSAGES[code] ?? null) : null;
}

/**
 * Motivo de un cierre de sesión no pedido: `idle_timeout` (lo detecta `POST /auth/refresh`) o `invalid_token` (401 en otra llamada).
 *
 * @see docs/codigo/sesion-y-acceso.md#cierre-de-sesion
 */
export type SessionEndReason = 'idle_timeout' | 'invalid_token';
