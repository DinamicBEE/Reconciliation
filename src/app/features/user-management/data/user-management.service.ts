import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { AuthService, CreateUserRequest, UpdateUserRequest, UpdateUserRolesRequest, UserDetailDto } from '../../auth/data/auth.service';
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

// `UserSummaryDto.status`/`UserDetailDto.status` (backend, mayúsculas) ↔
// `UserStatus` (este frontend, minúsculas) — ver `syncFromBackend` y
// `UserDetail` (fusión del detalle real).
const BACKEND_STATUS_TO_LOCAL: Record<string, UserStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  LOCKED: 'blocked',
};

export function backendStatusToLocal(status: string): UserStatus {
  return BACKEND_STATUS_TO_LOCAL[status] ?? 'active';
}

export type StatusFilter = 'all' | UserStatus;
export type RoleFilter = 'all' | RoleId;

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleIds: RoleId[];
  status: UserStatus;
  // A diferencia del resto de "Organización", sí se piden al crear (ver
  // AppUser.subsidiariaIds/.ubicacionIds) — catálogo REAL del backend
  // (CatalogService), no un valor propio de este mock. Arreglos: el backend
  // (`CreateUserRequest.subsidiariaIds`/`.ubicacionIds`) acepta varias.
  subsidiariaIds: number[];
  ubicacionIds: number[];
  // Supervisor — select SIMPLE (uno solo). Id 'uXXXX' de ESTE mock (igual
  // que `UpdateUserProfileInput.managerId`); `createUser()` lo resuelve al
  // `backendUserId` real antes de mandarlo como `supervisorId`.
  managerId: string | null;
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

  readonly allUsers = this.usersSignal.asReadonly();

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

  findUser(userId: string): AppUser | null {
    return this.usersSignal().find((u) => u.id === userId) ?? null;
  }

  // Reverso de `backendUserId` — para resolver `UserDetailDto.manager.id`
  // (un id REAL del backend) de vuelta al registro de ESTE mock, cuando lo
  // tiene (ver `UserDetail`, que fusiona el detalle real sobre la base del
  // mock). `null` si ese manager no tiene bridge conocido aquí — no todos
  // lo tienen todavía (ver AppUser.backendUserId).
  findByBackendUserId(backendUserId: number): AppUser | null {
    return this.usersSignal().find((u) => u.backendUserId === backendUserId) ?? null;
  }

  // Puente entre la sesión (login.ts, tras un login real contra
  // coctel-del-mar) y el registro local de `user-management` — el backend
  // de autenticación identifica cuentas por email, no por el `id` mock de
  // este módulo (no hay todavía un backend de administración de usuarios
  // que los comparta). Solo resuelve para cuentas de demo cuyo email
  // coincide con las sembradas en coctel-del-mar; si no hay match, la sesión
  // sigue autenticada pero sin `AppUser` vinculado (ver
  // `AccessControlService.currentAppUser`).
  findUserByEmail(email: string): AppUser | null {
    const target = email.trim().toLowerCase();
    return this.usersSignal().find((u) => u.email.toLowerCase() === target) ?? null;
  }

  // CU3 pasos 1-2: alta REAL (`POST /users`, ver `AuthService.createUser`) —
  // ya no genera nada localmente: `id` (numérico, el `backendUserId`),
  // `roleIds`/`permissions` efectivos y `temporaryPassword` vienen todos de
  // la respuesta del backend. `roleIds` en el alta solo se respeta si quien
  // la hace tiene `manage_roles` — si no, el backend responde 403
  // `ROLE_ASSIGNMENT_FORBIDDEN` (el `notifyBackendError` ya muestra
  // esa alerta; el `.subscribe({ error })` del llamador solo necesita
  // reaccionar, no traducir el mensaje).
  createUser(input: CreateUserInput): Observable<AppUser> {
    // "Administrador responsable" (id 'uXXXX' de ESTE mock) → id NUMÉRICO
    // real del backend, mismo bridge que `updateUserProfile`. `null` si no
    // se eligió uno o si el elegido todavía no tiene `backendUserId` (no
    // debería pasar, ver `managerCandidates`).
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
      // El form de creación solo ofrece Activo/Inactivo (ver
      // `UserDetail.createActive`) — nunca 'blocked', que el backend
      // rechazaría de todos modos (LOCKED solo lo genera el sistema).
      status: input.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    };

    return this.auth.createUser(request).pipe(
      map((result) => {
        const user: AppUser = {
          // Mínimo 4 dígitos (regla de negocio) — el padding es solo
          // cosmético, `maxSeq` (arriba) sigue leyendo el número con
          // `Number(...)` así que un id viejo sin padding igual se compara
          // bien. Este id 'uXXXX' sigue siendo solo de ESTE mock —
          // `backendUserId` (abajo) es el id real.
          id: `u${String(nextUserSeq++).padStart(4, '0')}`,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email: result.email,
          phone: input.phone.trim(),
          // Sin foto al crear — se sube después (no hay flujo de carga de
          // avatar todavía); cae a iniciales + color hasta entonces (ver
          // AppUser.avatarUrl). El backend tampoco modela avatar.
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
          // No se piden al crear — se completan después editando el detalle
          // (ver UpdateUserProfileInput/updateUserProfile). El backend
          // tampoco los pide al alta (ver CreateUserRequest.java).
          birthDate: '',
          ssn: '',
          gender: '',
          address: { city: '', state: '', zipCode: '', street1: '', street2: null, exteriorNumber: '', interiorNumber: null },
          department: '',
          area: '',
          jobTitle: '',
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

  // `GET /users` — reconcilia el mock local con el backend real: para cada
  // fila del mock CON `backendUserId`, sobreescribe roleIds/permissions/
  // status/emailVerified/lastAccessAt/mustChangePassword/subsidiariaIds/
  // ubicacionIds con lo que devuelva el backend (fuente de verdad); una fila
  // sin `backendUserId` (no debería quedar ninguna tras sembrar los 26, ver
  // MASTER.md) se deja intacta. Best-effort: si la llamada falla (backend
  // caído), se queda con lo último conocido — `UserList` la dispara una vez
  // al entrar a la pantalla, no es una fuente de verdad en vivo todavía.
  //
  // Además INSERTA cualquier cuenta real que el backend ya conoce pero que
  // `usersSignal` todavía no tiene — antes se perdían para siempre: `usersSignal`
  // arranca SIEMPRE desde `MOCK_USERS` (26 cuentas fijas) en cada bootstrap de
  // la app, así que un alta hecha en una sesión anterior (o desde fuera de
  // este frontend) nunca tenía un registro local con el que reconciliarse —
  // `GET /users` la devolvía, pero el `.map()` de arriba la ignoraba por
  // completo al no encontrar ningún `user.backendUserId` que hiciera match.
  //
  // Pagina: `GET /users` devuelve de a `size` (100) y el backend informa
  // `totalPages` — `AuthService.listAllUsers()` recorre todas las páginas, así
  // que con más de 100 cuentas la lista ya no se trunca.
  syncFromBackend(): void {
    this.auth.listAllUsers().subscribe({
      next: (users) => {
        const byBackendId = new Map(users.map((u) => [u.id, u]));
        const knownBackendIds = new Set(
          this.usersSignal()
            .map((u) => u.backendUserId)
            .filter((id): id is number => id !== null),
        );

        // El backend es la fuente de verdad: una cuenta con `backendUserId` que ya
        // no aparece en `GET /users` se dio de baja (o la base se re-sembró) y sale
        // de la lista local; antes se quedaba para siempre.
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

  // Trae el detalle COMPLETO (`GET /users/{id}`, no solo `UserSummaryDto` —
  // ahí no viene firstName/lastName/createdAt/organización) de una cuenta
  // real descubierta por `syncFromBackend()` sin registro local, y la agrega
  // como un `AppUser` nuevo. Guard de carrera: si para cuando responde esta
  // llamada esa cuenta YA tiene registro local (otra sync concurrente, o se
  // insertó por otra vía), no duplica.
  private fetchAndInsertUser(backendUserId: number): void {
    this.auth.getUserDetail(backendUserId).subscribe({
      next: (detail) => {
        if (this.usersSignal().some((u) => u.backendUserId === backendUserId)) return;
        this.usersSignal.update((list) => [this.buildUserFromDetail(detail), ...list]);
      },
      error: () => {},
    });
  }

  // Arma un `AppUser` completo a partir del detalle real del backend — mismo
  // mapeo de campos que `UserDetail.mergeBackendDetail`, pero construyendo un
  // registro NUEVO en vez de fusionar sobre una base del mock (no hay base:
  // esta cuenta no vivía en `MOCK_USERS`). Lo que el backend no modela
  // (avatarUrl, 2FA, última actividad) cae a su default; intentos fallidos,
  // sesiones activas y fin del bloqueo SÍ vienen del detalle real.
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
      department: detail.department ?? '',
      area: detail.area ?? '',
      jobTitle: detail.jobTitle ?? '',
      managerId,
      employeeId: detail.employeeCode ?? '',
      hireDate: detail.hireDate ?? '',
      contractEndDate: detail.contractEndDate,
      subsidiariaIds: detail.subsidiarias.map((s) => s.id),
      ubicacionIds: detail.ubicaciones.map((u) => u.id),
      backendUserId: detail.id,
    };
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
  }

  // Administrativo: un admin edita a OTRO usuario, información personal Y
  // organización JUNTAS, en una sola actualización + una sola entrada de
  // auditoría (ver `UserDetail.onSaveProfile()`) — reemplaza a los antiguos
  // `updateInfo`/`updateOrganization` como 2 llamadas separadas para ESE
  // caso de uso. Ver `UpdateUserProfileInput`.
  //
  // CU3 paso 3: `PATCH /users/{id}` real (ver `AuthService.updateUser`) —
  // requiere que el usuario ya esté vinculado (`backendUserId`); no debería
  // quedar ninguno sin vincular tras sembrar los 26 (ver MASTER.md). La
  // respuesta (`UserSummaryDto`) NO repite los campos que se acaban de
  // mandar, así que el `AppUser` resultante combina el `input` (lo que el
  // backend acaba de guardar) con lo que SÍ trae la respuesta (roles,
  // permisos, estado, mustChangePassword, emailVerified — autoritativo).
  // `subsidiariaIds`/`ubicacionIds` SÍ viajan (DEV, Guía_Endpoints: una lista
  // reemplaza la actual, vacía las quita, omitirla no toca nada): este form
  // siempre manda las dos listas. Un id inexistente rechaza TODO el PATCH con
  // 400 `INVALID_LOCATION` (lo avisa `notifyBackendError`). Tras
  // guardar, el `AppUser` toma las listas de la RESPUESTA (autoritativas).
  updateUserProfile(userId: string, input: UpdateUserProfileInput): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }
    const backendUserId = user.backendUserId;

    // `managerId` del form es el id 'uXXXX' de ESTE mock — el backend
    // necesita el id numérico real del manager (mismo bridge que
    // `UserDetail.mergeBackendDetail`, en sentido inverso).
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
      department: input.department.trim() || null,
      area: input.area.trim() || null,
      jobTitle: input.jobTitle.trim() || null,
      managerId: managerBackendId,
      employeeCode: input.employeeId.trim() || null,
      hireDate: input.hireDate || null,
      contractEndDate: input.contractEndDate,
      subsidiariaIds: input.subsidiariaIds,
      ubicacionIds: input.ubicacionIds,
    };

    return this.auth.updateUser(backendUserId, request).pipe(
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
          department: input.department.trim(),
          area: input.area.trim(),
          jobTitle: input.jobTitle.trim(),
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

  // ¿Hay algo que guardar en "Seguridad y acceso"? (roles o permisos distintos a los actuales)
  accessChanged(userId: string, roleIds: RoleId[], permissions: PermissionKey[]): boolean {
    const user = this.findUser(userId);
    return !!user && (!sameSet(user.roleIds, roleIds) || !sameSet(user.permissions, permissions));
  }

  // `PATCH /users/{id}/roles` real (ver `AuthService.updateUserRoles`). Cambiar los
  // roles asignados resetea los permisos a la UNIÓN de los defaults de esos
  // roles (`AccessCatalogService.defaultPermissionsForRoles`) — el componente
  // parte de ahí y el admin ajusta lo que necesite; aquí llega el RESULTADO
  // FINAL y el backend lo guarda tal cual. Solo se manda lo que cambió (omitido =
  // no tocar). El endpoint EXIGE `manage_roles` (403 `ROLE_ASSIGNMENT_FORBIDDEN`)
  // aunque solo se cambien permisos.
  // La respuesta (`UserSummaryDto`) es autoritativa para roles/permisos/estado.
  // Si la persona editada es la de la sesión, se renueva la sesión YA
  // (`AuthService.renewSession`) en vez de esperar al siguiente refresh.
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

    return this.auth.updateUserRoles(user.backendUserId, request).pipe(
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

        if (this.auth.currentUser()?.appUserId === userId) {
          this.auth.renewSession().subscribe();
        }
        return updated;
      }),
      // Si el backend rechaza el cambio, el registro no cambió: se re-emite con
      // arreglos NUEVOS para que los selectores de rol (ngModel) vuelvan a
      // mostrar los roles reales en vez de la selección que se descartó.
      catchError((err: unknown) => {
        this.usersSignal.update((list) =>
          list.map((u) => (u.id === userId ? { ...u, roleIds: [...u.roleIds], permissions: [...u.permissions] } : u)),
        );
        return throwError(() => err);
      }),
    );
  }

  // 3 estados posibles (activo/inactivo/bloqueado, ver StatusChip) — cada
  // uno tiene su propia AuditAction para que el historial diga exactamente
  // qué pasó, no un genérico "estado cambiado".
  //
  // CU3 paso 4: `PATCH /users/{id}/status` real (ver `AuthService.changeStatus`)
  // — mismo criterio que `updateUserProfile`: requiere `backendUserId`, y la
  // respuesta (`UserSummaryDto`) es autoritativa para roles/permisos/estado/
  // mustChangePassword/emailVerified/subsidiarias/ubicaciones (se reconcilian
  // también, por si divergieron).
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

    return this.auth.changeStatus(user.backendUserId, status).pipe(
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
          // Guía_Endpoints (`PATCH /users/{id}/status`): `active` también
          // desbloquea (borra el vencimiento y el contador de intentos);
          // `blocked` es manual y no vence solo (`lockedUntil` null). La
          // respuesta es un `UserSummaryDto` sin estos 2 campos, así que se
          // reflejan aquí.
          ...(status === 'active' ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
          ...(status === 'blocked' ? { lockedUntil: null } : {}),
        };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));

        return updated;
      }),
    );
  }

  // CU3 paso 5: `PATCH /users/{id}/unlock` real (ver `AuthService.unlockUser`)
  // — desbloquea una cuenta bloqueada (por intentos fallidos o manual). El
  // backend responde un `UserSummaryDto`; además deja en cero el contador de
  // intentos y borra `lockedUntil` (ver `setStatus`, mismo efecto que
  // `status: active`).
  unlockAccount(userId: string): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.auth.unlockUser(user.backendUserId).pipe(
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

  // CU3 paso 6: `POST /users/{id}/verify-email` real (ver
  // `AuthService.verifyEmail`) — el guard `user.emailVerified` evita una
  // llamada innecesaria (el botón ya está oculto en ese caso, ver
  // `user-detail.html`), no algo que el backend exija (fuerza el flag
  // igual si se llama de nuevo).
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

    return this.auth.verifyEmail(user.backendUserId).pipe(
      map(() => {
        const updated: AppUser = { ...user, emailVerified: true };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return updated;
      }),
    );
  }

  // `POST /users/{id}/close-sessions` real (ver `AuthService.closeUserSessions`):
  // revoca todos los refresh tokens vigentes de la persona — no cambia su
  // contraseña ni su estado, puede volver a entrar (el access token ya emitido
  // vive hasta 15 min). La respuesta trae el contador resultante.
  closeSessions(userId: string): Observable<AppUser> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.auth.closeUserSessions(user.backendUserId).pipe(
      map((res) => {
        const updated: AppUser = { ...user, activeSessions: res.activeSessions };
        this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
        return updated;
      }),
    );
  }

  // `POST /users/{id}/reset-password` real (ver `AuthService.resetUserPassword`): el
  // backend devuelve a la persona a su contraseña temporal (NOMBRE + PRIMER
  // APELLIDO + año de alta), marca `mustChangePassword` y REVOCA todas sus
  // sesiones (`activeSessions` queda en 0); no cambia su estado — un bloqueo se
  // levanta con "Desbloquear". El sistema no envía correos: la contraseña se
  // devuelve para que el administrador la entregue (toast).
  resetPassword(userId: string): Observable<string> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.auth.resetUserPassword(user.backendUserId).pipe(
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

  // `DELETE /users/{id}` real (ver `AuthService.deleteUser`): baja LÓGICA — la
  // cuenta deja de poder entrar y desaparece de listados y detalle, pero su fila
  // y su bitácora se conservan y su correo queda libre. Un administrador no
  // puede darse de baja a sí mismo (409 `CANNOT_DELETE_SELF`; la UI además lo
  // deshabilita). Al responder, el registro sale de la lista local.
  deleteUser(userId: string): Observable<void> {
    const user = this.findUser(userId);
    if (!user) {
      return throwError(() => new Error('Usuario no encontrado.'));
    }
    if (!user.backendUserId) {
      return throwError(() => new Error('Este usuario no está vinculado a una cuenta real del backend.'));
    }

    return this.auth.deleteUser(user.backendUserId).pipe(
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

    // Ya definió su propia contraseña — la temporal deja de estar vigente
    // (el backend deja de devolver `temporaryPassword`).
    const updated: AppUser = { ...user, mustChangePassword: false, temporaryPassword: null };
    this.usersSignal.update((list) => list.map((u) => (u.id === userId ? updated : u)));
  }

}

// Igualdad de conjuntos (sin importar el orden) — roles/permisos son conjuntos.
function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
