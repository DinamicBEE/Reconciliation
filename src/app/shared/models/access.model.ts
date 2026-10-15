// Tipos transversales de control de acceso (roles y permisos) — los usan la
// sesión (`core/auth`), el layout (`core/layout`) y varias features, así que
// viven aquí y no en `user-management` (ADR-0001, punto 3).

// Códigos TAL CUAL los sembró coctel-del-mar/coctel_midd (`app_role.code`,
// ver V1__init_schema.sql de ese repo y `UserSummaryDto.roles` en /auth/login)
// — el backend es la fuente de verdad de qué roles EXISTEN y de sus nombres y
// permisos por defecto: `GET /roles` (ver `AccessCatalogService`). Este tipo
// solo da nombre a los códigos que el código del front compara (p. ej.
// `MANAGER_ROLE_IDS`, `canReprocessSales`); NO hay lista de roles propia del
// front. El acceso a cada pantalla lo decide el PERMISO (`permissionGuard`,
// `core/auth/permission.guard.ts`, rutas en `app.routes.ts`), no el rol.
export type RoleId = 'ADMIN' | 'ALTAS' | 'CONTABILIDAD' | 'TESORERIA' | 'COSTOS';

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
  | 'capture_sales';

// Una entrada de `GET /permissions` (`code` → key, `description` → label,
// `module` → group: título del bloque en el grid de "Seguridad y acceso").
export interface PermissionDef {
  key: PermissionKey;
  label: string;
  group: string;
}

// Una entrada de `GET /roles` (`code` → id, `name` → label). Permisos que una
// persona recién asignada a este rol recibe por defecto — el admin puede
// ajustarlos después por usuario (ver "Seguridad y acceso" en user-detail).
// Cambiar los roles asignados RESETEA a la unión de estos sets
// (`AccessCatalogService.defaultPermissionsForRoles`).
export interface RoleDef {
  id: RoleId;
  label: string;
  defaultPermissions: PermissionKey[];
}
