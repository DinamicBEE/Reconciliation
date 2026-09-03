// Registro de pantallas buscables desde el Header — solo rutas estáticas
// (sin params) a las que cualquier usuario autenticado tiene acceso hoy: no
// existe todavía un sistema de permisos granular en `AuthUser` (ver
// AuthService — es un tipo mínimo de sesión, distinto de `AppUser`/
// `PermissionKey` de user-management), así que "las pantallas que el
// usuario pueda tener acceso" es, por ahora, el mismo set para todos los
// logeados — el día que `AuthUser` tenga permisos reales, este registro
// filtra por ellos en vez de listarse completo.
export interface SearchablePage {
  label: string;
  path: string;
  keywords: string[];
}

export const SEARCHABLE_PAGES: SearchablePage[] = [
  { label: 'Dashboard', path: '/dashboard', keywords: ['resumen', 'ventas', 'inicio'] },
  { label: 'Conciliación', path: '/conciliacion', keywords: ['bancaria', 'transacciones', 'liquidaciones'] },
  { label: 'Usuarios', path: '/usuarios', keywords: ['administración', 'administracion', 'cuentas'] },
  { label: 'Nuevo usuario', path: '/usuarios/nuevo', keywords: ['crear', 'alta'] },
  { label: 'Auditoría de usuarios', path: '/usuarios/auditoria', keywords: ['historial', 'log'] },
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
