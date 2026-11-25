// Tipos transversales de roles y permisos; viven en `shared` (ADR-0001, punto 3).

/**
 * Códigos de rol (`app_role.code`) que el front compara en código.
 *
 * @remarks El catálogo real de roles es `GET /roles`; el acceso a pantallas lo decide el permiso, no el rol.
 * @see docs/codigo/roles-y-permisos.md#codigos-de-rol-y-permiso
 */
export type RoleId = 'ADMIN' | 'ALTAS' | 'CONTABILIDAD' | 'TESORERIA' | 'COSTOS';

/** Códigos de permiso del backend que el front reconoce (rutas, menú y acciones). */
export type PermissionKey =
  | 'view_dashboard'
  | 'view_reconciliation'
  | 'manage_differences'
  | 'import_settlements'
  | 'export_reports'
  | 'manage_users'
  | 'manage_roles'
  | 'view_audit_log'
  | 'view_catalogs'
  | 'capture_sales'
  | 'create_reconciliation';

/** Entrada de `GET /permissions`: `code` → `key`, `description` → `label`, `module` → `group`. */
export interface PermissionDef {
  key: PermissionKey;
  label: string;
  group: string;
}

/**
 * Entrada de `GET /roles`: `code` → `id`, `name` → `label`.
 *
 * @remarks `defaultPermissions` se otorga al asignar el rol; cambiar los roles reinicia a la unión de estos sets.
 * @see docs/codigo/roles-y-permisos.md#codigos-de-rol-y-permiso
 */
export interface RoleDef {
  id: RoleId;
  label: string;
  defaultPermissions: PermissionKey[];
}
