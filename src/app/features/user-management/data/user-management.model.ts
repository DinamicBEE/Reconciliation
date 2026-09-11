// Dominio de "Administración de usuarios". Vive en este feature (no en
// shared/models) hasta que un segundo feature lo necesite — ver MASTER.md
// ("Estructura de carpetas"). No confundir con `AuthUser` de
// `features/auth/data/auth.service.ts`: ese es el tipo mínimo de sesión
// (usuario que inició sesión); `AppUser` es el registro administrable
// completo (roles, permisos, estado, seguridad, organización) que ve este
// módulo.

export type UserStatus = 'active' | 'inactive' | 'blocked';

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

// Dirección postal — sub-objeto propio (no 7 campos sueltos en AppUser)
// porque siempre se edita/muestra como una unidad ("la dirección"), nunca un
// campo aislado de los demás. `street2` y `interiorNumber` son los únicos
// opcionales de verdad — el resto son requeridos en la práctica aunque el
// tipo no los valide todavía (ver AppUser.address).
export interface AppUserAddress {
  city: string; // Ciudad
  state: string; // Estado
  zipCode: string; // Código Postal
  street1: string; // Calle 1
  street2: string | null; // Calle 2 — opcional (calle secundaria o referencia)
  exteriorNumber: string; // Número exterior
  interiorNumber: string | null; // Número interior — opcional
}

export interface AppUser {
  id: string;
  // "Información general" — mismos campos que la lista (ver user-list).
  firstName: string; // Nombre(s)
  lastName: string; // Apellidos
  email: string; // Correo electrónico
  phone: string; // Teléfono
  // Foto de perfil — null cuando el usuario no la ha subido (caso real, no
  // solo de mock): `nz-avatar` recibe `avatarUrl` como `nzSrc` y cae solo a
  // `nzText`/`avatarTokensFor` (iniciales + color) cuando es null O cuando la
  // imagen falla al cargar (`nz-avatar` maneja ese fallback por sí mismo, ver
  // user-list.ts) — nunca hay que romper el layout distinguiendo los casos.
  avatarUrl: string | null;
  status: UserStatus; // Estado
  createdAt: string; // ISO datetime — Fecha de creación
  lastAccessAt: string | null; // ISO datetime — Última conexión / último inicio de sesión; null = nunca ha iniciado sesión

  // Datos personales adicionales — igual que "Organización" (abajo), no se
  // piden al crear la cuenta, se completan después editando el detalle.
  birthDate: string; // ISO date (solo fecha, sin hora) — Fecha de nacimiento
  ssn: string; // SSN
  gender: string; // Género — ver GENDER_OPTIONS
  address: AppUserAddress;

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
  employeeId: string; // ID empleado
  hireDate: string; // ISO date — Fecha de contratación
  contractEndDate: string | null; // ISO date — Fecha fin de contrato; null = contrato indefinido
}

// Género — lista cerrada (mismo criterio que STATUS_OPTIONS/ROLE_OPTIONS):
// un `<nz-select>`, no texto libre.
export const GENDER_OPTIONS: string[] = ['Femenino', 'Masculino', 'Otro', 'Prefiero no decir'];

// Validación de teléfono — compartida entre cualquier formulario del
// dominio que pida "Teléfono" (user-detail, profile) para no divergir de
// criterio entre pantallas.
export const PHONE_PATTERN = /^[+]?[0-9()\-\s]{7,20}$/;

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
  | 'blocked'
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

// Estado de cuenta — chip con fondo por estado (ver StatusChip) y, en
// user-detail ("Seguridad y acceso"), el mismo estado como `nz-tag` plano.
// `bg`/`fg`/`border` usan los tokens --color-tag-* (estilo "tag" — fondo
// tenue + borde, ver MASTER.md "Colores de tag"), NO los --color-success/
// -warning/-destructive de relleno sólido: son la MISMA semántica
// (activo=success/verde, inactivo=error/rojo, bloqueado=warning/naranja)
// pero con el look que pidió el chip, no el de un botón. `tagPreset` es el
// nombre de color que ya entiende `nz-tag` — así el nz-tag de "Estado de la
// cuenta" queda igual de simple que los de "Email verificado"/"2FA"
// ([nzColor]="'success'|'warning'"), sin repetir bg/fg a mano ahí.
// Fijos, no siguen la paleta — mismo "semáforo" de siempre.
export const STATUS_META: Record<
  UserStatus,
  { label: string; bg: string; fg: string; border: string; tagPreset: 'success' | 'error' | 'warning' }
> = {
  active: {
    label: 'Activo',
    bg: 'var(--color-tag-success-bg)',
    fg: 'var(--color-tag-success-fg)',
    border: 'var(--color-tag-success-border)',
    tagPreset: 'success',
  },
  inactive: {
    label: 'Inactivo',
    bg: 'var(--color-tag-error-bg)',
    fg: 'var(--color-tag-error-fg)',
    border: 'var(--color-tag-error-border)',
    tagPreset: 'error',
  },
  blocked: {
    label: 'Bloqueado',
    bg: 'var(--color-tag-warning-bg)',
    fg: 'var(--color-tag-warning-fg)',
    border: 'var(--color-tag-warning-border)',
    tagPreset: 'warning',
  },
};

export const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'blocked', label: 'Bloqueado' },
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
  blocked: 'Cuenta bloqueada',
  password_reset: 'Contraseña restablecida',
  deleted: 'Usuario eliminado',
  organization_updated: 'Datos organizacionales actualizados',
  email_verified: 'Correo verificado manualmente',
  sessions_closed: 'Sesiones activas cerradas',
};
