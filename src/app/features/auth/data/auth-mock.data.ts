import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { PermissionDto, RoleDto } from './auth.service';

// Datos de partida del backend SIMULADO (`auth-mock-backend.ts`) — esta rama
// trabaja solo con data local. Mismas formas que devuelve el auth-service real
// (`GET /roles`, `GET /permissions`, catálogos del login) para que
// `AuthService` y todo lo que cuelga de él (`AccessCatalogService`,
// `AuditLogService`, `UserManagementService`) sea el mismo código que en la rama
// de integración (`feature/login-coctel-del-mar-integration`).

// Contraseñas de las cuentas demo — las mismas que muestra la pantalla de
// login (y que siembra `dev-env/seed-demo-users.sql` en la rama de
// integración). La llave es el correo (el login es por correo, igual que el
// backend real).
export const MOCK_DEMO_PASSWORDS: Record<string, string> = {
  'admin@conciliacion.mx': 'Conciliacion2026',
  'carlos.medina@conciliacion.mx': 'Administrador2026',
  'gabriela.vargas@conciliacion.mx': 'Contabilidad2026',
  'roberto.sanchez@conciliacion.mx': 'Tesoreria2026',
  'laura.pineda@conciliacion.mx': 'Costos2026',
};

// Contraseña del resto de las cuentas sembradas (personas ficticias de la
// lista de usuarios) — por si hace falta entrar con alguna para probar.
export const MOCK_DEFAULT_PASSWORD = 'Demo2026';

// Cuentas que arrancan con cambio obligatorio de contraseña (su contraseña
// demo ES la temporal — así se ve en "Organización" del detalle).
export const MOCK_MUST_CHANGE_PASSWORD = new Set(['gabriela.vargas@conciliacion.mx']);

// `GET /roles` — matriz 7.16 del DED (la misma que la rama de integración
// siembra encima de la de DEV). `capture_sales` solo ADMIN, como en DEV.
export const MOCK_ROLES: RoleDto[] = [
  {
    code: 'ADMIN',
    name: 'Administrador',
    defaultPermissions: [
      'view_dashboard',
      'view_reconciliation',
      'manage_differences',
      'import_settlements',
      'export_reports',
      'manage_users',
      'manage_roles',
      'view_audit_log',
      'view_catalogs',
      'capture_sales',
    ],
  },
  { code: 'ALTAS', name: 'Encargado de altas de usuarios', defaultPermissions: ['manage_users', 'manage_roles', 'view_audit_log'] },
  { code: 'CONTABILIDAD', name: 'Contabilidad', defaultPermissions: ['view_dashboard', 'export_reports', 'view_catalogs'] },
  {
    code: 'TESORERIA',
    name: 'Tesorería',
    defaultPermissions: [
      'view_dashboard',
      'view_reconciliation',
      'manage_differences',
      'import_settlements',
      'export_reports',
      'view_catalogs',
    ],
  },
  { code: 'COSTOS', name: 'Costos', defaultPermissions: ['view_dashboard', 'export_reports', 'view_catalogs'] },
];

// `GET /permissions` — `module` es el título del bloque en el grid de
// "Seguridad y acceso".
export const MOCK_PERMISSIONS: PermissionDto[] = [
  { code: 'view_dashboard', description: 'Ver resumen de venta', module: 'Resumen de venta' },
  { code: 'capture_sales', description: 'Lanzar la captura manual de ventas', module: 'Resumen de venta' },
  { code: 'view_reconciliation', description: 'Ver conciliación', module: 'Conciliación bancaria' },
  { code: 'manage_differences', description: 'Gestionar diferencias', module: 'Conciliación bancaria' },
  { code: 'import_settlements', description: 'Importar liquidaciones', module: 'Conciliación bancaria' },
  { code: 'export_reports', description: 'Exportar reportes', module: 'Conciliación bancaria' },
  { code: 'manage_users', description: 'Administrar usuarios', module: 'Administración de usuarios' },
  { code: 'manage_roles', description: 'Administrar roles y permisos', module: 'Administración de usuarios' },
  { code: 'view_audit_log', description: 'Ver historial y auditoría', module: 'Administración de usuarios' },
  { code: 'view_catalogs', description: 'Consultar catálogos cargados', module: 'Catálogos' },
];

// Catálogos de organización (los mismos ids que siembra el backend local).
export const MOCK_SUBSIDIARIAS: CatalogEntry[] = [{ id: 1, nombre: 'Conciliación Bancaria' }];

export const MOCK_UBICACIONES: CatalogEntry[] = [
  { id: 1, nombre: 'Sucursal Polanco' },
  { id: 2, nombre: 'Sucursal Condesa' },
  { id: 3, nombre: 'Sucursal Roma' },
  { id: 4, nombre: 'Sucursal Centro' },
];
