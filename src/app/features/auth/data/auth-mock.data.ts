export interface MockUser {
  username: string;
  password: string;
  displayName: string;
}

// Credenciales de demo — no hay backend todavía. El día que exista, esta
// lista desaparece y `AuthService.login` pasa a llamar al endpoint real.
export const MOCK_USERS: MockUser[] = [
  { username: 'admin', password: 'Conciliacion2026', displayName: 'Administrador' },
  { username: 'analista', password: 'Analista2026', displayName: 'Analista de Conciliación' },
];
