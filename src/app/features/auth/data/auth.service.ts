import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EMPTY, Observable, catchError, defer, delay, expand, map, of, reduce, switchMap, throwError } from 'rxjs';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { PermissionKey, RoleId, UserStatus } from '../../user-management/data/user-management.model';
import { AuthMockBackend } from './auth-mock-backend';
import { INVALID_CREDENTIALS_CODE, SessionEndReason, extractErrorCode, isSessionIdleTimeout } from './auth-errors';
import { notifyBackendError } from './mock-http-error-alert';
import { clearMockSessionActivity, touchMockSessionActivity } from './mock-session-activity';

const STORAGE_KEY = 'conciliation-auth';

// Tamaño de página con el que se recorre `GET /users` (el backend usa 20 por
// defecto; el front mantiene 100 por petición, ver `listAllUsers`).
const USERS_PAGE_SIZE = 100;

export interface AuthUser {
  username: string;
  displayName: string;
  // Id del registro en `user-management` (`AppUser.id`) que representa a
  // esta misma persona — ver `UserManagementService.findUserByEmail`, que lo
  // resuelve por email tras un login exitoso (`Login.onSubmit`). `null`
  // cuando no hay match: no existe todavía un backend de administración de
  // usuarios que comparta el mismo registro que el auth-service real, así
  // que solo las cuentas de demo (mismo email que las sembradas ahí) quedan
  // vinculadas — el resto se autentica igual, pero Header/Perfil no tienen
  // de dónde leer foto/organización (ver AccessControlService.currentAppUser).
  appUserId: string | null;
  // Códigos de rol TAL CUAL los devolvió el backend (`UserSummaryDto.roles`,
  // p. ej. `['ADMIN']`) — NO los ids inventados por este frontend (ver
  // MASTER.md, "Actualización: unificación de roles con el backend real"). El
  // nombre de cada rol sale de `GET /roles` (`AccessCatalogService.roleLabel`).
  // Vacío si el backend no asignó ningún rol.
  roles: RoleId[];
  // `UserSummaryDto.permissions` TAL CUAL los devolvió el backend — fuente de
  // verdad ÚNICA para `AccessControlService.permissions` (antes se ignoraba
  // este arreglo y se recalculaba siempre desde `roles`, ver MASTER.md
  // "Actualización: matriz de roles y permisos (7.16) completa"). Vacío = la
  // persona no tiene ningún permiso.
  permissions: PermissionKey[];
  // Copia de `UserSummaryDto.mustChangePassword` tal como la devolvió el
  // login — fuente de verdad además de/ante la del `AppUser` vinculado (ver
  // AccessControlService.mustChangePassword): el backend real ya la sabe
  // aunque el email no tenga match en `user-management`.
  mustChangePasswordHint: boolean;
  // Subsidiarias/ubicaciones a las que ESTA cuenta tiene acceso, tal cual
  // las devolvió el login (`UserSummaryDto.subsidiarias`/`.ubicaciones`) —
  // fuente de los catálogos reales que consume `CatalogService`
  // (`core/services/catalog.service.ts`). Vacías si el backend no le
  // asignó ninguna.
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
}

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
}

// DTOs del contrato real — ver auth-service (AuthController + web/dto/*),
// también documentado en docs/api-endpoints.csv ("Login"). Forma actualizada
// tras el pull de coctel_midd feature/login (commits "add feature login
// users lists"/"add close session feature..."): `UserSummaryDto` ahora
// también trae `phone`/`status`/`lastLoginAt`/`emailVerified` (antes solo
// tenía id/email/displayName/roles/permissions/subsidiarias/ubicaciones/
// mustChangePassword) — este mismo DTO lo devuelven además `/auth/login`,
// `/auth/me` y los nuevos endpoints de `/users` (list/create/update/status).
// `permissions` YA NO llega vacío: el backend sembró el mismo catálogo de 9
// permisos y su asignación por rol documentados en
// docs/permisos-frontend-conciliacion-bancaria.pdf — ver MASTER.md.
export interface UserSummaryDto {
  id: number;
  email: string;
  displayName: string;
  phone: string | null;
  status: string;
  roles: string[];
  permissions: string[];
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  emailVerified: boolean;
}

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
  department: string | null;
  area: string | null;
  jobTitle: string | null;
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
// `INVALID_LOCATION`.
export interface UpdateUserRequest {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  ssn: string | null;
  gender: string | null;
  address: AddressInfo | null;
  department: string | null;
  area: string | null;
  jobTitle: string | null;
  managerId: number | null;
  employeeCode: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
  subsidiariaIds?: number[];
  ubicacionIds?: number[];
}

// `POST /users/{id}/verify-email` — el backend fuerza `emailVerified=true`
// sin validar ningún token pendiente (ver UserAdminService.verifyEmail
// real).
export interface EmailVerificationResponse {
  id: number;
  emailVerified: boolean;
}

// `GET /roles` — catálogo de roles con los permisos que traen por defecto
// (solo lectura: se cargan por migración). Exige `manage_users` o `manage_roles`.
export interface RoleDto {
  code: string;
  name: string;
  defaultPermissions: string[];
}

// `GET /permissions` — catálogo de permisos; `module` es el título del grupo en
// la pantalla "Seguridad y acceso". Exige `manage_users` o `manage_roles`.
export interface PermissionDto {
  code: string;
  description: string;
  module: string;
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

// Bitácora (`GET /audit-log`, `GET /users/{id}/audit-log`) — exigen
// `view_audit_log` (independiente de `manage_users`). `actor` es `null` cuando lo
// hizo el sistema (bloqueo/desbloqueo automático). Siempre de la más reciente a
// la más antigua.
export interface AuditPersonDto {
  id: number;
  displayName: string;
}

export interface AuditLogEntryDto {
  id: number;
  actor: AuditPersonDto | null;
  target: AuditPersonDto;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  content: AuditLogEntryDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AuditLogParams {
  // Solo `GET /audit-log` (el de un usuario ya lo lleva en la ruta).
  userId?: number;
  action?: string;
  // Texto libre: detalle y nombre o correo de quien actuó o sobre quien se actuó.
  search?: string;
  page?: number;
  size?: number;
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

interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos
  user: UserSummaryDto;
}

interface TokenPairResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Resultado de un login exitoso, ya mapeado — separado de `AuthUser`/
// `AuthSession` porque todavía le falta el `appUserId` (ver `completeLogin`,
// resuelto por el llamador vía `UserManagementService.findUserByEmail` —
// `AuthService` no puede depender de ese servicio, sería una dependencia
// circular: `UserManagementService` ya depende de `AuthService` para
// `actorName` en auditoría).
export interface LoginResult {
  email: string;
  displayName: string;
  roles: RoleId[];
  permissions: PermissionKey[];
  mustChangePassword: boolean;
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**

/**
 * Sesión + autenticación — en ESTA rama contra un backend SIMULADO en memoria
 * (`AuthMockBackend`, data local; sin HttpClient ni red). La API pública
 * (métodos, Observables, DTOs y errores `HttpErrorResponse` con `{ error, code }`)
 * es IDÉNTICA a la de la rama de integración
 * (`feature/login-coctel-del-mar-integration`), donde cada método es una
 * llamada HTTP al Gateway: así login, cambio de contraseña, administración de
 * usuarios, roles/permisos y bitácora son el mismo código en ambas ramas.
 * `providedIn: 'root'` porque el guard de rutas y la pantalla de login lo
 * necesitan fuera del árbol de `Shell`.
 *
 * Lo que en la integración hacen los interceptores HTTP vive aquí, en
 * `request()`: el Bearer (el accessToken vigente se le pasa al mock), el 401
 * que invalida la sesión (`authTokenInterceptor`) y la alerta genérica de
 * errores de negocio (`notifyBackendError`, port de `httpErrorAlertInterceptor`).
 *
 * Contrato de refreshToken (dado por el backend): al usarlo para pedir un
 * accessToken nuevo, el backend manda TAMBIÉN un refreshToken nuevo, y el
 * anterior queda invalidado de inmediato (un solo uso, rotación) — ver
 * `refreshAccessToken()`, MASTER.md "Patrón: refresh token de un solo uso +
 * cambio obligatorio de contraseña".
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly backend = new AuthMockBackend();
  private readonly session = signal<AuthSession | null>(this.resolveInitialSession());
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityWriteAt = 0;

  // Por qué se cerró la última sesión SIN que el usuario lo pidiera —
  // inactividad (`idle_timeout`) o token rechazado (`invalid_token`). Lo leen
  // `App` (redirige a /login) y `Login` (muestra el aviso); se limpia al
  // iniciar sesión de nuevo o con logout manual.
  private readonly endReason = signal<SessionEndReason | null>(null);
  readonly sessionEndReason = this.endReason.asReadonly();

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly currentUser = computed<AuthUser | null>(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  constructor() {
    // Sesión retomada de sessionStorage (recarga de página): continúa el ciclo
    // de refresco y revalida contra el backend (`GET /auth/me`). Si el
    // accessToken guardado ya venció, primero se renueva (refresh + me).
    const initial = this.session();
    if (initial) {
      if (initial.accessTokenExpiresAt - REFRESH_MARGIN_MS <= Date.now()) {
        this.renewSession().subscribe();
      } else {
        this.scheduleRefresh(initial.accessTokenExpiresAt);
        this.validateResumedSession();
      }
    }

    // Solo para el mock: registra la actividad del usuario que en el backend
    // real contarían sus propias peticiones (ver mock-session-activity.ts) —
    // base de la expiración por inactividad (`SESSION_IDLE_TIMEOUT`).
    for (const type of ACTIVITY_EVENTS) {
      this.document.addEventListener(type, this.onUserActivity, { capture: true, passive: true });
    }
  }

  private validateResumedSession(): void {
    this.me().subscribe({
      next: (me) => this.applyMe(me),
      error: () => {},
    });
  }

  // Refresca la sesión con los datos actuales del backend (roles, permisos,
  // catálogos, contraseña pendiente).
  private applyMe(me: UserSummaryDto): void {
    const current = this.session();
    if (!current) return;
    this.session.set({
      ...current,
      user: {
        ...current.user,
        displayName: me.displayName,
        roles: me.roles as RoleId[],
        permissions: me.permissions as PermissionKey[],
        mustChangePasswordHint: me.mustChangePassword,
        subsidiarias: me.subsidiarias,
        ubicaciones: me.ubicaciones,
      },
    });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session()));
  }

  // Renueva YA el par de tokens y relee `GET /auth/me` — p. ej. tras cambiar
  // los roles/permisos de la propia cuenta (`UserManagementService.changeRoles`).
  renewSession(): Observable<void> {
    const current = this.session();
    if (!current) return of(undefined);
    this.clearRefreshTimer();
    return this.requestTokenPair(current.refreshToken).pipe(
      switchMap((pair) => {
        this.setSession({
          user: current.user,
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          accessTokenExpiresAt: Date.now() + pair.expiresIn * 1000,
        });
        return this.me();
      }),
      map((me) => this.applyMe(me)),
      catchError((err: unknown) => {
        this.invalidateSession(isSessionIdleTimeout(err) ? 'idle_timeout' : 'invalid_token');
        return of(undefined);
      }),
    );
  }

  // POST /auth/login
  login(username: string, password: string): Observable<LoginResult> {
    return this.request(() => this.backend.login(username, password), { public: true }).pipe(
      map((res) => ({
        email: res.user.email,
        displayName: res.user.displayName,
        roles: res.user.roles as RoleId[],
        permissions: res.user.permissions as PermissionKey[],
        mustChangePassword: res.user.mustChangePassword,
        subsidiarias: res.user.subsidiarias,
        ubicaciones: res.user.ubicaciones,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
      })),
    );
  }

  completeLogin(result: LoginResult, appUserId: string | null): void {
    this.endReason.set(null);
    touchMockSessionActivity();
    const user: AuthUser = {
      username: result.email,
      displayName: result.displayName,
      appUserId,
      roles: result.roles,
      permissions: result.permissions,
      mustChangePasswordHint: result.mustChangePassword,
      subsidiarias: result.subsidiarias,
      ubicaciones: result.ubicaciones,
    };
    this.setSession({
      user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: Date.now() + result.expiresIn * 1000,
    });
  }

  // Logout pedido por el usuario — no deja ningún aviso pendiente. Revoca el
  // refresh token en el backend (best-effort, igual que la integración).
  logout(): void {
    const current = this.session();
    this.endReason.set(null);
    this.clearSession();
    if (current) {
      this.request(() => this.backend.logout(current.refreshToken), { public: true, silent: true }).subscribe({
        error: () => {},
      });
    }
  }

  // POST /auth/change-password + rotación del refresh token (el backend apaga
  // `mustChangePassword`; la sesión se renueva para reflejarlo).
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.request((token) => this.backend.changePassword(token, currentPassword, newPassword)).pipe(
      switchMap(() => this.rotateSessionAfterPasswordChange()),
    );
  }

  private rotateSessionAfterPasswordChange(): Observable<void> {
    const current = this.session();
    if (!current) {
      return of(undefined);
    }
    this.clearRefreshTimer();
    return this.requestTokenPair(current.refreshToken).pipe(
      map((pair) => {
        this.setSession({
          user: { ...current.user, mustChangePasswordHint: false },
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          accessTokenExpiresAt: Date.now() + pair.expiresIn * 1000,
        });
      }),
      catchError((err: unknown) => {
        this.invalidateSession(isSessionIdleTimeout(err) ? 'idle_timeout' : 'invalid_token');
        return of(undefined);
      }),
    );
  }

  // POST /auth/refresh
  private requestTokenPair(refreshToken: string): Observable<TokenPairResponseDto> {
    return this.request(() => this.backend.refresh(refreshToken), { public: true });
  }

  // Marca la sesión como "debe cambiar contraseña" (403
  // PASSWORD_CHANGE_REQUIRED, ver `notifyBackendError`).
  markPasswordChangeRequired(): void {
    const latest = this.session();
    if (!latest || latest.user.mustChangePasswordHint) return;
    this.session.set({ ...latest, user: { ...latest.user, mustChangePasswordHint: true } });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session()));
  }

  // PATCH /users/{id}/unlock
  unlockUser(backendUserId: number): Observable<UserSummaryDto> {
    return this.request((token) => this.backend.unlockUser(token, backendUserId));
  }

  // Cierre NO pedido por el usuario — igual de completo que `logout()`, pero
  // deja registrado el motivo para avisarle.
  invalidateSession(reason: SessionEndReason): void {
    this.clearSession();
    this.endReason.set(reason);
  }

  private clearSession(): void {
    this.clearRefreshTimer();
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
    clearMockSessionActivity();
  }

  // GET /users/{id}
  getUserDetail(backendUserId: number): Observable<UserDetailDto> {
    return this.request((token) => this.backend.getUser(token, backendUserId));
  }

  // POST /users — la contraseña temporal la genera el backend.
  createUser(request: CreateUserRequest): Observable<NewUserResult> {
    return this.request((token): NewUserResponseDto => this.backend.createUser(token, request)).pipe(
      map((res) => ({ ...res, roles: res.roles as RoleId[] })),
    );
  }

  // GET /users (paginado)
  listUsers(params: UserListParams = {}): Observable<UserListPage> {
    return this.request((token) =>
      this.backend.listUsers(token, { ...params, page: params.page ?? 0, size: params.size ?? USERS_PAGE_SIZE }),
    );
  }

  // Recorre TODAS las páginas de `GET /users` (mismo algoritmo que la
  // integración).
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

  // PATCH /users/{id}
  updateUser(backendUserId: number, request: UpdateUserRequest): Observable<UserSummaryDto> {
    return this.request((token) => this.backend.updateUser(token, backendUserId, request));
  }

  // PATCH /users/{id}/status — `status` en minúsculas (active/inactive/blocked).
  changeStatus(backendUserId: number, status: UserStatus): Observable<UserSummaryDto> {
    return this.request((token) => this.backend.changeStatus(token, backendUserId, status));
  }

  // POST /users/{id}/verify-email
  verifyEmail(backendUserId: number): Observable<EmailVerificationResponse> {
    return this.request((token) => this.backend.verifyEmail(token, backendUserId));
  }

  // GET /roles
  listRoles(): Observable<RoleDto[]> {
    return this.request((token) => this.backend.listRoles(token));
  }

  // GET /permissions
  listPermissions(): Observable<PermissionDto[]> {
    return this.request((token) => this.backend.listPermissions(token));
  }

  // PATCH /users/{id}/roles
  updateUserRoles(backendUserId: number, request: UpdateUserRolesRequest): Observable<UserSummaryDto> {
    return this.request((token) => this.backend.updateUserRoles(token, backendUserId, request));
  }

  // POST /users/{id}/close-sessions
  closeUserSessions(backendUserId: number): Observable<CloseSessionsResponse> {
    return this.request((token) => this.backend.closeSessions(token, backendUserId));
  }

  // POST /users/{id}/reset-password
  resetUserPassword(backendUserId: number): Observable<ResetPasswordResponse> {
    return this.request((token) => this.backend.resetPassword(token, backendUserId));
  }

  // DELETE /users/{id} — baja lógica.
  deleteUser(backendUserId: number): Observable<DeleteUserResponse> {
    return this.request((token) => this.backend.deleteUser(token, backendUserId));
  }

  // GET /audit-log
  listAuditLog(params: AuditLogParams = {}): Observable<AuditLogPage> {
    return this.request((token) => this.backend.listAuditLog(token, params));
  }

  // GET /users/{id}/audit-log
  listUserAuditLog(backendUserId: number, params: Omit<AuditLogParams, 'userId'> = {}): Observable<AuditLogPage> {
    return this.request((token) => this.backend.listAuditLog(token, { ...params, userId: backendUserId }));
  }

  // GET /auth/me
  me(): Observable<UserSummaryDto> {
    return this.request((token) => this.backend.me(token));
  }

  // "Petición" al backend simulado: latencia de red + el comportamiento de los
  // interceptores de la integración. `public` = endpoint sin Bearer
  // (login/refresh/logout); `silent` = sin alerta genérica.
  private request<T>(handler: (accessToken: string | null) => T, opts: { public?: boolean; silent?: boolean } = {}): Observable<T> {
    return defer(() => of(null)).pipe(
      delay(MOCK_LATENCY_MS),
      map(() => handler(opts.public ? null : this.accessToken())),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse) {
          // = authTokenInterceptor: un 401 en una llamada autenticada invalida
          // la sesión (salvo contraseña actual incorrecta).
          if (!opts.public && err.status === 401 && extractErrorCode(err) !== INVALID_CREDENTIALS_CODE) {
            this.invalidateSession(isSessionIdleTimeout(err) ? 'idle_timeout' : 'invalid_token');
          }
          // = httpErrorAlertInterceptor
          if (!opts.silent) {
            notifyBackendError(err, { auth: this, message: this.message, router: this.router });
          }
        }
        return throwError(() => err);
      }),
    );
  }

  private readonly onUserActivity = (): void => {
    if (!this.session()) return;
    const now = Date.now();
    if (now - this.lastActivityWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return;
    this.lastActivityWriteAt = now;
    touchMockSessionActivity(now);
  };

  private setSession(session: AuthSession): void {
    this.session.set(session);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.scheduleRefresh(session.accessTokenExpiresAt);
  }

  private scheduleRefresh(expiresAt: number): void {
    this.clearRefreshTimer();
    const delayMs = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 0);
    this.refreshTimer = setTimeout(() => {
      // Lee la sesión FRESCA al disparar (no la capturada al programar).
      const current = this.session();
      if (current) {
        this.refreshAccessToken(current.refreshToken);
      }
    }, delayMs);
  }

  // Rota el accessToken/refreshToken. Si el refreshToken presentado no es el
  // vigente, es un intento de reusar uno ya invalidado → cierre de sesión.
  // Inactividad (acuerdo con backend): el refresh responde 401 con `code:
  // SESSION_IDLE_TIMEOUT` → se cierra la sesión con ese motivo para que
  // `App` redirija a /login y `Login` muestre el aviso. Cualquier otro
  // rechazo también cierra sesión, sin ese aviso.
  private refreshAccessToken(presentedRefreshToken: string): void {
    const current = this.session();
    if (!current) {
      return;
    }
    if (presentedRefreshToken !== current.refreshToken) {
      this.logout();
      return;
    }
    this.requestTokenPair(presentedRefreshToken).subscribe({
      next: (pair) => {
        this.setSession({
          user: current.user,
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          accessTokenExpiresAt: Date.now() + pair.expiresIn * 1000,
        });
      },
      error: (err: unknown) => {
        if (isSessionIdleTimeout(err)) {
          this.invalidateSession('idle_timeout');
          return;
        }
        this.logout();
      },
    });
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Persiste solo en sessionStorage (no localStorage): la sesión no debe
  // sobrevivir a cerrar el navegador por completo.
  private resolveInitialSession(): AuthSession | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      // Forma antigua o payload corrupto → de vuelta a login.
      if (
        !parsed.user ||
        parsed.user.mustChangePasswordHint === undefined ||
        !parsed.user.roles ||
        !parsed.user.permissions ||
        !parsed.user.subsidiarias ||
        !parsed.user.ubicaciones ||
        !parsed.accessToken ||
        !parsed.refreshToken ||
        !parsed.accessTokenExpiresAt
      ) {
        return null;
      }
      return parsed as AuthSession;
    } catch {
      return null;
    }
  }
}

// Renovación 30 s antes de que venza el accessToken (mismo margen que la
// integración).
const REFRESH_MARGIN_MS = 30_000;
// Latencia simulada de cada "petición" al backend mock.
const MOCK_LATENCY_MS = 250;
// Cada cuánto, como mucho, una interacción del usuario se registra como
// actividad de la sesión (ver `onUserActivity`).
const ACTIVITY_WRITE_THROTTLE_MS = 10_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
