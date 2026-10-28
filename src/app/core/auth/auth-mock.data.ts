import { CatalogEntry } from '../../shared/models/catalog-entry.model';
import type { UbicacionCatalogEntry } from '../services/organization-catalog.service';
import { PermissionDto, RoleDto } from './access-catalog.service';

// Datos de partida del backend simulado (`auth-mock-backend.ts`).

// Contraseñas de las cuentas demo, por correo (las de la pantalla de login).
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

// Catálogos de organización (mismos ids que `GET /catalogs/...` en esta rama).
export const MOCK_SUBSIDIARIAS: CatalogEntry[] = [
  { id: 1, nombre: 'Coctel del Mar' },
  { id: 2, nombre: 'Hipermar Fish' },
];

const SEDES = ['Cajica', '184', '123', '100', '69', 'NB', 'PVR', 'Usaquen'];

export const MOCK_UBICACIONES: UbicacionCatalogEntry[] = [
  ...SEDES.map((sede, index) => ({ id: index + 1, nombre: `Restaurante Sede ${sede}`, subsidiariaId: 1 })),
  ...SEDES.map((sede, index) => ({ id: index + 9, nombre: `Hipermar Sede ${sede}`, subsidiariaId: 2 })),
];

export const MOCK_CARGOS: CatalogEntry[] = [
  { id: 1, nombre: 'Gerente' },
  { id: 2, nombre: 'Analista' },
  { id: 3, nombre: 'Auxiliar' },
];

export const MOCK_PUESTOS: CatalogEntry[] = [
  { id: 1, nombre: 'Analista de Conciliación' },
  { id: 2, nombre: 'Supervisor de Conciliación' },
  { id: 3, nombre: 'Supervisor de Tesorería' },
];

export const MOCK_DEPARTAMENTOS: CatalogEntry[] = [
  { id: 1, nombre: 'Finanzas' },
  { id: 2, nombre: 'Operaciones' },
];

export const MOCK_AREAS: CatalogEntry[] = [
  { id: 1, nombre: 'Conciliación Bancaria' },
  { id: 2, nombre: 'Tesorería' },
  { id: 3, nombre: 'Costos' },
];
