import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { PermissionKey, RoleId, UserStatus } from '../../user-management/data/user-management.model';
import { SessionEndReason, isSessionIdleTimeout } from './auth-errors';

const STORAGE_KEY = 'conciliation-auth';

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
  // p. ej. `['ADMIN']`) — fuente de verdad para permisos vía
  // `defaultPermissionsForRoles` (ver AccessControlService.permissions), NO
  // los ids inventados por este frontend (ver MASTER.md, "Actualización:
  // unificación de roles con el backend real"). Vacío si el backend no
  // asignó ningún rol.
  roles: RoleId[];
  // `UserSummaryDto.permissions` TAL CUAL los devolvió el backend — fuente de
  // verdad ÚNICA para `AccessControlService.permissions` (antes se ignoraba
  // este arreglo y se recalculaba siempre desde `roles` vía
  // `defaultPermissionsForRoles`, ver MASTER.md "Actualización: matriz de
  // roles y permisos (7.16) completa"). Vacío solo si el backend no asignó
  // ningún permiso — no debería pasar tras sembrar el catálogo de 9.
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
// organización. A propósito NO incluye `status`/`roleIds`/subsidiarias/
// ubicaciones: esos tienen sus propios endpoints (`PATCH /users/{id}/status`,
// y de roles/subsidiarias/ubicaciones no hay todavía uno — ver
// UpdateUserRequest.java, comentario "Rol, permisos y estado se manejan en
// sus propios endpoints, no aqui"). Todo campo es opcional/nullable del lado
// del backend (solo sobreescribe lo que llega no-null), pero este frontend
// siempre manda el formulario completo.
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
}

// `POST /users/{id}/verify-email` — el backend fuerza `emailVerified=true`
// sin validar ningún token pendiente (ver UserAdminService.verifyEmail
// real).
export interface EmailVerificationResponse {
  id: number;
  emailVerified: boolean;
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
 * Sesión + autenticación contra el backend real (auth-service, vía el
 * gateway en `environment.apiUrl`/`proxy.conf.json` — ver MASTER.md,
 * "Actualización: login apuntado al backend real"). `providedIn: 'root'`
 * porque el guard de rutas y la pantalla de login lo necesitan fuera del
 * árbol de `Shell`.
 *
 * Contrato de refreshToken (dado por el backend): al usarlo para pedir un
 * accessToken nuevo, el backend manda TAMBIÉN un refreshToken nuevo, y el
 * anterior queda invalidado de inmediato (un solo uso, rotación) — ver
 * `refreshAccessToken()`, MASTER.md "Patrón: refresh token de un solo uso +
 * cambio obligatorio de contraseña".
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private readonly session = signal<AuthSession | null>(this.resolveInitialSession());
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Por qué se cerró la última sesión SIN que el usuario lo pidiera — hoy
  // solo inactividad (SESSION_IDLE_TIMEOUT, ver `refreshAccessToken`). Lo
  // leen `App` (redirige a /login) y `Login` (muestra el aviso); se limpia al
  // iniciar sesión de nuevo o con logout manual.
  private readonly endReason = signal<SessionEndReason | null>(null);
  readonly sessionEndReason = this.endReason.asReadonly();

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly currentUser = computed<AuthUser | null>(() => this.session()?.user ?? null);
  // Expuesto (no el refreshToken) para que `authTokenInterceptor` mande
  // `Authorization: Bearer <token>` en el resto de llamadas de la app — el
  // refreshToken se queda privado, nada fuera de este service debe
  // presentarlo directamente.
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  constructor() {
    // Sesión retomada de sessionStorage (recarga de página) — continúa el
    // ciclo de refresco donde se había quedado en vez de dejarlo sin
    // programar hasta el próximo login.
    const initial = this.session();
    if (initial) {
      this.scheduleRefresh(initial.accessTokenExpiresAt);
      this.validateResumedSession();
    }
  }

  // "Token validado en cada petición (API Gateway)": la sesión restaurada de
  // `sessionStorage` NO se había validado contra el backend real todavía —
  // el JWT podría haber sido invalidado del lado del servidor sin que este
  // frontend lo sepa (rol cambiado, cuenta bloqueada) y aun así se aceptaba
  // sin más hasta la primera petición que fallara. `GET /auth/me` la valida
  // de inmediato al recargar. Best-effort: cualquier error que NO sea un 401
  // (backend caído, red) deja la sesión como estaba — un 401 real de todas
  // formas lo cierra `authTokenInterceptor` en la primera petición
  // protegida; esto solo evita esperar a que ocurra.
  private validateResumedSession(): void {
    this.me().subscribe({
      next: (me) => {
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
      },
      error: () => {},
    });
  }

  // Valida credenciales contra el backend real — 401 (contraseña/usuario
  // inválidos) y 423 (cuenta bloqueada tras 5 intentos fallidos) llegan como
  // error del Observable (ver GlobalExceptionHandler en auth-service); el
  // llamador (`Login.onSubmit`) los traduce a los mensajes de la UI. NO
  // arma la sesión todavía — le falta `appUserId`, que solo el llamador
  // puede resolver (ver `completeLogin`).
  login(username: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResponseDto>(`${this.apiUrl}/auth/login`, { username, password }).pipe(
      map((res) => ({
        email: res.user.email,
        displayName: res.user.displayName,
        // Cast sin validar: si el backend algún día agrega un código de rol
        // que este frontend todavía no conoce, se cuela como string suelto
        // y simplemente no aporta permisos (`defaultPermissionsForRoles`
        // ignora ids que no están en `ROLES`) — no hay validación en
        // runtime en ningún otro punto de este service tampoco.
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

  // Segundo paso de un login exitoso — arma y persiste la sesión con el
  // `appUserId` ya resuelto (ver `login()` arriba sobre por qué está
  // separado).
  completeLogin(result: LoginResult, appUserId: string | null): void {
    this.endReason.set(null);
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

  // Logout pedido por el usuario — no deja ningún aviso pendiente.
  logout(): void {
    const current = this.session();
    this.endReason.set(null);
    this.clearSession();

    // Best-effort: invalida el refreshToken en el backend. Si falla (backend
    // caído, token ya vencido), la sesión local ya quedó cerrada de todas
    // formas — no hay nada que el usuario deba esperar ni reintentar.
    if (current) {
      this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken: current.refreshToken }).subscribe({ error: () => {} });
    }
  }

  // Verifica la contraseña actual contra el backend real y, si coincide,
  // la actualiza ahí mismo. Requiere sesión activa — `ChangePassword` solo es
  // alcanzable logeado (ver `mustChangePasswordGuard`); el Bearer lo agrega
  // `authTokenInterceptor` automáticamente, no hace falta armarlo aquí.
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/change-password`, { currentPassword, newPassword }).pipe(
      map(() => {
        // Actualiza la bandera EN LA SESIÓN en cuanto el backend confirma —
        // sin esto, `AccessControlService.mustChangePassword` seguiría en
        // `true` (viene de `mustChangePasswordHint`) hasta el próximo login,
        // y `mustChangePasswordGuard` rebotaría de vuelta a esta misma
        // pantalla en el primer intento de navegar fuera de ella.
        const latest = this.session();
        if (latest) {
          this.session.set({ ...latest, user: { ...latest.user, mustChangePasswordHint: false } });
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session()));
        }
      }),
    );
  }

  // CU3 paso 5: desbloquea una cuenta bloqueada por intentos fallidos
  // (`PATCH /users/{id}/unlock`, ver UserAdminController/UserAdminService en
  // el auth-service real). Requiere sesión activa con rol ADMIN o ALTAS —
  // el backend responde 403 si el rol no alcanza, 401 si el token no es
  // válido; el llamador (`UserDetail`) traduce el error a la UI. `id` es el
  // id NUMÉRICO del `app_user` real (`AppUser.backendUserId` en el mock de
  // `user-management` — no el id 'uXXXX' del mock), NO `AuthUser.appUserId`
  // (que es el id del registro LOCAL, no del backend).
  unlockUser(backendUserId: number): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/users/${backendUserId}/unlock`, {});
  }

  // Cierre NO pedido por el usuario (sesión expirada por inactividad, o un
  // access token rechazado fuera de esa ventana — ver `authTokenInterceptor`):
  // igual de completo que `logout()` en el cliente, pero sin llamar a
  // `/auth/logout` — el backend ya invalidó ese refresh token, o el access
  // token ya no sirve de todas formas — y dejando registrado el motivo para
  // avisarle. Pública: la llama tanto `refreshAccessToken` (abajo) como el
  // interceptor global de 401.
  invalidateSession(reason: SessionEndReason): void {
    this.clearSession();
    this.endReason.set(reason);
  }

  // Cierra la sesión en el cliente: timer de refresco, sesión en memoria y
  // sessionStorage.
  private clearSession(): void {
    this.clearRefreshTimer();
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
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
    let httpParams = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? 100));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.role) httpParams = httpParams.set('role', params.role);
    if (params.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<UserListPage>(`${this.apiUrl}/users`, { params: httpParams });
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

  // `GET /auth/me` — "Token validado en cada petición": además de servir
  // para revalidar la sesión restaurada de `sessionStorage` al recargar (ver
  // `validateResumedSession`, llamada desde el constructor), de paso
  // refresca roles/permisos/subsidiarias/ubicaciones por si cambiaron desde
  // el último login (p. ej. un admin le quitó un rol a esta misma cuenta).
  me(): Observable<UserSummaryDto> {
    return this.http.get<UserSummaryDto>(`${this.apiUrl}/auth/me`);
  }

  private setSession(session: AuthSession): void {
    this.session.set(session);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.scheduleRefresh(session.accessTokenExpiresAt);
  }

  private scheduleRefresh(expiresAt: number): void {
    this.clearRefreshTimer();
    const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 0);
    this.refreshTimer = setTimeout(() => {
      // Lee la sesión FRESCA al disparar (no la capturada al programar el
      // timer): con un solo timer activo a la vez (siempre se limpia el
      // anterior en `setSession`/`clearRefreshTimer`) no debería divergir,
      // pero leer en el momento es la versión correcta sin importar eso.
      const current = this.session();
      if (current) {
        this.refreshAccessToken(current.refreshToken);
      }
    }, delay);
  }

  // Rota el accessToken/refreshToken contra el backend real — el llamador
  // (el propio timer de arriba) presenta el refreshToken que tiene guardado.
  // Si NO coincide con el vigente en la sesión, es un intento de reusar uno
  // ya invalidado por una rotación anterior: cierra la sesión localmente sin
  // llamar al backend (mismo criterio que un robo de token detectado ahí —
  // ver AuthService.refresh en el auth-service real, que además cierra
  // TODAS las sesiones activas de la cuenta). Si el backend rechaza el refresh por
  // cualquier otra razón (expirado, backend caído), también cierra sesión:
  // no tiene sentido dejar un timer corriendo sobre una sesión que ya no se
  // puede renovar.
  //
  // Expiración por inactividad (acuerdo con backend, ver `auth-errors.ts`):
  // un refresh token con más de 30 minutos sin actividad responde 401 con
  // `code: SESSION_IDLE_TIMEOUT`. Se valida SOLO por `code`; si coincide, se
  // cierra la sesión por completo y `sessionEndReason` queda en
  // `idle_timeout` para que `App` redirija a /login y `Login` muestre el
  // aviso.
  private refreshAccessToken(presentedRefreshToken: string): void {
    const current = this.session();
    if (!current) {
      return;
    }
    if (presentedRefreshToken !== current.refreshToken) {
      this.logout();
      return;
    }

    this.http.post<TokenPairResponseDto>(`${this.apiUrl}/auth/refresh`, { refreshToken: presentedRefreshToken }).subscribe({
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
      // Forma antigua (antes de tokens/mustChangePasswordHint/roles/
      // catálogos, o payload corrupto) → sesión inválida, de vuelta a login
      // en vez de arrancar a medias sin tokens que rotar.
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

// Margen de seguridad antes de que expire el accessToken (15 min por
// defecto en coctel-del-mar, ver auth-service/application.yml) — dispara la
// renovación un poco ANTES del vencimiento, no exactamente al vencer, para
// no dejar una ventana donde el accessToken ya venció y la siguiente
// petición todavía no tiene uno nuevo.
const REFRESH_MARGIN_MS = 30_000;
