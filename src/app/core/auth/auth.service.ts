import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionKey, RoleId } from '../../shared/models/access.model';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';
import { SessionEndReason, isSessionIdleTimeout } from './auth-errors';

const STORAGE_KEY = 'conciliation-auth';

export interface AuthUser {
  username: string;
  displayName: string;
  // La sesión se resuelve SOLO con datos del backend (ADR-0001, punto 5): ya
  // no guarda el id del registro mock de `user-management`. Quien necesite el
  // `AppUser` de esta persona lo busca por email (`username`) —
  // `UserManagementService.currentAppUser`.
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
  // login/`GET /auth/me` — fuente ÚNICA de `AccessControlService.mustChangePassword`.
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
// también documentado en docs/api-endpoints.csv ("Login"). Lo comparten la
// sesión (`/auth/login`, `/auth/me`) y los clientes de `/users`
// (`UsersApiService` en `features/user-management/data`). Forma actualizada
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

// Resultado de un login exitoso, ya mapeado — `completeLogin` lo convierte en
// la sesión.
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
 * gateway en `environment.apiUrl`/`proxy.conf.js` — ver MASTER.md,
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
      next: (me) => this.applyMe(me),
      error: () => {},
    });
  }

  // Refleja en la sesión lo que `GET /auth/me` dice HOY de la persona (roles,
  // permisos, organización, bandera de contraseña pendiente).
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

  // Renueva la sesión YA: `POST /auth/refresh` + `GET /auth/me`. El JWT y
  // `AuthUser.permissions` solo se actualizan en el siguiente refresh (máx.
  // 15 min); se usa cuando alguien cambia SUS PROPIOS roles/permisos
  // (`PATCH /users/{id}/roles`) para no esperar. Cancela el timer antes de
  // pedir el par (dos refresh simultáneos con el mismo token = robo, guía);
  // `setSession` lo reprograma. Si falla, la sesión ya no es renovable: se cierra.
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

  // Valida credenciales contra el backend real — 401 (contraseña/usuario
  // inválidos) y 423 (cuenta bloqueada tras 5 intentos fallidos) llegan como
  // error del Observable (ver GlobalExceptionHandler en auth-service); el
  // llamador (`Login.onSubmit`) los traduce a los mensajes de la UI. NO
  // arma la sesión: eso lo hace `completeLogin`, para que el llamador decida
  // cuándo (p. ej. tras validar la respuesta).
  login(username: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResponseDto>(`${this.apiUrl}/auth/login`, { username, password }).pipe(
      map((res) => ({
        email: res.user.email,
        displayName: res.user.displayName,
        // Cast sin validar: si el backend algún día agrega un código de rol
        // que este frontend todavía no conoce, se cuela como string suelto
        // y se muestra con una versión legible del código
        // (`AccessCatalogService.roleLabel`) — no hay validación en runtime en
        // ningún otro punto de este service tampoco.
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

  // Segundo paso de un login exitoso — arma y persiste la sesión solo con lo
  // que devolvió el backend (ADR-0001, punto 5).
  completeLogin(result: LoginResult): void {
    this.endReason.set(null);
    const user: AuthUser = {
      username: result.email,
      displayName: result.displayName,
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
  //
  // Guía del backend (`POST /auth/change-password`, "Ojo"): el accessToken
  // vigente sigue llevando la marca `mustChangePassword` DENTRO del JWT, así
  // que el gateway seguiría rechazando todo endpoint protegido con 403
  // `PASSWORD_CHANGE_REQUIRED` hasta que se emita uno limpio — por eso, al
  // confirmar el cambio, se encadena `POST /auth/refresh` con el refresh token
  // guardado y se reemplaza la sesión (tokens nuevos + bandera apagada).
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>(`${this.apiUrl}/auth/change-password`, { currentPassword, newPassword })
      .pipe(switchMap(() => this.rotateSessionAfterPasswordChange()));
  }

  // Segundo paso de `changePassword()`. Cancela el timer de refresco ANTES de
  // pedir el par nuevo: dos `/auth/refresh` simultáneos con el mismo refresh
  // token se interpretan como robo y el backend cierra TODAS las sesiones
  // (guía, `POST /auth/refresh`, "Ojo"). `setSession` reprograma el timer con
  // el access token nuevo. Si el refresh falla la contraseña YA cambió (no se
  // propaga como error del cambio): se cierra la sesión y la persona entra de
  // nuevo con su contraseña nueva.
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

  // `POST /auth/refresh` — compartido por el timer (`refreshAccessToken`) y
  // por `changePassword()`. Es público (sin Bearer, ver `authTokenInterceptor`).
  private requestTokenPair(refreshToken: string): Observable<TokenPairResponseDto> {
    return this.http.post<TokenPairResponseDto>(`${this.apiUrl}/auth/refresh`, { refreshToken });
  }

  // El backend respondió 403 `PASSWORD_CHANGE_REQUIRED` en una petición
  // protegida (el JWT lleva `mustChangePassword`): enciende la bandera de la
  // sesión para que `authGuard`/`mustChangePasswordGuard` manden a
  // `/cambiar-password` — ver `httpErrorAlertInterceptor`.
  markPasswordChangeRequired(): void {
    const latest = this.session();
    if (!latest || latest.user.mustChangePasswordHint) return;
    this.session.set({ ...latest, user: { ...latest.user, mustChangePasswordHint: true } });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session()));
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
