// Contrato de errores del auth-service acordado con backend.
//
// Expiración de sesión por inactividad: `POST /auth/refresh` con un refresh
// token que lleva más de 30 minutos sin actividad (parámetro configurable del
// backend) responde:
//   status 401
//   body   { "error": "Sesion expirada por inactividad. Debe iniciar sesion de nuevo.",
//            "code": "SESSION_IDLE_TIMEOUT" }
// El frontend decide SOLO por `code` — nunca por el texto de `error`.
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

export function isSessionIdleTimeout(err: unknown): boolean {
  const res = err as Partial<AuthErrorResponse> | null;
  return res?.status === 401 && res.error?.code === SESSION_IDLE_TIMEOUT_CODE;
}

// Por qué terminó la última sesión — la lee `Login` para explicarlo en
// pantalla. `null` = no hay nada que avisar (primera visita, logout manual o
// ya se mostró).
export type SessionEndReason = 'idle_timeout';
