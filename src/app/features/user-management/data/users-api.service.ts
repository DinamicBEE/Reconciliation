import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, of, reduce, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { UserSummaryDto } from '../../../core/auth/auth.service';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { RoleId, UserStatus } from './user-management.model';

// Tamaño de página de `GET /users` (el backend usa 20 por defecto).
const USERS_PAGE_SIZE = 100;

/** Dirección tal como la envía y devuelve `/users/{id}`. */
export interface AddressInfo {
  city: string | null;
  state: string | null;
  postalCode: string | null;
  street1: string | null;
  street2: string | null;
  interiorNumber: string | null;
  exteriorNumber: string | null;
}

/** Responsable resuelto en `UserDetailDto.manager`; `id` es `app_user.id`. */
export interface ManagerSummary {
  id: number;
  displayName: string;
}

/**
 * Respuesta de `GET /users/{id}`: detalle completo, con los datos relacionales resueltos a `{ id, nombre }`.
 *
 * @see docs/codigo/usuarios.md#contrato-users-api
 */
export interface UserDetailDto {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
  mustChangePassword: boolean;
  /** Solo viene mientras `mustChangePassword` es `true`; el backend la recalcula, no la guarda. */
  temporaryPassword: string | null;
  failedLoginAttempts: number;
  /** Refresh tokens sin revocar ni vencer. */
  activeSessions: number;
  /** Fin del bloqueo temporal; `null` si no hay bloqueo o es manual. */
  lockedUntil: string | null;
  lastLoginAt: string | null;
  emailVerified: boolean;
  createdAt: string;
  birthDate: string | null;
  ssn: string | null;
  gender: string | null;
  address: AddressInfo;
  /** Catálogo del Core (`GET /catalogs/cargos`), mismos ids que los combos; igual puestos, departamentos y áreas. */
  cargos: CatalogEntry[];
  puestos: CatalogEntry[];
  departamentos: CatalogEntry[];
  areas: CatalogEntry[];
  manager: ManagerSummary | null;
  employeeCode: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
}

/**
 * Cuerpo de `POST /users` (CU3 pasos 1-2).
 *
 * @remarks `roleIds` exige `manage_roles` en la sesión; si falta, 403 `ROLE_ASSIGNMENT_FORBIDDEN`.
 * @see docs/codigo/usuarios.md#alta-de-usuario
 */
export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** `app_user.id` del responsable. */
  supervisorId: number | null;
  subsidiariaIds: number[];
  ubicacionIds: number[];
  roleIds: RoleId[];
  /** `LOCKED` lo genera solo el sistema; el backend lo rechaza en el alta. */
  status: 'ACTIVE' | 'INACTIVE' | null;
}

// Respuesta cruda de `POST /users`; `createUser()` castea `roles`.
interface NewUserResponseDto {
  id: number;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
  mustChangePassword: boolean;
  temporaryPassword: string;
}

/** Resultado del alta; separado de `UserSummaryDto` porque `temporaryPassword` se muestra una sola vez. */
export interface NewUserResult {
  id: number;
  email: string;
  displayName: string;
  roles: RoleId[];
  permissions: string[];
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
  mustChangePassword: boolean;
  temporaryPassword: string;
}

/**
 * Cuerpo de `PATCH /users/{id}`: información personal y organización (sin estado ni roles).
 *
 * @remarks Un `null` no borra un texto; una lista reemplaza la actual y omitirla no la toca.
 * @see docs/codigo/usuarios.md#edicion-de-perfil
 */
export interface UpdateUserRequest {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  ssn: string | null;
  gender: string | null;
  address: AddressInfo | null;
  managerId: number | null;
  employeeCode: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
  subsidiariaIds?: number[];
  ubicacionIds?: number[];
  cargoIds?: number[];
  puestoIds?: number[];
  departamentoIds?: number[];
  areaIds?: number[];
}

/** Respuesta de `POST /users/{id}/verify-email`. */
export interface EmailVerificationResponse {
  id: number;
  emailVerified: boolean;
}

/**
 * Cuerpo de `PATCH /users/{id}/roles`: omitido = no tocar; una lista reemplaza la actual.
 *
 * @see docs/codigo/usuarios.md#roles-asignados
 */
export interface UpdateUserRolesRequest {
  roleIds?: string[];
  permissions?: string[];
}

/** Respuesta de `POST /users/{id}/reset-password`. */
export interface ResetPasswordResponse {
  id: number;
  temporaryPassword: string;
}

/** Respuesta de `DELETE /users/{id}` (baja lógica). */
export interface DeleteUserResponse {
  success: boolean;
  id: number;
}

/** Respuesta de `POST /users/{id}/close-sessions`. */
export interface CloseSessionsResponse {
  id: number;
  activeSessions: number;
}

/** Filtros y página de `GET /users`; `page` empieza en 0. */
export interface UserListParams {
  search?: string;
  role?: RoleId;
  status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  page?: number;
  size?: number;
}

/** Página de `GET /users`. */
export interface UserListPage {
  content: UserSummaryDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Cliente HTTP de administración de usuarios (`/users/**`); todo `backendUserId` es `app_user.id`.
 *
 * @remarks Separado de `AuthService` (ADR-0001, punto 4); los errores los avisa `httpErrorAlertInterceptor`.
 * @see docs/codigo/usuarios.md#contrato-users-api
 */
@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * `PATCH /users/{id}/unlock` (CU3 paso 5), permiso `manage_users`.
   *
   * @returns Observable con el resumen actualizado; falla con 403 sin permiso o 401 con token inválido.
   */
  unlockUser(backendUserId: number): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}/unlock`, {});
  }

  /** `GET /users/{id}`: detalle completo con el que se precarga `UserDetail`. */
  getUserDetail(backendUserId: number): Observable<UserDetailDto> {
    return this.http.get<UserDetailDto>(`${this.apiUrl}/users/${backendUserId}`);
  }

  /**
   * `POST /users` (CU3 pasos 1-2).
   *
   * @returns Observable con el alta y su contraseña temporal; falla con 409 `EMAIL_ALREADY_REGISTERED`, 400 `INVALID_ROLE`/`INVALID_USER_STATUS` o 403 `ROLE_ASSIGNMENT_FORBIDDEN`.
   * @see docs/codigo/usuarios.md#alta-de-usuario
   */
  createUser(request: CreateUserRequest): Observable<NewUserResult> {
    return this.http
      .post<NewUserResponseDto>(`${this.apiUrl}/users`, request)
      .pipe(map((res) => ({ ...res, roles: res.roles as RoleId[] })));
  }

  /** `GET /users`: una página, filtrada y paginada en el servidor. */
  listUsers(params: UserListParams = {}): Observable<UserListPage> {
    let httpParams = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? USERS_PAGE_SIZE));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.role) httpParams = httpParams.set('role', params.role);
    if (params.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<UserListPage>(`${this.apiUrl}/users`, { params: httpParams });
  }

  /**
   * Todas las cuentas de `GET /users`, recorriendo las páginas en serie y sin duplicados.
   *
   * @remarks El backend pagina sin orden estable; si faltan cuentas, se repite con una sola página de `totalElements`.
   * @see docs/codigo/usuarios.md#paginacion-users
   */
  listAllUsers(filters: Omit<UserListParams, 'page' | 'size'> = {}, size = USERS_PAGE_SIZE): Observable<UserSummaryDto[]> {
    const fetchPage = (page: number) => this.listUsers({ ...filters, page, size });
    return fetchPage(0).pipe(
      expand((res) => (res.page + 1 < res.totalPages ? fetchPage(res.page + 1) : EMPTY)),
      reduce(
        (acc, res) => {
          res.content.forEach((u) => acc.byId.set(u.id, u));
          return { byId: acc.byId, total: res.totalElements };
        },
        { byId: new Map<number, UserSummaryDto>(), total: 0 },
      ),
      switchMap(({ byId, total }) =>
        byId.size >= total
          ? of([...byId.values()])
          : this.listUsers({ ...filters, page: 0, size: total }).pipe(map((res) => res.content)),
      ),
    );
  }

  /**
   * `PATCH /users/{id}` (CU3 paso 3).
   *
   * @returns Observable con `UserSummaryDto`, que no repite los campos enviados; falla con 400 `INVALID_LOCATION`/`INVALID_CATALOG_ITEM`.
   * @see docs/codigo/usuarios.md#edicion-de-perfil
   */
  updateUser(backendUserId: number, request: UpdateUserRequest): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}`, request);
  }

  /**
   * `PATCH /users/{id}/status` (CU3 paso 4); envía `status` en minúsculas, igual que {@link UserStatus}.
   *
   * @returns Observable con `UserSummaryDto`, cuyo `status` llega en mayúsculas (ver `backendStatusToLocal`).
   */
  changeStatus(backendUserId: number, status: UserStatus): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}/status`, { status });
  }

  /** `POST /users/{id}/verify-email` (CU3 paso 6): el backend marca el correo sin validar token. */
  verifyEmail(backendUserId: number): Observable<EmailVerificationResponse> {
    return this.http.post<EmailVerificationResponse>(`${this.apiUrl}/users/${backendUserId}/verify-email`, {});
  }

  /**
   * `PATCH /users/{id}/roles`, exige `manage_roles` también para cambiar solo permisos.
   *
   * @returns Observable con `UserSummaryDto`; falla con 400 `INVALID_ROLE`/`INVALID_PERMISSION`, 403 `ROLE_ASSIGNMENT_FORBIDDEN` o 404 `USER_NOT_FOUND`.
   * @see docs/codigo/usuarios.md#roles-asignados
   */
  updateUserRoles(backendUserId: number, request: UpdateUserRolesRequest): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}/roles`, request);
  }

  /**
   * `POST /users/{id}/close-sessions`: revoca los refresh tokens vigentes.
   *
   * @returns Observable con `{ id, activeSessions: 0 }`; falla con 404 `USER_NOT_FOUND`.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  closeUserSessions(backendUserId: number): Observable<CloseSessionsResponse> {
    return this.http.post<CloseSessionsResponse>(`${this.apiUrl}/users/${backendUserId}/close-sessions`, {});
  }

  /**
   * `POST /users/{id}/reset-password`.
   *
   * @returns Observable con la nueva contraseña temporal; falla con 404 `USER_NOT_FOUND`.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  resetUserPassword(backendUserId: number): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.apiUrl}/users/${backendUserId}/reset-password`, {});
  }

  /**
   * `DELETE /users/{id}`: baja lógica.
   *
   * @returns Observable que falla con 409 `CANNOT_DELETE_SELF` o 404 `USER_NOT_FOUND`.
   * @see docs/codigo/usuarios.md#acciones-administrativas
   */
  deleteUser(backendUserId: number): Observable<DeleteUserResponse> {
    return this.http.delete<DeleteUserResponse>(`${this.apiUrl}/users/${backendUserId}`);
  }
}
