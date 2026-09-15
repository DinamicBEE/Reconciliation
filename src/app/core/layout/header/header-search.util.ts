import { PermissionKey } from '../../../features/user-management/data/user-management.model';

// Registro de pantallas buscables desde el Header — cada una declara el
// permiso que hace falta para verla (`AccessControlService.hasPermission`,
// ver `header.ts`); sin `permission`, la pantalla es visible para
// cualquier usuario autenticado (hoy solo "Perfil"). El propio Header
// filtra por permiso ANTES de llamar a `searchPages` — este archivo solo
// declara el catálogo completo.
export interface SearchablePage {
  label: string;
  path: string;
  keywords: string[];
  permission?: PermissionKey;
}

export const SEARCHABLE_PAGES: SearchablePage[] = [
  { label: 'Dashboard', path: '/dashboard', keywords: ['resumen', 'ventas', 'inicio'], permission: 'view_dashboard' },
  {
    label: 'Conciliación',
    path: '/conciliacion',
    keywords: ['bancaria', 'transacciones', 'liquidaciones'],
    permission: 'view_reconciliation',
  },
  {
    label: 'Usuarios',
    path: '/usuarios',
    keywords: ['administración', 'administracion', 'cuentas'],
    permission: 'manage_users',
  },
  { label: 'Nuevo usuario', path: '/usuarios/nuevo', keywords: ['crear', 'alta'], permission: 'manage_users' },
  {
    label: 'Auditoría de usuarios',
    path: '/usuarios/auditoria',
    keywords: ['historial', 'log'],
    permission: 'manage_users',
  },
  { label: 'Perfil', path: '/perfil', keywords: ['cuenta', 'yo', 'información general'] },
];

// Función pura y testeable — sin estado, sin DI (ver MASTER.md, criterio de
// "función de derivación pura"). Sin resultados con query vacío: la lista
// de coincidencias solo debe aparecer mientras el usuario está escribiendo.
export function searchPages(pages: SearchablePage[], query: string): SearchablePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return pages.filter(
    (page) => page.label.toLowerCase().includes(q) || page.keywords.some((keyword) => keyword.includes(q)),
  );
}
