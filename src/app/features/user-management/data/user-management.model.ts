// Dominio de "Administración de usuarios". Vive en este feature (no en
// shared/models) hasta que un segundo feature lo necesite — ver MASTER.md
// ("Estructura de carpetas"). No confundir con `AuthUser` de
// `features/auth/data/auth.service.ts`: ese es el tipo mínimo de sesión
// (usuario que inició sesión); `AppUser` es el registro administrable
// completo (roles, permisos, estado, seguridad, organización) que ve este
// módulo.

export type UserStatus = 'active' | 'inactive' | 'blocked';

// Códigos TAL CUAL los sembró coctel-del-mar/coctel_midd (`app_role.code`,
// ver V1__init_schema.sql de ese repo y `UserSummaryDto.roles` en /auth/login)
// — el backend es la fuente de verdad de qué roles EXISTEN y de sus nombres y
// permisos por defecto: `GET /roles` (ver `AccessCatalogService`). Este tipo
// solo da nombre a los códigos que el código del front compara (p. ej.
// `MANAGER_ROLE_IDS`, `canReprocessSales`); NO hay lista de roles propia del
// front. El acceso a cada pantalla lo decide el PERMISO (`permissionGuard`,
// `features/auth/data/permission.guard.ts`, rutas en `app.routes.ts`), no el rol.
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
  // Fin del bloqueo TEMPORAL por intentos fallidos (`GET /users/{id}`,
  // `lockedUntil`): a partir de ahí el backend desbloquea solo (2 h por
  // defecto, ver Guía_Endpoints §6). `null` = no está bloqueada o el bloqueo es
  // MANUAL (`status: blocked`, no vence solo). Mock: siempre `null`.
  lockedUntil: string | null; // ISO datetime
  twoFactorEnabled: boolean;
  activeSessions: number;
  // true en la creación de la cuenta o tras un `resetPassword` (ver
  // UserManagementService) — obliga a `ChangePassword` (/cambiar-password,
  // fuera de Shell) antes de dejar entrar a cualquier pantalla del resto de
  // la app, ver `authGuard`. Dato del backend real (así llega, mismo nombre
  // de campo) — ver MASTER.md, "Patrón: refresh token de un solo uso +
  // cambio obligatorio de contraseña".
  mustChangePassword: boolean;
  // Contraseña inicial GENERADA POR EL BACKEND al dar de alta la cuenta
  // (`POST /users` → `NewUserResponseDto.temporaryPassword`, o
  // recalculada por `GET /users/{id}` mientras `mustChangePassword` siga en
  // true). Si llega y no está vacía, `user-detail` la muestra en la sección
  // "Organización" para que el administrador la entregue. `null` = sin
  // contraseña temporal vigente.
  temporaryPassword: string | null;

  // "Organización" — todos opcionales/editables en cualquier momento; no se
  // piden al crear la cuenta (ver CreateUserInput), se completan después.
  department: string; // Departamento
  area: string; // Área
  jobTitle: string; // Cargo o puesto
  managerId: string | null; // Administrador responsable — id de otro AppUser (admin/supervisor), null = sin asignar
  employeeId: string; // ID empleado
  hireDate: string; // ISO date — Fecha de contratación
  contractEndDate: string | null; // ISO date — Fecha fin de contrato; null = contrato indefinido
  // Subsidiaria(s) (negocio/marca/empresa) y ubicación(es) (tienda/store/
  // punto de venta/sucursal) — a diferencia del resto de "Organización", SÍ
  // se piden al crear la cuenta (ver CreateUserInput). `id`s numéricos
  // porque referencian el catálogo REAL del backend (`CatalogService`,
  // `core/services/`), no un valor propio de este mock. ARREGLOS, no un
  // solo valor: el backend modela acceso a VARIAS subsidiarias/ubicaciones
  // por persona (`empleado_subsidiaria`/`empleado_ubicacion`, tablas de
  // relación N:M, ver `CreateUserRequest.subsidiariaIds`/`.ubicacionIds` en
  // `AuthService`) — este frontend ya NO lo simplifica a una sola de cada
  // una (ver MASTER.md, "Actualización: endpoints de administración de
  // usuarios (CRUD real) + multi-subsidiaria/ubicación"). `[]` = sin
  // asignar ninguna.
  subsidiariaIds: number[];
  ubicacionIds: number[];
  // Id del `app_user` REAL en el backend (`AppUser.id` allá, un Long) —
  // presente para cualquier cuenta sembrada/creada ahí (ver
  // `UserManagementService.createUser`/`syncFromBackend`,
  // `UserDetail.onUnlockBackendClick`); `null` para un registro que solo
  // vive en este mock (no debería quedar ninguno tras sembrar los 26 en el
  // backend, ver el mismo punto de MASTER.md). NO confundir con
  // `AppUser.id` (el id 'uXXXX' de ESTE registro mock) ni con
  // `AuthUser.appUserId` (que apunta al revés, del `AuthUser` de sesión
  // hacia este mismo `AppUser.id`).
  backendUserId: number | null;
}

// Género — lista cerrada (mismo criterio que STATUS_OPTIONS):
// un `<nz-select>`, no texto libre.
export const GENDER_OPTIONS: string[] = ['Femenino', 'Masculino', 'Otro', 'Prefiero no decir'];

// Validación de teléfono — compartida entre cualquier formulario del
// dominio que pida "Teléfono" (user-detail, profile) para no divergir de
// criterio entre pantallas.
export const PHONE_PATTERN = /^[+]?[0-9()\-\s]{7,20}$/;

export function fullName(user: Pick<AppUser, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

// Acciones que registra la bitácora del backend (`GET /audit-log`, guía de
// endpoints, "Acciones que se registran") — `AuditLogEntry.action` llega como
// texto; un código que el backend agregue y esta lista no conozca se muestra
// tal cual (ver `auditActionLabel`).
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
  | 'deleted';

// Una entrada de la bitácora del backend, ya mapeada para la UI.
export interface AuditLogEntry {
  id: number;
  timestamp: string; // ISO datetime (`createdAt`)
  actorName: string; // 'Sistema' cuando lo hizo el sistema (`actor` null: bloqueo/desbloqueo automático)
  targetBackendUserId: number; // id REAL del backend de la persona afectada (puede ya no existir: baja lógica)
  targetUserName: string; // nombre al momento de consultar
  action: string; // AuditAction | código nuevo del backend
  detail: string;
}

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

// Roles considerados "responsables" a efectos de "Administrador responsable"
// (Organización) — cualquier AppUser con al menos uno de estos roles puede
// elegirse como responsable de otro. Contabilidad/Tesorería/Costos quedan
// fuera a propósito: son roles de un solo módulo operativo (o sin módulo
// propio), no de gestión de personas.
export const MANAGER_ROLE_IDS: RoleId[] = ['ADMIN', 'ALTAS'];

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
};

// Etiqueta de una acción; un código que el backend agregue y no esté arriba se
// muestra tal cual en vez de quedar en blanco.
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action as AuditAction] ?? action;
}
