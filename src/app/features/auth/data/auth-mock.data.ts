export interface MockUser {
  username: string;
  password: string;
  displayName: string;
  // Id del registro en `user-management` (`AppUser.id`, ver
  // user-management-mock.data.ts) que representa a esta MISMA persona — así
  // el Header/Perfil pueden mostrar su nombre real, foto y rol leyendo de
  // esa única fuente de verdad en vez de duplicar los datos aquí. 'u0001'
  // (admin@conciliacion.mx) y 'u0002' (analista@conciliacion.mx) son
  // exactamente los mismos dos usuarios demo, solo que ese mock los tiene
  // con el registro completo (nombre, foto, roles, organización...).
  appUserId: string;
}

// Credenciales de demo — no hay backend todavía. El día que exista, esta
// lista desaparece y `AuthService.login` pasa a llamar al endpoint real.
export const MOCK_USERS: MockUser[] = [
  {
    username: 'admin',
    password: 'Conciliacion2026',
    displayName: 'Administrador',
    appUserId: 'u0001',
  },
  {
    username: 'analista',
    password: 'Analista2026',
    displayName: 'Analista de Conciliación',
    appUserId: 'u0002',
  },
];
