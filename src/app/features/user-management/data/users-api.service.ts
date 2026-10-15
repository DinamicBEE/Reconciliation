import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, of, reduce, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { UserSummaryDto } from '../../../core/auth/auth.service';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { RoleId, UserStatus } from './user-management.model';

// Tamaño de página con el que se recorre `GET /users` (el backend usa 20 por
// defecto; el front mantiene 100 por petición, ver `listAllUsers`).
const USERS_PAGE_SIZE = 100;

export interface AddressInfo {
  city: string | null;
  state: string | null;
  postalCode: string | null;
  street1: string | null;
  street2: string | null;
  interiorNumber: string | null;
  exteriorNumber: string | null;
}

export interface ManagerSummary {
  id: number;
  displayName: string;
}

// `GET /users/{id}` — detalle COMPLETO (a diferencia de `UserSummaryDto`,
// ningún dato relacional sale como id suelto: el manager llega resuelto a
// su nombre, igual que subsidiarias/ubicaciones). `UserDetail` lo usa para
// precargar TODA la pantalla de una cuenta con `backendUserId`, no solo
// `temporaryPassword` como antes (ver MASTER.md, "Actualización: endpoints
// de administración de usuarios (CRUD real)...").
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
  // Solo viene poblada mientras `mustChangePassword` sea true — ver
  // UserDetailDto.java (el backend la recalcula al vuelo, nunca la guarda
  // en texto plano).
  temporaryPassword: string | null;
  // Contadores de seguridad (Guía_Endpoints, `GET /users/{id}`): intentos
  // fallidos de login, sesiones activas (refresh tokens sin revocar ni vencer) y
  // fin del bloqueo temporal (`null` si no está bloqueada o el bloqueo es manual).
  failedLoginAttempts: number;
  activeSessions: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  emailVerified: boolean;
  createdAt: string;
  birthDate: string | null;
  ssn: string | null;
  gender: string | null;
  address: AddressInfo;
  // Organización asignada (Core, `GET /catalogs/...`): listas `{ id, nombre }`
  // con los mismos ids que los combos; `[]` si no tiene ninguno. Reemplazan a
  // los antiguos `department`/`area`/`jobTitle` de texto libre, que el backend
  // ya no devuelve (Guia_Integracion_Frontend §5.2).
  cargos: CatalogEntry[];
  puestos: CatalogEntry[];
  departamentos: CatalogEntry[];
  areas: CatalogEntry[];
  manager: ManagerSummary | null;
  employeeCode: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
}

// `POST /users` — alta de usuario (CU3 pasos 1-2). `roleIds` solo se
// respeta si la sesión que da de alta tiene el permiso `manage_roles`
// (el backend lo valida server-side vía el claim `permissions` del JWT,
// no por rol — ver CreateUserRequest.java); si no alcanza, responde 403
// `ROLE_ASSIGNMENT_FORBIDDEN` (ver `auth-errors.ts`).
export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  supervisorId: number | null;
  subsidiariaIds: number[];
  ubicacionIds: number[];
  roleIds: RoleId[];
  // Solo 'ACTIVE'/'INACTIVE' — LOCKED lo rechaza el backend (ese estado
  // solo lo genera el sistema por intentos fallidos, nunca un alta manual).
  status: 'ACTIVE' | 'INACTIVE' | null;
}

// Forma cruda de la respuesta de `POST /users` (roles como `string[]`, sin
// castear) — `createUser()` la mapea a `NewUserResult` abajo.
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

// Respuesta de `POST /users` — separada de `UserSummaryDto` a propósito
// (igual que en el backend): `temporaryPassword` solo debe verse UNA vez,
// justo al crear.
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

// `PATCH /users/{id}` — edición administrativa de información personal +
// organización. NO incluye `status` (`PATCH /users/{id}/status`) ni roles/
// permisos (`PATCH /users/{id}/roles`). Todo campo es opcional/nullable del
// lado del backend (solo sobreescribe lo que llega no-null — un `null`
// explícito NO borra un campo de texto), pero este frontend siempre manda el
// formulario completo.
// `subsidiariaIds`/`ubicacionIds` (DEV, Guía_Endpoints): una lista REEMPLAZA
// la actual, una lista vacía las quita todas y omitirla (`undefined`) no toca
// nada. Un id inexistente rechaza TODA la actualización con 400
// `INVALID_LOCATION`. Misma regla para `cargoIds`/`puestoIds`/`departamentoIds`/
// `areaIds` (ids de `GET /catalogs/...`), con 400 `INVALID_CATALOG_ITEM`. El
// backend ya no acepta `department`/`area`/`jobTitle`: si llegan, los ignora en
// silencio.
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

// `POST /users/{id}/verify-email` — el backend fuerza `emailVerified=true`
// sin validar ningún token pendiente (ver UserAdminService.verifyEmail
// real).
export interface EmailVerificationResponse {
  id: number;
  emailVerified: boolean;
}

// `PATCH /users/{id}/roles` — los dos campos son opcionales: omitido = no tocar;
// una lista reemplaza la actual por completo. El endpoint exige `manage_roles` en
// quien lo ejecuta (403 `ROLE_ASSIGNMENT_FORBIDDEN` si falta) — también para un
// cambio solo de permisos (probado contra DEV; la guía solo lo dice de los roles). Los permisos
// son independientes del rol: el front calcula los defaults al cambiar de rol
// (`AccessCatalogService.defaultPermissionsForRoles`) y envía el resultado final.
export interface UpdateUserRolesRequest {
  roleIds?: string[];
  permissions?: string[];
}

// `POST /users/{id}/reset-password` — devuelve al usuario a su contraseña
// temporal (NOMBRE + PRIMER APELLIDO + año de alta), marca `mustChangePassword`
// y revoca todas sus sesiones. El sistema no envía correos: el administrador
// debe comunicársela.
export interface ResetPasswordResponse {
  id: number;
  temporaryPassword: string;
}

// `DELETE /users/{id}` — baja lógica (`enabled = false`): conserva la fila y su
// bitácora, libera el correo. 404 `USER_NOT_FOUND`, 409 `CANNOT_DELETE_SELF`.
export interface DeleteUserResponse {
  success: boolean;
  id: number;
}

// `POST /users/{id}/close-sessions`
export interface CloseSessionsResponse {
  id: number;
  activeSessions: number;
}

export interface UserListParams {
  search?: string;
  role?: RoleId;
  status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  page?: number;
  size?: number;
}

export interface UserListPage {
  content: UserSummaryDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Cliente HTTP de administración de usuarios (`/users/**`). Antes vivía dentro
 * de `AuthService`; se separó para que la sesión no cargue con el CRUD de
 * usuarios (ADR-0001, punto 4). Lo consumen `UserManagementService` y
 * `UserDetail`; los errores de negocio los avisa `httpErrorAlertInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // CU3 paso 5: desbloquea una cuenta bloqueada por intentos fallidos
  // (`PATCH /users/{id}/unlock`, ver UserAdminController/UserAdminService en
  // el auth-service real). Requiere sesión activa con el PERMISO
  // `manage_users` — el backend responde 403 si falta, 401 si el token no es
  // válido; el llamador (`UserDetail`) traduce el error a la UI. `id` es el
  // id NUMÉRICO del `app_user` real (`AppUser.backendUserId` en el mock de
  // `user-management` — no el id 'uXXXX' del mock).
  unlockUser(backendUserId: number): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}/unlock`, {});
  }

  // Detalle COMPLETO de un usuario del backend real (`GET /users/{id}`) —
  // precarga toda la pantalla de `UserDetail` para una cuenta con
  // `backendUserId` (información personal, organización, cuenta,
  // `temporaryPassword`). `id` es el id NUMÉRICO del `app_user` real
  // (`AppUser.backendUserId`), no el id 'uXXXX' del mock.
  getUserDetail(backendUserId: number): Observable<UserDetailDto> {
    return this.http.get<UserDetailDto>(`${this.apiUrl}/users/${backendUserId}`);
  }

  // CU3 pasos 1-2: alta de usuario (`POST /users`) — devuelve la contraseña
  // temporal UNA sola vez, ver `NewUserResult`. 409 `EMAIL_ALREADY_REGISTERED`,
  // 400 `INVALID_ROLE`/`INVALID_USER_STATUS`, 403 `ROLE_ASSIGNMENT_FORBIDDEN`
  // llegan como error del Observable (ver `auth-errors.ts`) — el llamador
  // (`UserManagementService.createUser`) no necesita traducirlos a mano: el
  // `httpErrorAlertInterceptor` ya muestra la alerta correspondiente.
  createUser(request: CreateUserRequest): Observable<NewUserResult> {
    return this.http
      .post<NewUserResponseDto>(`${this.apiUrl}/users`, request)
      .pipe(map((res) => ({ ...res, roles: res.roles as RoleId[] })));
  }

  // Pantalla "Administración de usuarios" (`GET /users`, paginado/filtrado
  // en el SERVIDOR) — `UserManagementService.syncFromBackend()` la usa para
  // reconciliar el mock local con el estado real (roles/permisos/estado/
  // último acceso) de cada cuenta con `backendUserId`, y para detectar
  // cuentas reales que este mock todavía no conoce.
  listUsers(params: UserListParams = {}): Observable<UserListPage> {
    let httpParams = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? USERS_PAGE_SIZE));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.role) httpParams = httpParams.set('role', params.role);
    if (params.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<UserListPage>(`${this.apiUrl}/users`, { params: httpParams });
  }

  // Todas las cuentas, recorriendo las páginas de `GET /users` (el backend
  // pagina con `page` desde 0; el tamaño por defecto allá es 20). Pide de a
  // `size` (100) y sigue pidiendo mientras `totalPages` indique más — así la
  // lista no se trunca el día que haya más de 100 usuarios. Las páginas se
  // piden en serie (la siguiente depende del `totalPages` de la anterior).
  //
  // OJO — el backend (DEV) hace `PageRequest.of(page, size)` SIN `Sort` y con
  // `DISTINCT`: el orden de las filas no está garantizado entre peticiones, así
  // que recorrer varias páginas puede repetir cuentas y omitir otras (probado:
  // páginas de 10 sobre 27 cuentas devolvieron 21 distintas). Por eso las
  // páginas se juntan por `id` (sin duplicados) y, si al final faltan cuentas
  // respecto de `totalElements`, se pide UNA sola página de ese tamaño — un
  // solo `SELECT` es una instantánea consistente. Con ≤ 100 cuentas (una
  // página) nunca se llega a ese respaldo.
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

  // CU3 paso 3: edición administrativa (`PATCH /users/{id}`) — devuelve
  // `UserSummaryDto`, NO el detalle completo: no repite los campos que se
  // acaban de mandar (nombre, dirección, organización...), solo el estado
  // compartido con el resto de `/users` (roles, permisos, estado,
  // subsidiarias/ubicaciones SIN CAMBIOS — este endpoint no las toca,
  // mustChangePassword, emailVerified). El llamador
  // (`UserManagementService.updateUserProfile`) combina ambas fuentes.
  updateUser(backendUserId: number, request: UpdateUserRequest): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}`, request);
  }

  // CU3 paso 4: cambio de estado (`PATCH /users/{id}/status`) — `status` va
  // en minúsculas tal cual lo espera `ChangeStatusRequest` ('active' |
  // 'inactive' | 'blocked', el backend normaliza y valida — ver
  // ChangeStatusRequest.java); coincide 1:1 con `UserStatus` de este
  // frontend, sin traducir. Distinto de `UserSummaryDto.status` en la
  // RESPUESTA, que llega en mayúsculas (nombre del enum, p. ej. 'LOCKED')
  // — ver `backendStatusToLocal`.
  changeStatus(backendUserId: number, status: UserStatus): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}/status`, { status });
  }

  // CU3 paso 6: verificación manual de correo (`POST /users/{id}/verify-email`)
  // — el backend fuerza `emailVerified=true` sin validar ningún token
  // pendiente (ver EmailVerificationResponse).
  verifyEmail(backendUserId: number): Observable<EmailVerificationResponse> {
    return this.http.post<EmailVerificationResponse>(`${this.apiUrl}/users/${backendUserId}/verify-email`, {});
  }

  // `PATCH /users/{id}/roles` — guarda roles y/o permisos de una persona (ver
  // `UpdateUserRolesRequest`). Responde `UserSummaryDto` con los roles y
  // permisos nuevos. 400 `INVALID_ROLE`/`INVALID_PERMISSION`, 403
  // `ROLE_ASSIGNMENT_FORBIDDEN`, 404 `USER_NOT_FOUND`.
  updateUserRoles(backendUserId: number, request: UpdateUserRolesRequest): Observable<UserSummaryDto> {
    return this.http.patch<UserSummaryDto>(`${this.apiUrl}/users/${backendUserId}/roles`, request);
  }

  // `POST /users/{id}/close-sessions` — revoca todos los refresh tokens vigentes
  // de la persona (puede volver a entrar; el access token ya emitido vive hasta
  // 15 min). Responde `{ id, activeSessions: 0 }`. 404 `USER_NOT_FOUND`.
  closeUserSessions(backendUserId: number): Observable<CloseSessionsResponse> {
    return this.http.post<CloseSessionsResponse>(`${this.apiUrl}/users/${backendUserId}/close-sessions`, {});
  }

  // `POST /users/{id}/reset-password` — ver `ResetPasswordResponse`. 404 `USER_NOT_FOUND`.
  resetUserPassword(backendUserId: number): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.apiUrl}/users/${backendUserId}/reset-password`, {});
  }

  // `DELETE /users/{id}` — ver `DeleteUserResponse`. Un administrador no puede darse
  // de baja a sí mismo (409 `CANNOT_DELETE_SELF`).
  deleteUser(backendUserId: number): Observable<DeleteUserResponse> {
    return this.http.delete<DeleteUserResponse>(`${this.apiUrl}/users/${backendUserId}`);
  }
}
