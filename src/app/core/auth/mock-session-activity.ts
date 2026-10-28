// Última actividad de la sesión simulada: base del SESSION_IDLE_TIMEOUT del refresh mock.
// Vive en sessionStorage para sobrevivir a un F5. Ver docs/codigo/mock-backend.md
const STORAGE_KEY = 'conciliation-mock-session-activity';

// Parámetro de inactividad del backend (30 minutos, acordado con backend).
export const MOCK_SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;

export function touchMockSessionActivity(now = Date.now()): void {
  sessionStorage.setItem(STORAGE_KEY, String(now));
}

// Milisegundos desde la última actividad; sin registro cuenta como recién activa.
export function mockSessionIdleMs(now = Date.now()): number {
  const last = Number(sessionStorage.getItem(STORAGE_KEY));
  return last > 0 ? now - last : 0;
}

export function clearMockSessionActivity(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
