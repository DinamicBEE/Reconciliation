import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/data/auth.service';
import {
  AppUser,
  AuditAction,
  AuditLogEntry,
  PermissionKey,
  ROLE_LABEL,
  ROLES,
  RoleId,
  UserStatus,
} from './user-management.model';
import { MOCK_AUDIT_LOG, MOCK_USERS } from './user-management-mock.data';
import { generateTempPassword } from './password.util';

export type StatusFilter = 'all' | UserStatus;
export type RoleFilter = 'all' | RoleId;

export interface CreateUserInput {
  fullName: string;
  email: string;
  roleId: RoleId;
  status: UserStatus;
}

export interface UpdateUserInfoInput {
  fullName: string;
  email: string;
}

// El siguiente id debe ser mayor al de CUALQUIER id 'uN' ya usado, no solo
// los de MOCK_USERS — el mock de auditoría incluye a propósito un
// targetUserId ('u9') de un usuario YA ELIMINADO que no vive en MOCK_USERS
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
      if (role !== 'all' && user.roleId !== role) return false;
      if (status !== 'all' && user.status !== status) return false;
      if (term && !user.fullName.toLowerCase().includes(term) && !user.email.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  readonly summary = computed(() => {
    const users = this.usersSignal();
    return {
      total: users.length,
      active: users.filter((u) => u.status === 'active').length,
      inactive: users.filter((u) => u.status === 'inactive').length,
    };
  });

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

  auditForUser(userId: string): AuditLogEntry[] {
    return this.recentAuditLog().filter((entry) => entry.targetUserId === userId);
  }

  createUser(input: CreateUserInput): AppUser {
    const role = ROLES.find((r) => r.id === input.roleId)!;
    const user: AppUser = {
      id: `u${nextUserSeq++}`,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      roleId: input.roleId,
      permissions: [...role.defaultPermissions],
      status: input.status,
      createdAt: new Date().toISOString(),
      lastAccessAt: null,
    };

    this.usersSignal.update((list) => [user, ...list]);
    this.appendAudit(user, 'created', `Usuario creado con rol ${ROLE_LABEL[user.roleId]}.`);
    return user;
  }

  updateInfo(userId: string, input: UpdateUserInfoInput): void {
    const user = this.usersSignal().find((u) => u.id === userId);
    if (!user) return;

    const updated: AppUser = { ...user, fullName: input.fullName.trim(), email: input.email.trim() };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, 'updated', 'Se actualizó nombre y/o correo.');
  }

  // Cambiar de rol resetea los permisos al default de ese rol — el
  // componente parte de ahí y el admin ajusta manualmente lo que necesite
  // (mismo criterio que un selector de rol en cualquier admin panel: el rol
  // es un punto de partida, no una regla que se re-derive sola en cada
  // render).
  changeRole(userId: string, roleId: RoleId, permissions: PermissionKey[]): void {
    const user = this.usersSignal().find((u) => u.id === userId);
    if (!user) return;

    const roleChanged = user.roleId !== roleId;
    const updated: AppUser = { ...user, roleId, permissions };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

    if (roleChanged) {
      this.appendAudit(updated, 'role_changed', `Rol cambiado de ${ROLE_LABEL[user.roleId]} a ${ROLE_LABEL[roleId]}.`);
    } else {
      this.appendAudit(updated, 'permissions_changed', 'Se actualizaron los permisos asignados.');
    }
  }

  setStatus(userId: string, status: UserStatus): void {
    const user = this.usersSignal().find((u) => u.id === userId);
    if (!user || user.status === status) return;

    const updated: AppUser = { ...user, status };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    this.appendAudit(updated, status === 'active' ? 'activated' : 'deactivated', status === 'active' ? 'Cuenta activada.' : 'Cuenta desactivada.');
  }

  // No hay backend/correo real todavía — genera una contraseña temporal y la
  // devuelve para que el componente la muestre UNA vez (toast). El día que
  // exista backend, esto pasa a disparar un correo real y deja de devolver
  // la contraseña en claro.
  resetPassword(userId: string): string | null {
    const user = this.usersSignal().find((u) => u.id === userId);
    if (!user) return null;

    const tempPassword = generateTempPassword();
    this.appendAudit(user, 'password_reset', 'Se generó una nueva contraseña temporal.');
    return tempPassword;
  }

  deleteUser(userId: string): void {
    const user = this.usersSignal().find((u) => u.id === userId);
    if (!user) return;

    this.usersSignal.update((list) => list.filter((u) => u.id !== userId));
    // La entrada de auditoría queda — no depende de que el usuario siga
    // existiendo (ver nota en user-management-mock.data.ts sobre 'u9').
    this.appendAudit(user, 'deleted', 'Usuario eliminado del sistema.');
  }

  private appendAudit(user: AppUser, action: AuditAction, detail: string): void {
    const entry: AuditLogEntry = {
      id: `a${nextAuditSeq++}`,
      timestamp: new Date().toISOString(),
      actorName: this.auth.currentUser()?.displayName ?? 'Sistema',
      targetUserId: user.id,
      targetUserName: user.fullName,
      action,
      detail,
    };
    this.auditLogSignal.update((list) => [entry, ...list]);
  }
}
