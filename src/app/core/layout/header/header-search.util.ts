import { PermissionKey, RoleId } from '../../../shared/models/access.model';

/**
 * Pantalla buscable desde el Header.
 *
 * @remarks Sin `permission`, visible para cualquier usuario autenticado; `Header` filtra por permiso antes de {@link searchPages}.
 * @see docs/codigo/layout-y-tema.md#header
 */
export interface SearchablePage {
  label: string;
  path: string;
  keywords: string[];
  permission?: PermissionKey;
  role?: RoleId; // además del permiso, exclusiva de este rol (ver permissionGuard)
}

/** Catálogo completo de pantallas buscables (solo rutas sin parámetros). */
export const SEARCHABLE_PAGES: SearchablePage[] = [
  { label: 'Dashboard', path: '/dashboard', keywords: ['resumen', 'ventas', 'inicio'], permission: 'view_dashboard' },
  {
    label: 'Conciliación',
    path: '/conciliacion',
    keywords: ['bancaria', 'transacciones', 'liquidaciones'],
    permission: 'view_reconciliation',
  },
  {
    label: 'Catálogos cargados',
    path: '/catalogos',
    keywords: ['catalogos', 'listas', 'homologaciones', 'dian', 'netsuite', 'maestros'],
  },
  {
    label: 'Usuarios',
    path: '/usuarios',
    keywords: ['administración', 'administracion', 'cuentas'],
    permission: 'manage_users',
  },
  { label: 'Nuevo usuario', path: '/usuarios/nuevo', keywords: ['crear', 'alta'], permission: 'manage_users' },
  {
    label: 'Roles y permisos',
    path: '/gestion-de-roles',
    keywords: ['roles', 'permisos', 'accesos'],
    permission: 'manage_roles',
    role: 'ADMIN',
  },
  { label: 'Nuevo rol', path: '/gestion-de-roles/nuevo', keywords: ['crear', 'roles', 'permisos'], permission: 'manage_roles', role: 'ADMIN' },
  {
    label: 'Auditoría de usuarios',
    path: '/usuarios/auditoria',
    keywords: ['historial', 'log'],
    // Permiso propio (matriz 7.16 del DED) — ver app.routes.ts.
    permission: 'view_audit_log',
  },
  { label: 'Perfil', path: '/perfil', keywords: ['cuenta', 'yo', 'información general'] },
];

/**
 * Filtra las pantallas cuyo label o keyword contiene `query`, sin distinguir mayúsculas.
 *
 * @returns Lista vacía si `query` está vacío: los resultados solo aparecen mientras se escribe.
 */
export function searchPages(pages: SearchablePage[], query: string): SearchablePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return pages.filter(
    (page) => page.label.toLowerCase().includes(q) || page.keywords.some((keyword) => keyword.includes(q)),
  );
}
