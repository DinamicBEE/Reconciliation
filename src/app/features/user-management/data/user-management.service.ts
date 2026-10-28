import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CreateUserRequest, UpdateUserRequest, UpdateUserRolesRequest, UserDetailDto, UsersApiService } from './users-api.service';
import {
  AppUser,
  AppUserAddress,
  MANAGER_ROLE_IDS,
  PermissionKey,
  RoleId,
  UserStatus,
  fullName,
} from './user-management.model';
import { MOCK_USERS } from './user-management-mock.data';

const BACKEND_STATUS_TO_LOCAL: Record<string, UserStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  LOCKED: 'blocked',
};

/**
 * Traduce el estado del backend (mayúsculas) a {@link UserStatus}.
 *
 * @returns `'active'` para un código desconocido.
 * @see docs/codigo/usuarios.md#estados-de-cuenta
 */
export function backendStatusToLocal(status: string): UserStatus {
  return BACKEND_STATUS_TO_LOCAL[status] ?? 'active';
}

/**
 * Ids de cargos, puestos, departamentos y áreas del detalle de `GET /users/{id}`.
 *
 * @remarks Tolera listas ausentes (`[]`) por si el backend desplegado no trae los catálogos organizacionales.
 */
export function organizationIdsFromDetail(
  detail: UserDetailDto,
): Pick<AppUser, 'cargoIds' | 'puestoIds' | 'departamentoIds' | 'areaIds'> {
  return {
    cargoIds: (detail.cargos ?? []).map((c) => c.id),
    puestoIds: (detail.puestos ?? []).map((p) => p.id),
    departamentoIds: (detail.departamentos ?? []).map((d) => d.id),
    areaIds: (detail.areas ?? []).map((a) => a.id),
  };
}

/** Filtro de estado de la lista de usuarios. */
export type StatusFilter = 'all' | UserStatus;
/** Filtro de rol de la lista de usuarios. */
export type RoleFilter = 'all' | RoleId;

/**
 * Datos del formulario de alta.
 *
 * @see docs/codigo/usuarios.md#alta-de-usuario
 */
export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleIds: RoleId[];
  /** El formulario solo ofrece `active` e `inactive`. */
  status: UserStatus;
  subsidiariaIds: number[];
  ubicacionIds: number[];
  /** Id local `uXXXX` del supervisor; se envía como `supervisorId` con su `backendUserId`. */
  managerId: string | null;
}

/**
 * Datos personales que cada quien edita en su perfil (sin organización).
 *
 * @see docs/codigo/usuarios.md#edicion-de-perfil
 */
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

/**
 * Datos personales y organización que un administrador edita en `UserDetail`.
 *
 * @remarks `managerId` es un id local `uXXXX`.
 * @see docs/codigo/usuarios.md#edicion-de-perfil
 */
export interface UpdateUserProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  ssn: string;
  gender: string;
  address: AppUserAddress;
  cargoIds: number[];
  puestoIds: number[];
  departamentoIds: number[];
  areaIds: number[];
  managerId: string | null;
  employeeId: string;
  hireDate: string;
  contractEndDate: string | null;
  subsidiariaIds: number[];
  ubicacionIds: number[];
}

// El siguiente id debe ser mayor al de cualquier id 'uN' ya usado en MOCK_USERS.
function maxSeq(ids: string[]): number {
  return ids.reduce((max, id) => {
    const match = /^u(\d+)$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

let nextUserSeq = maxSeq(MOCK_USERS.map((u) => u.id)) + 1;

/**
 * Registro de usuarios, filtros y selección de la lista, y mutaciones contra `/users/**`.
 *
 * @remarks `providedIn: 'root'` para que el estado sobreviva entre lista, detalle y auditoría (rutas distintas).
 * @see docs/codigo/usuarios.md#servicio-de-usuarios
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly auth = inject(AuthService);
  private readonly usersApi = inject(UsersApiService);

  private readonly usersSignal = signal<AppUser[]>(MOCK_USERS);

  readonly allUsers = this.usersSignal.asReadonly();

  /** Registro de la sesión actual, resuelto por correo (ADR-0001, punto 5); `null` si no hay registro. */
  readonly currentAppUser = computed<AppUser | null>(() => {
    const email = this.auth.currentUser()?.username;
    return email ? this.findUserByEmail(email) : null;
  });

  // Escritura solo por métodos (ADR-0002, punto 4).
  private readonly searchState = signal('');
  private readonly roleFilterState = signal<RoleFilter>('all');
  private readonly statusFilterState = signal<StatusFilter>('all');
  readonly search = this.searchState.asReadonly();
  readonly roleFilter = this.roleFilterState.asReadonly();
  readonly statusFilter = this.statusFilterState.asReadonly();

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

  // Selección de la lista; "todos" abarca solo los usuarios filtrados visibles.
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

  /** Usuarios con un rol de {@link MANAGER_ROLE_IDS}; el componente excluye a la persona editada. */
  readonly managerCandidates = computed(() =>
    this.usersSignal().filter((u) => u.roleIds.some((r) => MANAGER_ROLE_IDS.includes(r))),
  );

  setSearch(value: string): void {
    this.searchState.set(value);
  }

  setRoleFilter(value: RoleFilter): void {
    this.roleFilterState.set(value);
  }

  setStatusFilter(value: StatusFilter): void {
    this.statusFilterState.set(value);
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

  /** Quita los filtrados si ya están todos seleccionados; si no (incluido el indeterminado), los agrega. */
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

  findUser(userId: string): AppUser | null {
    return this.usersSignal().find((u) => u.id === userId) ?? null;
  }

  /**
   * Registro local cuyo `backendUserId` coincide (p. ej. para resolver `UserDetailDto.manager.id`).
   *
   * @returns `null` si ningún registro local tiene ese id del backend.
   */
  findByBackendUserId(backendUserId: number): AppUser | null {
    return this.usersSignal().find((u) => u.backendUserId === backendUserId) ?? null;
  }

  /**
   * Registro local con ese correo, sin distinguir mayúsculas; vincula la sesión con su registro.
   *
   * @returns `null` si no hay registro; la sesión sigue autenticada sin `AppUser`.
   * @see docs/codigo/usuarios.md#sincronizacion-con-backend
   */
  findUserByEmail(email: string): AppUser | null {
    const target = email.trim().toLowerCase();
    return this.usersSignal().find((u) => u.email.toLowerCase() === target) ?? null;
  }

  /**
   * Da de alta con `POST /users` y agrega el registro con el id, roles, permisos y contraseña que asigna el backend.
   *
   * @returns Observable con el nuevo `AppUser`; falla con el error HTTP del alta (lo avisa el interceptor).
   * @see docs/codigo/usuarios.md#alta-de-usuario
   */
  createUser(input: CreateUserInput): Observable<AppUser> {
    // Id local del responsable → `backendUserId`; `null` si no tiene.
    const managerBackendId = input.managerId ? (this.findUser(input.managerId)?.backendUserId ?? null) : null;

    const request: CreateUserRequest = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim() || null,
      supervisorId: managerBackendId,
      subsidiariaIds: input.subsidiariaIds,
      ubicacionIds: input.ubicacionIds,
      roleIds: input.roleIds,
      // El alta nunca es `blocked`: `LOCKED` solo lo genera el sistema.
      status: input.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    };

    return this.usersApi.createUser(request).pipe(
      map((result) => {
        const user: AppUser = {
          // Id local de mínimo 4 dígitos (regla de negocio); `maxSeq` lee el número sin padding.
          id: `u${String(nextUserSeq++).padStart(4, '0')}`,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email: result.email,
          phone: input.phone.trim(),
          // No hay carga de avatar y el backend no lo modela.
          avatarUrl: null,
          status: input.status,
          createdAt: new Date().toISOString(),
          lastAccessAt: null,
          roleIds: result.roles,
          // Los que el backend asignó al crear (copia de los defaults de los roles).
          permissions: result.permissions as PermissionKey[],
          emailVerified: false,
          lastActivityAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          twoFactorEnabled: false,
          activeSessions: 0,
          mustChangePassword: result.mustChangePassword,
          temporaryPassword: result.temporaryPassword,
          // No se piden en el alta; se completan editando el detalle.
          birthDate: '',
          ssn: '',
          gender: '',
          address: { city: '', state: '', zipCode: '', street1: '', street2: null, exteriorNumber: '', interiorNumber: null },
          cargoIds: [],
          puestoIds: [],
          departamentoIds: [],
          areaIds: [],
          managerId: input.managerId,
          employeeId: '',
          hireDate: '',
          contractEndDate: null,
          subsidiariaIds: input.subsidiariaIds,
          ubicacionIds: input.ubicacionIds,
          backendUserId: result.id,
        };

        this.usersSignal.update((list) => [user, ...list]);
        return user;
      }),
    );
  }

  /**
   * Reconcilia el registro local con todas las páginas de `GET /users`: actualiza, quita e inserta cuentas.
   *
   * @remarks Best-effort: si la llamada falla se conserva lo último conocido.
   * @see docs/codigo/usuarios.md#sincronizacion-con-backend
   */
  syncFromBackend(): void {
    this.usersApi.listAllUsers().subscribe({
      next: (users) => {
        const byBackendId = new Map(users.map((u) => [u.id, u]));
        const knownBackendIds = new Set(
          this.usersSignal()
            .map((u) => u.backendUserId)
            .filter((id): id is number => id !== null),
        );

        // Una cuenta con `backendUserId` ausente de `GET /users` se dio de baja: sale de la lista.
        this.usersSignal.update((list) =>
          list
            .filter((user) => user.backendUserId === null || byBackendId.has(user.backendUserId))
            .map((user) => {
            if (user.backendUserId === null) return user;
            const real = byBackendId.get(user.backendUserId);
            if (!real) return user;
            return {
              ...user,
              roleIds: real.roles as RoleId[],
              permissions: real.permissions as PermissionKey[],
              status: backendStatusToLocal(real.status),
              emailVerified: real.emailVerified,
              lastAccessAt: real.lastLoginAt,
              mustChangePassword: real.mustChangePassword,
              subsidiariaIds: real.subsidiarias.map((s) => s.id),
              ubicacionIds: real.ubicaciones.map((u) => u.id),
            };
          }),
        );

        for (const id of byBackendId.keys()) {
          if (!knownBackendIds.has(id)) this.fetchAndInsertUser(id);
        }
      },
      error: () => {},
    });
  }

  // Inserta una cuenta del backend sin registro local; no duplica si otra sync la insertó antes.
  // Ver docs/codigo/usuarios.md#sincronizacion-con-backend.
  private fetchAndInsertUser(backendUserId: number): void {
    this.usersApi.getUserDetail(backendUserId).subscribe({
      next: (detail) => {
        if (this.usersSignal().some((u) => u.backendUserId === backendUserId)) return;
        this.usersSignal.update((list) => [this.buildUserFromDetail(detail), ...list]);
      },
      error: () => {},
    });
  }

  // Mismo mapeo que `UserDetail.mergeBackendDetail`, pero sin registro base; avatar, 2FA y
  // última actividad no los modela el backend.
  private buildUserFromDetail(detail: UserDetailDto): AppUser {
    const managerId = detail.manager ? (this.findByBackendUserId(detail.manager.id)?.id ?? null) : null;

    return {
      id: `u${String(nextUserSeq++).padStart(4, '0')}`,
      firstName: detail.firstName,
      lastName: detail.lastName,
      email: detail.email,
      phone: detail.phone ?? '',
      avatarUrl: null,
      status: backendStatusToLocal(detail.status),
      createdAt: detail.createdAt,
      lastAccessAt: detail.lastLoginAt,
      birthDate: detail.birthDate ?? '',
      ssn: detail.ssn ?? '',
      gender: detail.gender ?? '',
      address: {
        city: detail.address.city ?? '',
        state: detail.address.state ?? '',
        zipCode: detail.address.postalCode ?? '',
        street1: detail.address.street1 ?? '',
        street2: detail.address.street2,
        exteriorNumber: detail.address.exteriorNumber ?? '',
        interiorNumber: detail.address.interiorNumber,
      },
      roleIds: detail.roles as RoleId[],
      permissions: detail.permissions as PermissionKey[],
      emailVerified: detail.emailVerified,
      lastActivityAt: null,
      failedLoginAttempts: detail.failedLoginAttempts ?? 0,
      lockedUntil: detail.lockedUntil ?? null,
      twoFactorEnabled: false,
      activeSessions: detail.activeSessions ?? 0,
      mustChangePassword: detail.mustChangePassword,
      temporaryPassword: detail.temporaryPassword,
      ...organizationIdsFromDetail(detail),
      managerId,
      employeeId: detail.employeeCode ?? '',
      hireDate: detail.hireDate ?? '',
      contractEndDate: detail.contractEndDate,
      subsidiariaIds: detail.subsidiarias.map((s) => s.id),
      ubicacionIds: detail.ubicaciones.map((u) => u.id),
      backendUserId: detail.id,
    };
  }

  /**
   * Actualiza localmente los datos personales que la persona edita en su perfil (`/perfil`).
   *
   * @see docs/codigo/usuarios.md#edicion-de-perfil
   */
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
  }

  /**
   * Guarda datos personales y organización de otra persona con `PATCH /users/{id}` (CU3 paso 3).
   *
   * @remarks El resultado combina el `input` con la respuesta, autoritativa para roles, estado y listas.
   * @returns Observable con el `AppUser` actualizado; falla sin `backendUserId` o con 400 `INVALID_LOCATION`/`INVALID_CATALOG_ITEM`.
   * @see docs/codigo/usuarios.md#edicion-de-perfil
   */
  updateUserProfile(userId: string, input: UpdateUserProfileInput): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }
    const backendUserId = user.backendUserId;

    // Id local del responsable → `backendUserId` (inverso de `UserDetail.mergeBackendDetail`).
    const managerBackendId = input.managerId ? (this.findUser(input.managerId)?.backendUserId ?? null) : null;

    const request: UpdateUserRequest = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim() || null,
      birthDate: input.birthDate || null,
      ssn: input.ssn.trim() || null,
      gender: input.gender || null,
      address: {
        city: input.address.city.trim() || null,
        state: input.address.state.trim() || null,
        postalCode: input.address.zipCode.trim() || null,
        street1: input.address.street1.trim() || null,
        street2: input.address.street2?.trim() || null,
        interiorNumber: input.address.interiorNumber?.trim() || null,
        exteriorNumber: input.address.exteriorNumber.trim() || null,
      },
      managerId: managerBackendId,
      employeeCode: input.employeeId.trim() || null,
      hireDate: input.hireDate || null,
      contractEndDate: input.contractEndDate,
      subsidiariaIds: input.subsidiariaIds,
      ubicacionIds: input.ubicacionIds,
      // Siempre la lista completa: la del backend se reemplaza.
      cargoIds: input.cargoIds,
      puestoIds: input.puestoIds,
      departamentoIds: input.departamentoIds,
      areaIds: input.areaIds,
    };

    return this.usersApi.updateUser(backendUserId, request).pipe(
      map((summary) => {
        const updated: AppUser = {
          ...user,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email: input.email.trim(),
          phone: summary.phone ?? input.phone.trim(),
          birthDate: input.birthDate,
          ssn: input.ssn.trim(),
          gender: input.gender,
          address: { ...input.address },
          // `UserSummaryDto` no repite cargos/puestos/departamentos/áreas: se
          // toma lo enviado (el backend lo guardó tal cual o habría respondido 400).
          cargoIds: [...input.cargoIds],
          puestoIds: [...input.puestoIds],
          departamentoIds: [...input.departamentoIds],
          areaIds: [...input.areaIds],
          managerId: input.managerId,
          employeeId: input.employeeId.trim(),
          hireDate: input.hireDate,
          contractEndDate: input.contractEndDate,
          subsidiariaIds: summary.subsidiarias.map((s) => s.id),
          ubicacionIds: summary.ubicaciones.map((u) => u.id),
          status: backendStatusToLocal(summary.status),
          roleIds: summary.roles as RoleId[],
          permissions: summary.permissions as PermissionKey[],
          emailVerified: summary.emailVerified,
          mustChangePassword: summary.mustChangePassword,
        };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return updated;
      }),
    );
  }

  /** Indica si roles o permisos difieren, como conjuntos, de los guardados ("Seguridad y acceso"). */
  accessChanged(userId: string, roleIds: RoleId[], permissions: PermissionKey[]): boolean {
    const user = this.findUser(userId);
    return !!user && (!sameSet(user.roleIds, roleIds) || !sameSet(user.permissions, permissions));
  }

  /**
   * Guarda con `PATCH /users/{id}/roles` solo los roles o permisos que cambiaron.
   *
   * @remarks `permissions` es el resultado final; si la persona es la de la sesión, se renueva la sesión.
   * @returns Observable con el `AppUser` actualizado (o el actual si nada cambió); falla con 403 `ROLE_ASSIGNMENT_FORBIDDEN`.
   * @see docs/codigo/usuarios.md#roles-asignados
   */
  changeRoles(userId: string, roleIds: RoleId[], permissions: PermissionKey[]): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (roleIds.length === 0) {
      return throwError(() => new Error('Selecciona al menos un rol.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    const rolesChanged = !sameSet(user.roleIds, roleIds);
    const permissionsChanged = !sameSet(user.permissions, permissions);
    if (!rolesChanged && !permissionsChanged) {
      return of(user);
    }

    const request: UpdateUserRolesRequest = {
      ...(rolesChanged ? { roleIds } : {}),
      ...(permissionsChanged ? { permissions } : {}),
    };

    return this.usersApi.updateUserRoles(user.backendUserId, request).pipe(
      map((summary) => {
        const updated: AppUser = {
          ...user,
          roleIds: summary.roles as RoleId[],
          permissions: summary.permissions as PermissionKey[],
          status: backendStatusToLocal(summary.status),
          emailVerified: summary.emailVerified,
          mustChangePassword: summary.mustChangePassword,
          subsidiariaIds: summary.subsidiarias.map((x) => x.id),
          ubicacionIds: summary.ubicaciones.map((x) => x.id),
        };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

        if (this.currentAppUser()?.id === userId) {
          this.auth.renewSession().subscribe();
        }
        return updated;
      }),
      // Ante un rechazo se re-emite con arreglos nuevos para que los selectores (ngModel)
      // vuelvan a mostrar los roles guardados.
      catchError((err: unknown) => {
        this.usersSignal.update((list) =>
          list.map((u) => (u.id === userId ? { ...u, roleIds: [...u.roleIds], permissions: [...u.permissions] } : u)),
        );
        return throwError(() => err);
      }),
    );
  }

  /**
   * Cambia el estado con `PATCH /users/{id}/status` (CU3 paso 4); la respuesta reconcilia el registro.
   *
   * @returns Observable con el `AppUser` actualizado; falla si ya tiene ese estado o no tiene `backendUserId`.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  setStatus(userId: string, status: UserStatus): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (user.status === status) {
      return throwError(() => new Error('El usuario ya tiene ese estado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.usersApi.changeStatus(user.backendUserId, status).pipe(
      map((summary) => {
        const updated: AppUser = {
          ...user,
          status: backendStatusToLocal(summary.status),
          roleIds: summary.roles as RoleId[],
          permissions: summary.permissions as PermissionKey[],
          emailVerified: summary.emailVerified,
          mustChangePassword: summary.mustChangePassword,
          subsidiariaIds: summary.subsidiarias.map((s) => s.id),
          ubicacionIds: summary.ubicaciones.map((u) => u.id),
          // `active` desbloquea y `blocked` no vence; la respuesta no trae estos campos.
          ...(status === 'active' ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
          ...(status === 'blocked' ? { lockedUntil: null } : {}),
        };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

        return updated;
      }),
    );
  }

  /**
   * Desbloquea con `PATCH /users/{id}/unlock` (CU3 paso 5): contador de intentos a 0 y sin `lockedUntil`.
   *
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  unlockAccount(userId: string): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.usersApi.unlockUser(user.backendUserId).pipe(
      map((summary) => {
        const updated: AppUser = {
          ...user,
          status: backendStatusToLocal(summary.status),
          failedLoginAttempts: 0,
          lockedUntil: null,
        };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return updated;
      }),
    );
  }

  /**
   * Marca el correo como verificado con `POST /users/{id}/verify-email` (CU3 paso 6).
   *
   * @returns Observable con el `AppUser` actualizado; falla sin llamar si el correo ya está verificado.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  setEmailVerified(userId: string): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (user.emailVerified) {
      return throwError(() => new Error('El correo ya está verificado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.usersApi.verifyEmail(user.backendUserId).pipe(
      map(() => {
        const updated: AppUser = { ...user, emailVerified: true };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return updated;
      }),
    );
  }

  /**
   * Revoca los refresh tokens de la persona con `POST /users/{id}/close-sessions`.
   *
   * @remarks No cambia contraseña ni estado; el access token emitido sigue vivo hasta 15 min.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  closeSessions(userId: string): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.usersApi.closeUserSessions(user.backendUserId).pipe(
      map((res) => {
        const updated: AppUser = { ...user, activeSessions: res.activeSessions };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return updated;
      }),
    );
  }

  /**
   * Restablece la contraseña temporal con `POST /users/{id}/reset-password` y revoca las sesiones.
   *
   * @remarks No cambia el estado ni envía correos: el administrador entrega la contraseña.
   * @returns Observable con la contraseña temporal.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  resetPassword(userId: string): Observable<string> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.usersApi.resetUserPassword(user.backendUserId).pipe(
      map((res) => {
        const updated: AppUser = {
          ...user,
          mustChangePassword: true,
          temporaryPassword: res.temporaryPassword,
          activeSessions: 0,
        };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return res.temporaryPassword;
      }),
    );
  }

  /**
   * Da de baja lógica con `DELETE /users/{id}` y quita el registro de la lista y de la selección.
   *
   * @returns Observable que completa tras la baja; falla con 409 `CANNOT_DELETE_SELF`.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  deleteUser(userId: string): Observable<void> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.usersApi.deleteUser(user.backendUserId).pipe(
      map(() => {
        this.usersSignal.update((list) => list.filter((u) => u.id !== userId));
        this.selectedIdsSignal.update((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
      }),
    );
  }
}

// Igualdad de conjuntos (sin importar el orden) — roles/permisos son conjuntos.
function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
