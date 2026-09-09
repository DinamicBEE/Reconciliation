import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/data/auth.service';
import {
  AppUser,
  AppUserAddress,
  AuditAction,
  AuditLogEntry,
  MANAGER_ROLE_IDS,
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

export interface UpdateOrganizationInput {
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
      // No se piden al crear — se completan después editando el detalle (ver
      // UpdateUserInfoInput/UpdateOrganizationInput y sus respectivos update*).
      birthDate: '',
      ssn: '',
      gender: '',
      address: { city: '', state: '', zipCode: '', street1: '', street2: null },
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
      },
    };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'updated', 'Se actualizó información personal.');
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

  updateOrganization(userId: string, input: UpdateOrganizationInput): void {
    const user = this.findUser(userId);
    if (!user) return;

    const updated: AppUser = {
      ...user,
      department: input.department.trim(),
      area: input.area.trim(),
      jobTitle: input.jobTitle.trim(),
      managerId: input.managerId,
      employeeId: input.employeeId.trim(),
      hireDate: input.hireDate,
      contractEndDate: input.contractEndDate,
    };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'organization_updated', 'Se actualizaron departamento, área, puesto y/o responsable.');
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
  // la contraseña en claro. También limpia los intentos fallidos — mismo
  // criterio que un "desbloqueo" real: una contraseña nueva reinicia el
  // contador de intentos previos.
  resetPassword(userId: string): string | null {
    const user = this.findUser(userId);
    if (!user) return null;

    const updated: AppUser = { ...user, failedLoginAttempts: 0 };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

    const tempPassword = generateTempPassword();
    this.appendAudit(updated, 'password_reset', 'Se generó una nueva contraseña temporal.');
    return tempPassword;
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
