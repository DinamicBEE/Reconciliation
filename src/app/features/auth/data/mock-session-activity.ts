// Estado "del lado del servidor" del mock: última actividad de la sesión.
// En el backend real, la actividad la registra el propio auth-service con
// cada petición autenticada, y es él quien rechaza el refresh tras el
// tiempo de inactividad configurado (ver `auth-errors.ts`). Sin backend, no
// hay peticiones que cuenten como actividad, así que `AuthService` registra
// aquí las interacciones del usuario (clic, tecla, scroll) y el refresh
// mock consulta este valor para decidir si responde SESSION_IDLE_TIMEOUT.
// Todo este archivo desaparece al conectar el backend real.
//
// Vive en sessionStorage (no en la sesión del cliente) para que sobreviva a
// un F5 igual que lo haría el dato en el servidor: si la pestaña se recarga
// después de 30 minutos sin actividad, el primer refresh ya la rechaza.
const STORAGE_KEY = 'conciliation-mock-session-activity';

// Parámetro de inactividad del backend (30 minutos, acordado con backend).
export const MOCK_SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;

export function touchMockSessionActivity(now = Date.now()): void {
  sessionStorage.setItem(STORAGE_KEY, String(now));
}

// Milisegundos desde la última actividad. Sin registro (sesión creada antes
// de existir este mecanismo) cuenta como recién activa, para no expulsar a
// nadie por un dato que nunca se guardó.
export function mockSessionIdleMs(now = Date.now()): number {
  const last = Number(sessionStorage.getItem(STORAGE_KEY));
  return last > 0 ? now - last : 0;
}

export function clearMockSessionActivity(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
