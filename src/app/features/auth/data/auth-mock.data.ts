import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { RoleId } from '../../user-management/data/user-management.model';

export interface MockUser {
  username: string;
  password: string;
  displayName: string;
  // Id del registro en `user-management` (`AppUser.id`, ver
  // user-management-mock.data.ts) que representa a esta MISMA persona — así
  // el Header/Perfil pueden mostrar su nombre real, foto y rol leyendo de
  // esa única fuente de verdad en vez de duplicar los datos aquí.
  appUserId: string;
  // Mismos códigos de rol que devolvería el backend en el login
  // (`UserSummaryDto.roles`) — deben coincidir con `roleIds` del `AppUser`
  // vinculado.
  roles: RoleId[];
}

// Credenciales de demo — no hay backend en esta rama. El día que exista,
// esta lista desaparece y `AuthService.login` pasa a llamar al endpoint real
// (la integración vive en `feature/login-coctel-del-mar-integration`).
//
// Una cuenta por rol con módulo propio (ver `RoleId`/`ROLES` en
// user-management.model.ts), tomada de `MOCK_USERS` en
// user-management-mock.data.ts — así se puede entrar a la app con cada rol y
// comprobar en vivo que cada uno ve solo su módulo
// (`permissionGuard`/`AccessControlService`, ver app.routes.ts). El
// usuario/contraseña de cada una se repite también en login.html ("Cuentas
// de demo") para que sean fáciles de probar sin tener que abrir este archivo.
export const MOCK_USERS: MockUser[] = [
  {
    username: 'superadmin',
    password: 'Conciliacion2026',
    displayName: 'Administrador Principal',
    appUserId: 'u0001', // Administrador — acceso a todo.
    roles: ['ADMIN'],
  },
  {
    username: 'administrador',
    password: 'Administrador2026',
    displayName: 'Carlos Medina',
    appUserId: 'u0006', // Encargado de altas — solo Administración de usuarios.
    roles: ['ALTAS'],
  },
  {
    username: 'contabilidad',
    password: 'Contabilidad2026',
    displayName: 'Gabriela Vargas',
    appUserId: 'u0018', // Contabilidad — solo Resumen de venta.
    roles: ['CONTABILIDAD'],
  },
  {
    username: 'tesoreria',
    password: 'Tesoreria2026',
    displayName: 'Roberto Sánchez',
    appUserId: 'u0011', // Tesorería — solo Conciliación bancaria.
    roles: ['TESORERIA'],
  },
];

// Catálogos de subsidiaria/ubicación que el login real devuelve en
// `UserSummaryDto.subsidiarias`/`.ubicaciones` — mismos ids y nombres que
// los sembrados en el backend. Los nombres de ubicación deben coincidir
// EXACTAMENTE con `STORE_LABEL` (`shared/models/sale.model.ts`): el filtro
// de tienda del Resumen de venta hace el puente al mock de ventas por nombre
// (ver `storeOptions` en sales-dashboard.ts). Todas las cuentas demo tienen
// acceso a todas.
export const MOCK_SUBSIDIARIAS: CatalogEntry[] = [{ id: 1, nombre: 'Conciliación Bancaria' }];

export const MOCK_UBICACIONES: CatalogEntry[] = [
  { id: 1, nombre: 'Sucursal Polanco' },
  { id: 2, nombre: 'Sucursal Condesa' },
  { id: 3, nombre: 'Sucursal Roma' },
  { id: 4, nombre: 'Sucursal Centro' },
];
