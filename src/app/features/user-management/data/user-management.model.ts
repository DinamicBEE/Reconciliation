import { PermissionKey, RoleId } from '../../../shared/models/access.model';

// Tipos de acceso de `shared/models/access.model.ts` (ADR-0001), re-exportados para este feature.
export type { PermissionDef, PermissionKey, RoleDef, RoleId } from '../../../shared/models/access.model';

// Dominio de "Administración de usuarios"; ver docs/codigo/usuarios.md#modelo-appuser.

/**
 * Estado de cuenta; el backend lo expresa en mayúsculas (`LOCKED` = `blocked`).
 *
 * @see docs/codigo/usuarios.md#estados-de-cuenta
 */
export type UserStatus = 'active' | 'inactive' | 'blocked';

/**
 * Dirección postal, editada y mostrada como unidad; solo `street2` e `interiorNumber` son opcionales.
 *
 * @see docs/codigo/usuarios.md#modelo-appuser
 */
export interface AppUserAddress {
  city: string;
  state: string;
  /** Código postal (`postalCode` en el DTO del backend). */
  zipCode: string;
  street1: string;
  street2: string | null;
  exteriorNumber: string;
  interiorNumber: string | null;
}

/**
 * Registro administrable de una persona (datos personales, seguridad y organización).
 *
 * @remarks No es `AuthUser` (sesión). `id` es local; las rutas `/users/{id}` usan `backendUserId`.
 * @see docs/codigo/usuarios.md#modelo-appuser
 */
export interface AppUser {
  /** Id local `uXXXX`; no es el id del backend. */
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** `null` sin foto; `nz-avatar` cae a iniciales + color también si la imagen falla. */
  avatarUrl: string | null;
  status: UserStatus;
  /** ISO con hora. */
  createdAt: string;
  /** Último inicio de sesión (ISO con hora); `null` = nunca ha iniciado sesión. */
  lastAccessAt: string | null;

  /** ISO solo fecha. */
  birthDate: string;
  ssn: string;
  /** Valor de {@link GENDER_OPTIONS}. */
  gender: string;
  address: AppUserAddress;

  /** Al menos uno. */
  roleIds: RoleId[];
  /** Permisos efectivos; pueden diferir de los defaults de sus roles. */
  permissions: PermissionKey[];
  emailVerified: boolean;
  /** Última acción dentro de la app (ISO con hora), distinta del último login. */
  lastActivityAt: string | null;
  failedLoginAttempts: number;
  /** Fin del bloqueo temporal por intentos fallidos (ISO); `null` si no hay bloqueo o es manual. */
  lockedUntil: string | null;
  twoFactorEnabled: boolean;
  activeSessions: number;
  /** Obliga a pasar por `/cambiar-password` antes de cualquier otra pantalla (`authGuard`). */
  mustChangePassword: boolean;
  /** Contraseña generada por el backend en el alta o el reset; `null` = sin contraseña temporal vigente. */
  temporaryPassword: string | null;

  /** Ids del catálogo de cargos del Core (`GET /catalogs/cargos`); `[]` = sin asignar. */
  cargoIds: number[];
  puestoIds: number[];
  departamentoIds: number[];
  areaIds: number[];
  /** Id local `uXXXX` del administrador responsable; `null` = sin asignar. */
  managerId: string | null;
  employeeId: string;
  /** ISO solo fecha. */
  hireDate: string;
  /** ISO solo fecha; `null` = contrato indefinido. */
  contractEndDate: string | null;
  /** Ids de `GET /catalogs/subsidiarias` (relación N:M); se piden en el alta. */
  subsidiariaIds: number[];
  ubicacionIds: number[];
  /** `app_user.id` del backend; `null` si el registro solo existe en memoria. */
  backendUserId: number | null;
}

/** Opciones cerradas de género para `nz-select`. */
export const GENDER_OPTIONS: string[] = ['Femenino', 'Masculino', 'Otro', 'Prefiero no decir'];

/** Validación única de "Teléfono" para todos los formularios del dominio. */
export const PHONE_PATTERN = /^[+]?[0-9()\-\s]{7,20}$/;

/** Nombre y apellidos unidos por un espacio, sin espacios sobrantes en los extremos. */
export function fullName(user: Pick<AppUser, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/**
 * Códigos de acción conocidos de la bitácora del backend.
 *
 * @remarks `AuditLogEntry.action` es texto: un código nuevo se muestra tal cual ({@link auditActionLabel}).
 * @see docs/codigo/usuarios.md#bitacora
 */
export type AuditAction =
  | 'created'
  | 'updated'
  | 'organization_updated'
  | 'status_changed'
  | 'locked'
  | 'unlocked'
  | 'role_changed'
  | 'permissions_changed'
  | 'password_reset'
  | 'email_verified'
  | 'sessions_closed'
  | 'deleted'
  | 'reconciliation_created';

/** Entrada de la bitácora del backend, mapeada para la UI. */
export interface AuditLogEntry {
  id: number;
  /** `createdAt` del backend (ISO con hora). */
  timestamp: string;
  /** `'Sistema'` cuando `actor` es `null` (bloqueo/desbloqueo automático). */
  actorName: string;
  /** `app_user.id` de la persona afectada (puede estar dada de baja); `null` si la acción no es sobre un usuario. */
  targetBackendUserId: number | null;
  /** Nombre al momento de consultar; `null` si la acción no es sobre un usuario. */
  targetUserName: string | null;
  /** {@link AuditAction} o un código que el front aún no conoce. */
  action: string;
  detail: string;
}

/**
 * Etiqueta y colores fijos de cada estado de cuenta (tokens `--color-tag-*`, no la paleta).
 *
 * @remarks `tagPreset` es el color equivalente de `nz-tag` para mostrar el estado como tag plano.
 * @see docs/codigo/usuarios.md#estados-de-cuenta
 * @see design-system/conciliation/MASTER.md "Colores de tag"
 */
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

/** Opciones de estado para selects y para el menú de `StatusChip`. */
export const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'blocked', label: 'Bloqueado' },
];

/**
 * Permiso que habilita a una persona como "Administrador responsable" de otra.
 *
 * @remarks Por permiso, no por rol: los roles los define cada empresa y un DEV limpio no tiene ninguno.
 * @see docs/codigo/usuarios.md#organizacion-y-responsables
 */
export const MANAGER_PERMISSION: PermissionKey = 'manage_users';

/** Etiqueta en español de cada {@link AuditAction}. */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  created: 'Usuario creado',
  updated: 'Datos actualizados',
  organization_updated: 'Datos organizacionales actualizados',
  status_changed: 'Estado cambiado',
  locked: 'Cuenta bloqueada',
  unlocked: 'Cuenta desbloqueada',
  role_changed: 'Roles modificados',
  permissions_changed: 'Permisos modificados',
  password_reset: 'Contraseña restablecida',
  email_verified: 'Correo verificado manualmente',
  sessions_closed: 'Sesiones activas cerradas',
  deleted: 'Usuario eliminado',
  reconciliation_created: 'Conciliación creada',
};

/**
 * Etiqueta de una acción de la bitácora.
 *
 * @returns El código tal cual si no es un {@link AuditAction} conocido.
 */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action as AuditAction] ?? action;
}
