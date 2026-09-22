import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/data/auth.service';
import {
  AppUser,
  AppUserAddress,
  AuditAction,
  AuditLogEntry,
  MANAGER_ROLE_IDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  PermissionKey,
  ROLE_LABEL,
  RoleId,
  STATUS_META,
  UserStatus,
  defaultPermissionsForRoles,
  fullName,
} from './user-management.model';
import { MOCK_AUDIT_LOG, MOCK_USERS } from './user-management-mock.data';
import { generateTempPassword } from './password.util';

export type StatusFilter = 'all' | UserStatus;
export type RoleFilter = 'all' | RoleId;

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleIds: RoleId[];
  status: UserStatus;
}

// Datos personales SOLOS (sin organización) — el único que necesita
// `Profile` (self-service: cada quien edita su propia información de
// contacto, nunca su propia asignación organizacional). Ver
// `UpdateUserProfileInput` abajo para el caso de `UserDetail` (un admin
// editando a otro usuario, personal + organización JUNTOS).
export interface UpdateUserInfoInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  ssn: string;
  gender: string;
  address: AppUserAddress;
}

// Un solo input para TODO "Información general" en `UserDetail` (datos
// personales + organización) — antes eran 2 interfaces
// (`UpdateUserInfoInput`/`UpdateOrganizationInput`) que viajaban a 2 métodos
// del service en 2 llamadas separadas; ahora esa pantalla las junta en un
// solo `<form>` lógico y las guarda en una sola llamada
// (`updateUserProfile`, ver abajo) — el día que exista backend real, esto
// es UN solo endpoint, no dos. `Profile` (self-service) sigue usando el
// `UpdateUserInfoInput` más chico de arriba, vía `updateInfo` — 2 métodos
// a propósito: son 2 casos de uso distintos (self-service acotado vs.
// edición administrativa completa), no la misma acción con menos campos.
export interface UpdateUserProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  ssn: string;
  gender: string;
  address: AppUserAddress;
  department: string;
  area: string;
  jobTitle: string;
  managerId: string | null;
  employeeId: string;
  hireDate: string;
  contractEndDate: string | null;
}

// El siguiente id debe ser mayor al de CUALQUIER id 'uN' ya usado, no solo
// los de MOCK_USERS — el mock de auditoría incluye a propósito un
// targetUserId ('u0009') de un usuario YA ELIMINADO que no vive en MOCK_USERS
// (ver user-management-mock.data.ts). Si nextUserSeq solo mirara
// MOCK_USERS.length, el primer usuario creado en esta sesión reciclaría ese
// mismo id y heredaría el historial del usuario fantasma.
function maxSeq(ids: string[]): number {
  return ids.reduce((max, id) => {
    const match = /^u(\d+)$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

let nextUserSeq = Math.max(maxSeq(MOCK_USERS.map((u) => u.id)), maxSeq(MOCK_AUDIT_LOG.map((e) => e.targetUserId))) + 1;
let nextAuditSeq = MOCK_AUDIT_LOG.length + 1;

/**
 * `providedIn: 'root'` — a diferencia de los servicios de un solo feature
 * (SalesDashboardService, ReconciliationService, con `providers: [...]` a
 * nivel de componente), este necesita SOBREVIVIR la navegación entre las 3
 * pantallas del módulo (lista, detalle, auditoría global): son 3 rutas de
 * nivel superior distintas, no un solo árbol de componentes, así que cada
 * una obtendría su propia instancia (y perdería los cambios de la sesión)
 * si se proveyera a nivel de componente. Mismo criterio que AuthService.
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly auth = inject(AuthService);

  private readonly usersSignal = signal<AppUser[]>(MOCK_USERS);
  private readonly auditLogSignal = signal<AuditLogEntry[]>(MOCK_AUDIT_LOG);

  readonly allUsers = this.usersSignal.asReadonly();
  readonly auditLog = this.auditLogSignal.asReadonly();

  readonly search = signal('');
  readonly roleFilter = signal<RoleFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');

  readonly filteredUsers = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();

    return this.usersSignal().filter((user) => {
      if (role !== 'all' && !user.roleIds.includes(role)) return false;
      if (status !== 'all' && user.status !== status) return false;
      if (term && !fullName(user).toLowerCase().includes(term) && !user.email.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  // Selección de filas en la lista — vive aquí (no en el componente) por el
  // mismo motivo que search/roleFilter/statusFilter: es estado de ESA
  // pantalla, y el service ya es el dueño del estado de la pantalla de
  // lista. Alcance: los usuarios FILTRADOS actualmente visibles, no todos
  // los usuarios del sistema (seleccionar "todos" con un filtro activo solo
  // selecciona lo que se ve, no lo oculto por el filtro).
  private readonly selectedIdsSignal = signal<ReadonlySet<string>>(new Set());
  readonly selectedIds = this.selectedIdsSignal.asReadonly();

  readonly isAllFilteredSelected = computed(() => {
    const filtered = this.filteredUsers();
    return filtered.length > 0 && filtered.every((u) => this.selectedIdsSignal().has(u.id));
  });

  readonly isSomeFilteredSelected = computed(
    () => !this.isAllFilteredSelected() && this.filteredUsers().some((u) => this.selectedIdsSignal().has(u.id)),
  );

  readonly summary = computed(() => {
    const users = this.usersSignal();
    return {
      total: users.length,
      active: users.filter((u) => u.status === 'active').length,
      inactive: users.filter((u) => u.status === 'inactive').length,
    };
  });

  // Candidatos a "Administrador responsable" (Organización) — cualquier
  // usuario con un rol de gestión (ver MANAGER_ROLE_IDS). El componente
  // excluye además al propio usuario que se está editando (no puede ser su
  // propio responsable).
  readonly managerCandidates = computed(() =>
    this.usersSignal().filter((u) => u.roleIds.some((r) => MANAGER_ROLE_IDS.includes(r))),
  );

  // Más reciente primero — todas las pantallas que muestran auditoría
  // (historial por usuario, historial global) parten de este mismo orden.
  readonly recentAuditLog = computed(() =>
    [...this.auditLogSignal()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  );

  setSearch(value: string): void {
    this.search.set(value);
  }

  setRoleFilter(value: RoleFilter): void {
    this.roleFilter.set(value);
  }

  setStatusFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
  }

  isSelected(userId: string): boolean {
    return this.selectedIdsSignal().has(userId);
  }

  toggleSelect(userId: string): void {
    this.selectedIdsSignal.update((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  // Selecciona/deselecciona todos los usuarios FILTRADOS a la vez — si ya
  // están todos seleccionados, el toggle los quita; si falta alguno (o
  // ninguno), los agrega todos (mismo comportamiento que el checkbox
  // "seleccionar todo" de cualquier tabla: el estado indeterminado cuenta
  // como "no completo" y el siguiente click completa la selección).
  toggleSelectAllFiltered(): void {
    const filtered = this.filteredUsers();
    const allSelected = this.isAllFilteredSelected();
    this.selectedIdsSignal.update((current) => {
      const next = new Set(current);
      for (const user of filtered) {
        if (allSelected) {
          next.delete(user.id);
        } else {
          next.add(user.id);
        }
      }
      return next;
    });
  }

  auditForUser(userId: string): AuditLogEntry[] {
    return this.recentAuditLog().filter((entry) => entry.targetUserId === userId);
  }

  findUser(userId: string): AppUser | null {
    return this.usersSignal().find((u) => u.id === userId) ?? null;
  }

  createUser(input: CreateUserInput): AppUser {
    const user: AppUser = {
      // Mínimo 4 dígitos (regla de negocio) — el padding es solo cosmético,
      // `maxSeq` (arriba) sigue leyendo el número con `Number(...)` así que
      // un id viejo sin padding (no debería haberlo) igual se compara bien.
      id: `u${String(nextUserSeq++).padStart(4, '0')}`,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      // Sin foto al crear — se sube después (no hay flujo de carga de avatar
      // todavía); cae a iniciales + color hasta entonces (ver AppUser.avatarUrl).
      avatarUrl: null,
      status: input.status,
      createdAt: new Date().toISOString(),
      lastAccessAt: null,
      roleIds: input.roleIds,
      permissions: defaultPermissionsForRoles(input.roleIds),
      emailVerified: false,
      lastActivityAt: null,
      failedLoginAttempts: 0,
      twoFactorEnabled: false,
      activeSessions: 0,
      // Cuenta nueva → contraseña inicial asignada por un admin, igual que
      // tras un `resetPassword` — debe cambiarla en su primer login.
      mustChangePassword: true,
      // No se piden al crear — se completan después editando el detalle (ver
      // UpdateUserInfoInput/UpdateOrganizationInput y sus respectivos update*).
      birthDate: '',
      ssn: '',
      gender: '',
      address: { city: '', state: '', zipCode: '', street1: '', street2: null, exteriorNumber: '', interiorNumber: null },
      department: '',
      area: '',
      jobTitle: '',
      managerId: null,
      employeeId: '',
      hireDate: '',
      contractEndDate: null,
    };

    this.usersSignal.update((list) => [user, ...list]);
    this.appendAudit(user, 'created', `Usuario creado con rol${input.roleIds.length > 1 ? 'es' : ''} ${input.roleIds.map((r) => ROLE_LABEL[r]).join(', ')}.`);
    return user;
  }

  // Self-service: el propio usuario edita SOLO su información personal (ver
  // `Profile`, `/perfil`) — nunca su organización, así que no reutiliza
  // `updateUserProfile` (exigiría los 7 campos de organización que esa
  // pantalla ni siquiera muestra).
  updateInfo(userId: string, input: UpdateUserInfoInput): void {
    const user = this.findUser(userId);
    if (!user) return;

    const updated: AppUser = {
      ...user,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      birthDate: input.birthDate,
      ssn: input.ssn.trim(),
      gender: input.gender,
      address: {
        city: input.address.city.trim(),
        state: input.address.state.trim(),
        zipCode: input.address.zipCode.trim(),
        street1: input.address.street1.trim(),
        street2: input.address.street2?.trim() || null,
        exteriorNumber: input.address.exteriorNumber.trim(),
        interiorNumber: input.address.interiorNumber?.trim() || null,
      },
    };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'updated', 'Se actualizó información personal.');
  }

  // Administrativo: un admin edita a OTRO usuario, información personal Y
  // organización JUNTAS, en una sola actualización + una sola entrada de
  // auditoría (ver `UserDetail.onSaveProfile()`) — reemplaza a los antiguos
  // `updateInfo`/`updateOrganization` como 2 llamadas separadas para ESE
  // caso de uso. Ver `UpdateUserProfileInput`.
  updateUserProfile(userId: string, input: UpdateUserProfileInput): void {
    const user = this.findUser(userId);
    if (!user) return;

    const updated: AppUser = {
      ...user,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      birthDate: input.birthDate,
      ssn: input.ssn.trim(),
      gender: input.gender,
      address: {
        city: input.address.city.trim(),
        state: input.address.state.trim(),
        zipCode: input.address.zipCode.trim(),
        street1: input.address.street1.trim(),
        street2: input.address.street2?.trim() || null,
        exteriorNumber: input.address.exteriorNumber.trim(),
        interiorNumber: input.address.interiorNumber?.trim() || null,
      },
      department: input.department.trim(),
      area: input.area.trim(),
      jobTitle: input.jobTitle.trim(),
      managerId: input.managerId,
      employeeId: input.employeeId.trim(),
      hireDate: input.hireDate,
      contractEndDate: input.contractEndDate,
    };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'updated', 'Se actualizó información personal y de organización.');
  }

  // Cambiar los roles asignados resetea los permisos a la UNIÓN de los
  // defaults de esos roles — el componente parte de ahí y el admin ajusta
  // manualmente lo que necesite (mismo criterio que un selector de rol en
  // cualquier admin panel: el rol es un punto de partida, no una regla que
  // se re-derive sola en cada render).
  changeRoles(userId: string, roleIds: RoleId[], permissions: PermissionKey[]): void {
    const user = this.findUser(userId);
    if (!user || roleIds.length === 0) return;

    const rolesChanged = user.roleIds.length !== roleIds.length || user.roleIds.some((r) => !roleIds.includes(r));
    const updated: AppUser = { ...user, roleIds, permissions };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

    if (rolesChanged) {
      const from = user.roleIds.map((r) => ROLE_LABEL[r]).join(', ');
      const to = roleIds.map((r) => ROLE_LABEL[r]).join(', ');
      this.appendAudit(updated, 'role_changed', `Roles cambiados de ${from} a ${to}.`);
    } else {
      this.appendAudit(updated, 'permissions_changed', 'Se actualizaron los permisos asignados.');
    }
  }

  // 3 estados posibles (activo/inactivo/bloqueado, ver StatusChip) — cada
  // uno tiene su propia AuditAction para que el historial diga exactamente
  // qué pasó, no un genérico "estado cambiado".
  setStatus(userId: string, status: UserStatus): void {
    const user = this.findUser(userId);
    if (!user || user.status === status) return;

    const updated: AppUser = { ...user, status };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

    const action: AuditAction = status === 'active' ? 'activated' : status === 'blocked' ? 'blocked' : 'deactivated';
    this.appendAudit(updated, action, `Cuenta cambiada a estado "${STATUS_META[status].label}".`);
  }

  setEmailVerified(userId: string): void {
    const user = this.findUser(userId);
    if (!user || user.emailVerified) return;

    const updated: AppUser = { ...user, emailVerified: true };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'email_verified', 'Un administrador marcó el correo como verificado.');
  }

  // Cerrar sesiones activas no revoca 2FA ni cambia contraseña — solo el
  // contador de sesiones abiertas (mismo alcance que un botón "cerrar todas
  // las sesiones" real: obliga a re-autenticar en cada dispositivo).
  closeSessions(userId: string): void {
    const user = this.findUser(userId);
    if (!user || user.activeSessions === 0) return;

    const updated: AppUser = { ...user, activeSessions: 0 };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'sessions_closed', `Se cerraron ${user.activeSessions} sesión(es) activa(s).`);
  }

  // No hay backend/correo real todavía — genera una contraseña temporal y la
  // devuelve para que el componente la muestre UNA vez (toast). El día que
  // exista backend, esto pasa a disparar un correo real y deja de devolver
  // la contraseña en claro. También limpia los intentos fallidos Y desbloquea
  // la cuenta si el bloqueo fue POR ESOS intentos (ver `recordFailedLogin`)
  // — mismo criterio que un "desbloqueo" real: una contraseña nueva reinicia
  // el contador Y el estado que ese contador había disparado. Si el estado
  // era 'inactive' (decisión administrativa aparte, no ligada a intentos
  // fallidos), NO se reactiva solo — eso sigue siendo una acción explícita
  // en "Seguridad y acceso" (`setStatus`), no un efecto secundario de esto.
  // `mustChangePassword: true` obliga a la persona a definir SU PROPIA
  // contraseña en el siguiente login en vez de quedarse con la temporal
  // indefinidamente (ver `authGuard`/`ChangePassword`, MASTER.md "Patrón:
  // refresh token de un solo uso + cambio obligatorio de contraseña").
  resetPassword(userId: string): string | null {
    const user = this.findUser(userId);
    if (!user) return null;

    const updated: AppUser = {
      ...user,
      failedLoginAttempts: 0,
      status: user.status === 'blocked' ? 'active' : user.status,
      mustChangePassword: true,
    };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

    const tempPassword = generateTempPassword();
    this.appendAudit(updated, 'password_reset', 'Se generó una nueva contraseña temporal.');
    return tempPassword;
  }

  // Se llama tras una contraseña incorrecta (ver `Login.onSubmit`) —
  // incrementa el contador y, al llegar a `MAX_FAILED_LOGIN_ATTEMPTS`,
  // bloquea la cuenta automáticamente (umbral y comportamiento del backend
  // real, ver Auth_Service_Endpoints.pdf — "Usuario bloqueado (5 intentos
  // fallidos)", HTTP 423). No hace nada si la cuenta YA está bloqueada — no
  // tiene sentido seguir sumando intentos sobre una cuenta que ya no deja
  // entrar a nadie.
  recordFailedLogin(userId: string): void {
    const user = this.findUser(userId);
    if (!user || user.status === 'blocked') return;

    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const justBlocked = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    const updated: AppUser = { ...user, failedLoginAttempts, status: justBlocked ? 'blocked' : user.status };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

    if (justBlocked) {
      this.appendAudit(
        updated,
        'blocked',
        `Cuenta bloqueada automáticamente tras ${MAX_FAILED_LOGIN_ATTEMPTS} intentos fallidos de inicio de sesión.`,
      );
    }
  }

  // Login correcto — reinicia el contador de intentos fallidos, mismo
  // criterio que `resetPassword`. No hay entrada de auditoría propia: un
  // login correcto no es un evento de seguridad que reportar, es lo
  // esperado.
  clearFailedLogins(userId: string): void {
    const user = this.findUser(userId);
    if (!user || user.failedLoginAttempts === 0) return;

    const updated: AppUser = { ...user, failedLoginAttempts: 0 };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
  }

  // Llamado por `ChangePassword` tras confirmar el cambio (ver
  // `AuthService.changePassword`, que valida/actualiza la CONTRASEÑA en sí —
  // este método solo apaga la bandera en el registro de `user-management`,
  // el único de los dos que la conoce). Sin entrada de auditoría propia:
  // "Contraseña restablecida" (`password_reset`) ya quedó registrada cuando
  // se ORIGINÓ la obligación (alta de cuenta o reset de un admin) — esto es
  // solo completarla, no un evento nuevo que reportar.
  clearMustChangePassword(userId: string): void {
    const user = this.findUser(userId);
    if (!user || !user.mustChangePassword) return;

    const updated: AppUser = { ...user, mustChangePassword: false };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
  }

  deleteUser(userId: string): void {
    const user = this.findUser(userId);
    if (!user) return;

    this.usersSignal.update((list) => list.filter((u) => u.id !== userId));
    this.selectedIdsSignal.update((current) => {
      if (!current.has(userId)) return current;
      const next = new Set(current);
      next.delete(userId);
      return next;
    });
    // La entrada de auditoría queda — no depende de que el usuario siga
    // existiendo (ver nota en user-management-mock.data.ts sobre 'u0009').
    this.appendAudit(user, 'deleted', 'Usuario eliminado del sistema.');
  }

  private appendAudit(user: AppUser, action: AuditAction, detail: string): void {
    const entry: AuditLogEntry = {
      id: `a${nextAuditSeq++}`,
      timestamp: new Date().toISOString(),
      actorName: this.auth.currentUser()?.displayName ?? 'Sistema',
      targetUserId: user.id,
      targetUserName: fullName(user),
      action,
      detail,
    };
    this.auditLogSignal.update((list) => [entry, ...list]);
  }
}
