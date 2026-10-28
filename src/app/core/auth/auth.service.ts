import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionKey, RoleId } from '../../shared/models/access.model';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';
import { SessionEndReason, isSessionIdleTimeout } from './auth-errors';

const STORAGE_KEY = 'conciliation-auth';

/**
 * Usuario en sesión, construido solo con datos del backend (ADR-0001, punto 5).
 *
 * @see docs/codigo/sesion-y-acceso.md#modelo-de-sesion
 */
export interface AuthUser {
  /** Email de la cuenta; `UserManagementService.currentAppUser` busca por él. */
  username: string;
  displayName: string;
  /** Códigos de rol tal como los devuelve el backend (p. ej. `'ADMIN'`); vacío si no tiene. */
  roles: RoleId[];
  /** Fuente única de {@link AccessControlService.permissions}; vacío significa sin permisos. */
  permissions: PermissionKey[];
  /** Copia de `UserSummaryDto.mustChangePassword`; fuente de `AccessControlService.mustChangePassword`. */
  mustChangePasswordHint: boolean;
  /** Subsidiarias accesibles para la cuenta; alimentan `CatalogService`. */
  subsidiarias: CatalogEntry[];
  /** Ubicaciones accesibles para la cuenta; alimentan `CatalogService`. */
  ubicaciones: CatalogEntry[];
}

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
}

/**
 * Usuario tal como lo devuelven `/auth/login`, `GET /auth/me` y los endpoints de `/users`.
 *
 * @see docs/codigo/sesion-y-acceso.md#modelo-de-sesion
 */
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

/** Resultado mapeado de un login exitoso; {@link AuthService.completeLogin} lo convierte en sesión. */
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
 * Sesión y autenticación contra el auth-service del backend, vía el Gateway (`environment.apiUrl`).
 *
 * @remarks El refresh token es de un solo uso: cada `POST /auth/refresh` lo rota.
 * @see docs/codigo/sesion-y-acceso.md#refresh-token
 * @see docs/architecture/decisions/0004-sesion-y-tokens.md
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private readonly session = signal<AuthSession | null>(this.resolveInitialSession());
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly endReason = signal<SessionEndReason | null>(null);
  /**
   * Motivo del último cierre no pedido por el usuario; `null` tras login o logout manual.
   *
   * @remarks Lo leen `App` (redirige a `/login`) y `Login` (muestra el aviso).
   * @see docs/codigo/sesion-y-acceso.md#cierre-de-sesion
   */
  readonly sessionEndReason = this.endReason.asReadonly();

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly currentUser = computed<AuthUser | null>(() => this.session()?.user ?? null);
  /** Access token para el header Bearer de `authTokenInterceptor`; el refresh token no se expone. */
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  constructor() {
    // Sesión retomada tras recargar: reprograma el refresco y la revalida.
    const initial = this.session();
    if (initial) {
      this.scheduleRefresh(initial.accessTokenExpiresAt);
      this.validateResumedSession();
    }
  }

  // Best-effort con `GET /auth/me`; un 401 lo cierra `authTokenInterceptor`.
  // Ver docs/codigo/sesion-y-acceso.md#restaurar-y-validar-sesion
  private validateResumedSession(): void {
    this.me().subscribe({
      next: (me) => this.applyMe(me),
      error: () => {},
    });
  }

  // Vuelca en la sesión roles, permisos, organización y bandera de `GET /auth/me`.
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

  /**
   * Renueva la sesión de inmediato (`POST /auth/refresh` + `GET /auth/me`), p. ej. tras cambiar los propios roles.
   *
   * @returns Observable que emite y completa siempre; si el refresh falla, cierra la sesión en lugar de fallar.
   * @see docs/codigo/sesion-y-acceso.md#refresh-token
   */
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

  /**
   * Valida credenciales con `POST /auth/login` sin abrir la sesión (eso lo hace {@link AuthService.completeLogin}).
   *
   * @returns Observable con el resultado mapeado; falla con `HttpErrorResponse` 401 (credenciales) o 423 (cuenta bloqueada).
   * @see docs/codigo/sesion-y-acceso.md#login
   */
  login(username: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResponseDto>(`${this.apiUrl}/auth/login`, { username, password }).pipe(
      map((res) => ({
        email: res.user.email,
        displayName: res.user.displayName,
        // Cast sin validar. Ver docs/codigo/sesion-y-acceso.md#riesgos
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

  /** Abre y persiste la sesión con el resultado de {@link AuthService.login}. */
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

  /** Cierra la sesión pedida por el usuario (sin aviso) e invalida el refresh token en el backend, best-effort. */
  logout(): void {
    const current = this.session();
    this.endReason.set(null);
    this.clearSession();

    // Best-effort: si `POST /auth/logout` falla, la sesión local ya está cerrada.
    if (current) {
      this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken: current.refreshToken }).subscribe({ error: () => {} });
    }
  }

  /**
   * Cambia la contraseña (`POST /auth/change-password`) y rota los tokens para obtener un JWT sin la marca.
   *
   * @returns Observable que falla con `HttpErrorResponse` si el backend rechaza el cambio; un fallo del refresh posterior cierra la sesión sin propagarse.
   * @see docs/codigo/sesion-y-acceso.md#cambio-de-contrasena
   */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>(`${this.apiUrl}/auth/change-password`, { currentPassword, newPassword })
      .pipe(switchMap(() => this.rotateSessionAfterPasswordChange()));
  }

  // Cancela el timer antes del refresh: dos refresh simultáneos cuentan como robo.
  // Ver docs/codigo/sesion-y-acceso.md#cambio-de-contrasena
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

  // `POST /auth/refresh`: ruta pública, sin Bearer (ver `authTokenInterceptor`).
  private requestTokenPair(refreshToken: string): Observable<TokenPairResponseDto> {
    return this.http.post<TokenPairResponseDto>(`${this.apiUrl}/auth/refresh`, { refreshToken });
  }

  /**
   * Enciende la bandera de cambio obligatorio para que los guards lleven a `/cambiar-password`.
   *
   * @remarks La llama `httpErrorAlertInterceptor` ante un 403 `PASSWORD_CHANGE_REQUIRED`.
   */
  markPasswordChangeRequired(): void {
    const latest = this.session();
    if (!latest || latest.user.mustChangePasswordHint) return;
    this.session.set({ ...latest, user: { ...latest.user, mustChangePasswordHint: true } });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session()));
  }

  /**
   * Cierra una sesión que el backend ya no acepta, sin llamar a `/auth/logout`, y registra el motivo.
   *
   * @see docs/codigo/sesion-y-acceso.md#cierre-de-sesion
   */
  invalidateSession(reason: SessionEndReason): void {
    this.clearSession();
    this.endReason.set(reason);
  }

  // Limpia timer de refresco, sesión en memoria y `sessionStorage`.
  private clearSession(): void {
    this.clearRefreshTimer();
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Consulta `GET /auth/me`: valida el token y devuelve roles, permisos y organización vigentes.
   *
   * @returns Observable con el usuario; falla con `HttpErrorResponse` (401 si el token ya no es válido).
   * @see docs/codigo/sesion-y-acceso.md#restaurar-y-validar-sesion
   */
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
      // Lee la sesión al disparar, no la capturada al programar el timer.
      const current = this.session();
      if (current) {
        this.refreshAccessToken(current.refreshToken);
      }
    }, delay);
  }

  // Rota el par de tokens; cualquier fallo cierra la sesión (`idle_timeout` si es por inactividad).
  // Ver docs/codigo/sesion-y-acceso.md#refresh-token
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

  // `sessionStorage`, no `localStorage`: la sesión no sobrevive a cerrar el navegador.
  private resolveInitialSession(): AuthSession | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      // Payload incompleto o corrupto: sesión inválida, de vuelta a login.
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

// Renueva 30 s antes de que venza el access token (15 min en el backend).
const REFRESH_MARGIN_MS = 30_000;
