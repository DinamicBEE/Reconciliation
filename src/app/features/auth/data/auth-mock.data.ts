export interface MockUser {
  username: string;
  password: string;
  displayName: string;
  // Nombre real de la persona (nombre + apellidos) y su rol — distintos de
  // `displayName`, que históricamente guarda un texto tipo-rol usado como
  // `actorName` en la auditoría de user-management (ver AuthService). El
  // card de usuario del Header necesita el nombre real de pila para mostrar
  // "primer nombre + primer apellido", por eso viven separados en vez de
  // forzar `displayName` a cumplir ambos papeles.
  fullName: string;
  role: string;
}

// Credenciales de demo — no hay backend todavía. El día que exista, esta
// lista desaparece y `AuthService.login` pasa a llamar al endpoint real.
export const MOCK_USERS: MockUser[] = [
  {
    username: 'admin',
    password: 'Conciliacion2026',
    displayName: 'Administrador',
    fullName: 'Ana Martínez López',
    role: 'Administrador',
  },
  {
    username: 'analista',
    password: 'Analista2026',
    displayName: 'Analista de Conciliación',
    fullName: 'Carlos Gómez Ruiz',
    role: 'Analista de Conciliación',
  },
];
