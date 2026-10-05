import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { PermissionKey, RoleId, defaultPermissionsForRoles } from '../../user-management/data/user-management.model';
import { AuthErrorResponse, SESSION_IDLE_TIMEOUT_CODE, SessionEndReason, isSessionIdleTimeout } from './auth-errors';
import { MOCK_SUBSIDIARIAS, MOCK_UBICACIONES, MOCK_USERS } from './auth-mock.data';
import {
  MOCK_SESSION_IDLE_TIMEOUT_MS,
  clearMockSessionActivity,
  mockSessionIdleMs,
  touchMockSessionActivity,
} from './mock-session-activity';
import { MockTokenPair, issueMockTokenPair } from './mock-token.util';

const STORAGE_KEY = 'conciliation-auth';

// Vida del accessToken — en un backend real serían minutos (p. ej. 15), no
// segundos; acá se acorta a propósito para poder OBSERVAR la rotación
// automática en una sesión de prueba normal sin esperar minutos. Ajustar
// solo este valor si hace falta más/menos margen para probar a mano.
const ACCESS_TOKEN_TTL_MS = 45_000;
// Dispara la renovación un poco ANTES de que expire (no exactamente al
// vencer) — mismo margen de seguridad que usaría un interceptor real para
// no dejar una ventana donde el accessToken ya venció y la siguiente
// petición todavía no tiene uno nuevo.
const REFRESH_MARGIN_MS = 8_000;
// Cada cuánto, como mucho, una interacción del usuario se registra como
// actividad de la sesión (ver `onUserActivity`) — no hace falta escribir en
// sessionStorage en cada clic para una ventana de 30 minutos.
const ACTIVITY_WRITE_THROTTLE_MS = 10_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export interface AuthUser {
  username: string;
  displayName: string;
  // Id del registro en `user-management` (`AppUser.id`) que representa a
  // esta misma persona — ver el comentario en `auth-mock.data.ts`. Header y
  // Perfil lo usan para leer nombre/foto/rol desde `UserManagementService`
  // en vez de duplicarlos en `AuthUser`.
  appUserId: string;
  // Misma forma que la sesión del login real (rama
  // `feature/login-coctel-del-mar-integration`) para que
  // `AccessControlService` y `CatalogService` no dependan de si la sesión es
  // mock o real.
  // Códigos de rol de la cuenta — fuente de permisos vía
  // `defaultPermissionsForRoles` solo cuando no hay `AppUser` vinculado (ver
  // AccessControlService.permissions); en el mock siempre lo hay.
  roles: RoleId[];
  // Permisos efectivos de la sesión — equivalente a
  // `UserSummaryDto.permissions` del login real; fuente única de
  // `AccessControlService.permissions` (mismo criterio que la rama de
  // integración). En el mock: los defaults del rol (matriz 7.16).
  permissions: PermissionKey[];
  // Equivalente a `UserSummaryDto.mustChangePassword` del login real. En el
  // mock siempre `false`: la fuente de verdad del cambio obligatorio es
  // `AppUser.mustChangePassword` del registro vinculado (ver
  // AccessControlService.mustChangePassword).
  mustChangePasswordHint: boolean;
  // Subsidiarias/ubicaciones a las que la cuenta tiene acceso — fuente de
  // `CatalogService` (`core/services/catalog.service.ts`).
  subsidiarias: CatalogEntry[];
  ubicaciones: CatalogEntry[];
}

// Todo lo que persiste entre recargas — antes solo se guardaba `AuthUser`;
// ahora la sesión completa (tokens incluidos) para poder retomar el ciclo
// de refresco automático después de un F5, no solo "quién había iniciado
// sesión".
interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
}

/**
 * Autenticación mock — hoy valida contra `MOCK_USERS`; el día que exista
 * backend, solo cambia el cuerpo de `login()`/`refreshAccessToken()` (p. ej.
 * llamadas HTTP), el resto de la app (guard, shell, login) no se entera.
 * `providedIn: 'root'` porque el guard de rutas y la pantalla de login lo
 * necesitan fuera del árbol de `Shell`.
 *
 * Contrato de refreshToken (dado por backend): al usarlo para pedir un
 * accessToken nuevo, el backend manda TAMBIÉN un refreshToken nuevo, y el
 * anterior queda invalidado de inmediato (un solo uso, rotación). Ver
 * `refreshAccessToken()` — MASTER.md, "Patrón: refresh token de un solo uso
 * + cambio obligatorio de contraseña", documenta el porqué de cada pieza.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly document = inject(DOCUMENT);
  private readonly session = signal<AuthSession | null>(this.resolveInitialSession());
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityWriteAt = 0;

  // Por qué se cerró la última sesión SIN que el usuario lo pidiera — hoy
  // solo inactividad. Lo leen `App` (redirige a /login) y `Login` (muestra
  // el aviso); se limpia al iniciar sesión de nuevo o con logout manual.
  private readonly endReason = signal<SessionEndReason | null>(null);
  readonly sessionEndReason = this.endReason.asReadonly();

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly currentUser = computed<AuthUser | null>(() => this.session()?.user ?? null);
  // Expuesto (no el refreshToken) para el día que exista un interceptor HTTP
  // real que necesite mandar `Authorization: Bearer <token>` — el
  // refreshToken se queda privado, nada fuera de este service debe
  // presentarlo directamente (ver `refreshAccessToken`).
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  constructor() {
    // Sesión retomada de sessionStorage (recarga de página) — continúa el
    // ciclo de refresco donde se había quedado en vez de dejarlo sin
    // programar hasta el próximo login.
    const initial = this.session();
    if (initial) {
      this.scheduleRefresh(initial.accessTokenExpiresAt);
    }

    // Solo para el mock: registra la actividad del usuario que en el backend
    // real contarían sus propias peticiones (ver mock-session-activity.ts).
    for (const type of ACTIVITY_EVENTS) {
      this.document.addEventListener(type, this.onUserActivity, { capture: true, passive: true });
    }
  }

  // Resuelve a qué AppUser corresponde un username SIN validar la
  // contraseña — para orquestar cosas que necesitan saber "quién es" antes
  // de (o incluso sin) un login exitoso, p. ej. `Login` consultando si la
  // cuenta ya está bloqueada, o contabilizando un intento fallido (ver
  // `Login.onSubmit`, MASTER.md "Patrón: refresh token de un solo uso +
  // cambio obligatorio de contraseña"). Se queda dentro de la propia lista
  // de credenciales de este service (`MOCK_USERS` de `auth-mock.data.ts`) —
  // no toca `AppUser` ni `UserManagementService`, así que no rompe el
  // "AuthService tonto" (ver "Patrón: control de acceso por rol").
  findAppUserIdForUsername(username: string): string | null {
    const match = MOCK_USERS.find((candidate) => candidate.username.toLowerCase() === username.trim().toLowerCase());
    return match?.appUserId ?? null;
  }

  login(username: string, password: string): boolean {
    const match = MOCK_USERS.find(
      (candidate) =>
        candidate.username.toLowerCase() === username.trim().toLowerCase() && candidate.password === password,
    );
    if (!match) {
      return false;
    }

    const authUser: AuthUser = {
      username: match.username,
      displayName: match.displayName,
      appUserId: match.appUserId,
      roles: [...match.roles],
      permissions: defaultPermissionsForRoles(match.roles),
      mustChangePasswordHint: false,
      subsidiarias: MOCK_SUBSIDIARIAS,
      ubicaciones: MOCK_UBICACIONES,
    };
    this.endReason.set(null);
    touchMockSessionActivity();
    this.setSession({ user: authUser, ...issueMockTokenPair(match.username, ACCESS_TOKEN_TTL_MS) });
    return true;
  }

  // Logout pedido por el usuario — no deja ningún aviso pendiente.
  logout(): void {
    this.endReason.set(null);
    this.closeSession();
  }

  // Rota el accessToken/refreshToken — el llamador presenta el refreshToken
  // que tiene guardado (mismo dato que mandaría un interceptor real). Si NO
  // coincide con el vigente en la sesión, es un intento de reusar uno ya
  // invalidado por una rotación anterior: un backend real trataría eso como
  // señal de robo de token y cerraría la sesión por completo, no solo
  // rechazaría esta llamada — mismo criterio aquí (`logout()`, no solo
  // ignorar el intento). El propio timer de refresco automático (`scheduleRefresh`)
  // pasa por este mismo método con el token vigente, así que hay un solo
  // camino de código para "renovar", nunca dos implementaciones distintas.
  //
  // Sesión expirada por inactividad (acuerdo con backend, ver
  // `auth-errors.ts`): el refresh responde 401 con `code:
  // SESSION_IDLE_TIMEOUT`. Se valida SOLO por `code`; si coincide, se cierra
  // la sesión por completo y se deja `sessionEndReason` en `idle_timeout`
  // para que `App` redirija a /login y `Login` muestre el aviso. Cualquier
  // otro rechazo del refresh también cierra sesión (no se puede renovar),
  // pero sin ese aviso.
  private refreshAccessToken(presentedRefreshToken: string): void {
    const current = this.session();
    if (!current) {
      return;
    }

    if (presentedRefreshToken !== current.refreshToken) {
      this.logout();
      return;
    }

    this.requestTokenRefresh(current.user.username).subscribe({
      next: (pair) => this.setSession({ user: current.user, ...pair }),
      error: (err: unknown) => {
        if (isSessionIdleTimeout(err)) {
          this.invalidateSession('idle_timeout');
          return;
        }
        this.logout();
      },
    });
  }

  // Equivalente mock de `POST /auth/refresh` — misma respuesta de error que
  // el backend real ante inactividad (status 401 + body con `code`), así el
  // manejo de arriba no cambia al conectar la llamada HTTP.
  private requestTokenRefresh(username: string): Observable<MockTokenPair> {
    if (mockSessionIdleMs() > MOCK_SESSION_IDLE_TIMEOUT_MS) {
      const response: AuthErrorResponse = {
        status: 401,
        error: { error: 'Sesion expirada por inactividad. Debe iniciar sesion de nuevo.', code: SESSION_IDLE_TIMEOUT_CODE },
      };
      return throwError(() => response);
    }
    return of(issueMockTokenPair(username, ACCESS_TOKEN_TTL_MS));
  }

  // Cierre NO pedido por el usuario — igual de completo que `logout()`, pero
  // deja registrado el motivo para avisarle. Público y con el mismo nombre
  // que en la rama de integración (ahí también lo usa el interceptor HTTP).
  invalidateSession(reason: SessionEndReason): void {
    this.closeSession();
    this.endReason.set(reason);
  }

  // Cierra la sesión por completo: timer de refresco, sesión en memoria,
  // sessionStorage y la actividad registrada del mock.
  private closeSession(): void {
    this.clearRefreshTimer();
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
    clearMockSessionActivity();
  }

  private readonly onUserActivity = (): void => {
    if (!this.session()) return;
    const now = Date.now();
    if (now - this.lastActivityWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return;
    this.lastActivityWriteAt = now;
    touchMockSessionActivity(now);
  };

  // Verifica la contraseña actual contra `MOCK_USERS` y, si coincide,
  // actualiza el registro en el mismo lugar — es el equivalente mock de
  // "persistir la nueva contraseña en el backend" (mismo criterio que
  // `login()` ya usa esa misma lista como fuente de verdad de credenciales).
  // No toca `mustChangePassword` — eso vive en `AppUser`
  // (`user-management`), fuera del alcance de este service "tonto" (ver
  // MASTER.md, "Patrón: control de acceso por rol", sobre por qué
  // `AuthService` no debe conocer ese módulo); quien llama (`ChangePassword`)
  // limpia esa bandera aparte vía `UserManagementService`.
  changePassword(currentPassword: string, newPassword: string): boolean {
    const current = this.session();
    if (!current) {
      return false;
    }

    const match = MOCK_USERS.find((candidate) => candidate.username === current.user.username);
    if (!match || match.password !== currentPassword) {
      return false;
    }

    match.password = newPassword;
    return true;
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

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Persiste solo en sessionStorage (no localStorage): una sesión mock no
  // debe sobrevivir a cerrar el navegador por completo.
  private resolveInitialSession(): AuthSession | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      // Forma antigua (antes de tokens/roles/catálogos) o payload corrupto →
      // sesión inválida, de vuelta a login en vez de arrancar a medias sin
      // tokens que rotar ni catálogos que mostrar.
      if (
        !parsed.user ||
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
