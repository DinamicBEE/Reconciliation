// Dominio de "Administración de usuarios". Vive en este feature (no en
// shared/models) hasta que un segundo feature lo necesite — ver MASTER.md
// ("Estructura de carpetas"). No confundir con `AuthUser` de
// `features/auth/data/auth.service.ts`: ese es el tipo mínimo de sesión
// (usuario que inició sesión); `AppUser` es el registro administrable
// completo (roles, permisos, estado, seguridad, organización) que ve este
// módulo.

export type UserStatus = 'active' | 'inactive';

export type RoleId = 'admin' | 'supervisor' | 'analista' | 'auditor';

export type PermissionKey =
  | 'view_dashboard'
  | 'view_reconciliation'
  | 'manage_differences'
  | 'import_settlements'
  | 'export_reports'
  | 'manage_users'
  | 'manage_roles'
  | 'view_audit_log';

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  group: string;
}

export interface RoleDef {
  id: RoleId;
  label: string;
  description: string;
  // Permisos que un usuario recién asignado a este rol recibe por defecto —
  // el admin puede ajustarlos después por usuario (ver "Seguridad y acceso"
  // en user-detail). Cambiar los roles asignados RESETEA a la unión de estos
  // sets (ver UserManagementService.changeRoles / defaultPermissionsForRoles).
  defaultPermissions: PermissionKey[];
}

export interface AppUser {
  id: string;
  // "Información general" — mismos campos que la lista (ver user-list).
  firstName: string; // Nombre(s)
  lastName: string; // Apellidos
  email: string; // Correo electrónico
  phone: string; // Teléfono
  status: UserStatus; // Estado
  createdAt: string; // ISO datetime — Fecha de creación
  lastAccessAt: string | null; // ISO datetime — Última conexión / último inicio de sesión; null = nunca ha iniciado sesión

  // "Seguridad y acceso" — roleIds/permissions son editables; el resto lo
  // reporta el sistema (aquí, simulado) y no tiene control de edición propio
  // salvo las acciones puntuales que expone el service (verificar correo,
  // cerrar sesiones).
  roleIds: RoleId[]; // Roles asignados — al menos uno
  permissions: PermissionKey[]; // Permisos efectivos (puede divergir del default de sus roles, ver arriba)
  emailVerified: boolean;
  lastActivityAt: string | null; // ISO datetime — distinto de lastAccessAt: es la última acción dentro de la app, no el último login
  failedLoginAttempts: number;
  twoFactorEnabled: boolean;
  activeSessions: number;

  // "Organización" — todos opcionales/editables en cualquier momento; no se
  // piden al crear la cuenta (ver CreateUserInput), se completan después.
  department: string; // Departamento
  area: string; // Área
  jobTitle: string; // Cargo o puesto
  managerId: string | null; // Administrador responsable — id de otro AppUser (admin/supervisor), null = sin asignar
}

export function fullName(user: Pick<AppUser, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

// Unión de los defaultPermissions de cada rol asignado — punto de partida al
// crear un usuario o al cambiar sus roles (ver UserManagementService).
export function defaultPermissionsForRoles(roleIds: RoleId[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const roleId of roleIds) {
    const role = ROLES.find((r) => r.id === roleId);
    role?.defaultPermissions.forEach((p) => set.add(p));
  }
  return [...set];
}

// created/updated/role_changed/permissions_changed/activated/deactivated/
// password_reset/deleted/organization_updated/email_verified/
// sessions_closed — un enum cerrado en vez de texto libre para poder
// filtrar y, eventualmente, dar color/ícono propio por tipo (mismo criterio
// que MatchStatus/SaleStatus, ver MASTER.md).
export type AuditAction =
  | 'created'
  | 'updated'
  | 'role_changed'
  | 'permissions_changed'
  | 'activated'
  | 'deactivated'
  | 'password_reset'
  | 'deleted'
  | 'organization_updated'
  | 'email_verified'
  | 'sessions_closed';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO datetime
  actorName: string; // quién ejecutó la acción (usuario con sesión, vía AuthService)
  targetUserId: string;
  targetUserName: string; // snapshot del nombre al momento del evento — sobrevive a que el usuario se elimine o cambie de nombre después
  action: AuditAction;
  detail: string;
}

export const ROLES: RoleDef[] = [
  {
    id: 'admin',
    label: 'Administrador',
    description: 'Acceso total: usuarios, roles y permisos, conciliación y reportes.',
    defaultPermissions: [
      'view_dashboard',
      'view_reconciliation',
      'manage_differences',
      'import_settlements',
      'export_reports',
      'manage_users',
      'manage_roles',
      'view_audit_log',
    ],
  },
  {
    id: 'supervisor',
    label: 'Supervisor',
    description: 'Gestiona diferencias, importaciones y reportes — no administra usuarios.',
    defaultPermissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports'],
  },
  {
    id: 'analista',
    label: 'Analista de Conciliación',
    description: 'Concilia movimientos y gestiona diferencias del día a día.',
    defaultPermissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements'],
  },
  {
    id: 'auditor',
    label: 'Auditor (solo lectura)',
    description: 'Consulta dashboards, conciliación e historial, sin poder modificar nada.',
    defaultPermissions: ['view_dashboard', 'view_reconciliation', 'view_audit_log'],
  },
];

export const ROLE_LABEL: Record<RoleId, string> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.label]),
) as Record<RoleId, string>;

export const ROLE_OPTIONS: { value: RoleId; label: string }[] = ROLES.map((r) => ({ value: r.id, label: r.label }));

// Roles considerados "responsables" a efectos de "Administrador responsable"
// (Organización) — cualquier AppUser con al menos uno de estos roles puede
// elegirse como responsable de otro. Auditor/Analista quedan fuera a
// propósito: son roles de operación/consulta, no de gestión de personas.
export const MANAGER_ROLE_IDS: RoleId[] = ['admin', 'supervisor'];

export const PERMISSIONS: PermissionDef[] = [
  { key: 'view_dashboard', label: 'Ver resumen de venta', group: 'Consulta' },
  { key: 'view_reconciliation', label: 'Ver conciliación', group: 'Consulta' },
  { key: 'view_audit_log', label: 'Ver historial y auditoría', group: 'Consulta' },
  { key: 'manage_differences', label: 'Gestionar diferencias', group: 'Operación' },
  { key: 'import_settlements', label: 'Importar liquidaciones (CSV)', group: 'Operación' },
  { key: 'export_reports', label: 'Exportar reportes', group: 'Operación' },
  { key: 'manage_users', label: 'Administrar usuarios', group: 'Administración' },
  { key: 'manage_roles', label: 'Administrar roles y permisos', group: 'Administración' },
];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  created: 'Usuario creado',
  updated: 'Datos actualizados',
  role_changed: 'Roles modificados',
  permissions_changed: 'Permisos modificados',
  activated: 'Cuenta activada',
  deactivated: 'Cuenta desactivada',
  password_reset: 'Contraseña restablecida',
  deleted: 'Usuario eliminado',
  organization_updated: 'Datos organizacionales actualizados',
  email_verified: 'Correo verificado manualmente',
  sessions_closed: 'Sesiones activas cerradas',
};
