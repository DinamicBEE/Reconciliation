export interface MockUser {
  username: string;
  password: string;
  displayName: string;
  // Id del registro en `user-management` (`AppUser.id`, ver
  // user-management-mock.data.ts) que representa a esta MISMA persona — así
  // el Header/Perfil pueden mostrar su nombre real, foto y rol leyendo de
  // esa única fuente de verdad en vez de duplicar los datos aquí.
  appUserId: string;
}

// Credenciales de demo — no hay backend todavía. El día que exista, esta
// lista desaparece y `AuthService.login` pasa a llamar al endpoint real.
//
// Una cuenta por rol (ver `RoleId`/`ROLES` en user-management.model.ts),
// tomada de `MOCK_USERS` en user-management-mock.data.ts — así se puede
// entrar a la app con cada uno de los 4 roles y comprobar en vivo que cada
// uno ve solo su módulo (`permissionGuard`/`AccessControlService`, ver
// app.routes.ts). El usuario/contraseña de cada una se repite también en
// login.html ("Cuentas de demo") para que sean fáciles de probar sin tener
// que abrir este archivo.
export const MOCK_USERS: MockUser[] = [
  {
    username: 'superadmin',
    password: 'Conciliacion2026',
    displayName: 'Administrador Principal',
    appUserId: 'u0001', // Superadministrador — acceso a todo.
  },
  {
    username: 'administrador',
    password: 'Administrador2026',
    displayName: 'Carlos Medina',
    appUserId: 'u0006', // Administrador — solo Administración de usuarios.
  },
  {
    username: 'contabilidad',
    password: 'Contabilidad2026',
    displayName: 'Gabriela Vargas',
    appUserId: 'u0018', // Contabilidad — solo Resumen de venta.
  },
  {
    username: 'tesoreria',
    password: 'Tesoreria2026',
    displayName: 'Roberto Sánchez',
    appUserId: 'u0011', // Tesorería — solo Conciliación bancaria.
  },
];
