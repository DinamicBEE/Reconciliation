import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

const STORAGE_KEY = 'conciliation-auth';

export interface AuthUser {
  username: string;
  displayName: string;
  // Id del registro en `user-management` (`AppUser.id`) que representa a
  // esta misma persona — ver `UserManagementService.findUserByEmail`, que lo
  // resuelve por email tras un login exitoso (`Login.onSubmit`). `null`
  // cuando no hay match: no existe todavía un backend de administración de
  // usuarios que comparta el mismo registro que coctel-del-mar, así que solo
  // las cuentas de demo (mismo email que las sembradas ahí) quedan
  // vinculadas — el resto se autentica igual, pero Header/Perfil no tienen
  // de dónde leer nombre/foto/rol (ver AccessControlService.currentAppUser).
  appUserId: string | null;
  // Copia de `UserSummaryDto.mustChangePassword` (coctel-del-mar) tal como
  // la devolvió el login — fuente de verdad además de/ante la del `AppUser`
  // vinculado (ver AccessControlService.mustChangePassword): el backend real
  // ya la sabe aunque el email no tenga match en `user-management`.
  mustChangePasswordHint: boolean;
}

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
}

// DTOs del contrato real — ver coctel-del-mar/auth-service
// (AuthController + web/dto/*), también documentado en
// docs/api-endpoints.csv ("Login").
interface UserSummaryDto {
  id: number;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  subsidiariaId: number | null;
  ubicacionId: number | null;
  mustChangePassword: boolean;
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
  mustChangePassword: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Sesión + autenticación contra el backend real (coctel-del-mar/auth-service,
 * vía el gateway en `environment.apiUrl` — ver docker-compose.yml de ese
 * repo). `providedIn: 'root'` porque el guard de rutas y la pantalla de
 * login lo necesitan fuera del árbol de `Shell`.
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

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly currentUser = computed<AuthUser | null>(() => this.session()?.user ?? null);
  // Expuesto (no el refreshToken) para que un futuro interceptor HTTP mande
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
    }
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
        mustChangePassword: res.user.mustChangePassword,
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
    const user: AuthUser = {
      username: result.email,
      displayName: result.displayName,
      appUserId,
      mustChangePasswordHint: result.mustChangePassword,
    };
    this.setSession({
      user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: Date.now() + result.expiresIn * 1000,
    });
  }

  logout(): void {
    const current = this.session();
    this.clearRefreshTimer();
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);

    // Best-effort: invalida el refreshToken en el backend. Si falla (backend
    // caído, token ya vencido), la sesión local ya quedó cerrada de todas
    // formas — no hay nada que el usuario deba esperar ni reintentar.
    if (current) {
      this.http.post(`${this.apiUrl}/auth/logout`, { refreshToken: current.refreshToken }).subscribe({ error: () => {} });
    }
  }

  // Verifica la contraseña actual contra el backend real y, si coincide,
  // la actualiza ahí mismo. Requiere sesión activa (manda el accessToken
  // vigente) — `ChangePassword` solo es alcanzable logeado (ver
  // `mustChangePasswordGuard`).
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    const current = this.session();
    const accessToken = current?.accessToken;
    if (!current || !accessToken) {
      // No debería pasar en la práctica (`ChangePassword` solo es alcanzable
      // logeado, ver `mustChangePasswordGuard`) — un Observable que falla en
      // vez de lanzar sincrónico, para que el `.subscribe({ error })` del
      // llamador SÍ lo capture (lanzar acá, antes de devolver el Observable,
      // se saltaría ese manejador por completo).
      return throwError(() => new Error('changePassword requiere una sesión activa.'));
    }

    return this.http.post<void>(
      `${this.apiUrl}/auth/change-password`,
      { currentPassword, newPassword },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ).pipe(
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
  // ver AuthService.refresh en coctel-del-mar, que además cierra TODAS las
  // sesiones activas de la cuenta). Si el backend rechaza el refresh por
  // cualquier otra razón (expirado, backend caído), también cierra sesión:
  // no tiene sentido dejar un timer corriendo sobre una sesión que ya no se
  // puede renovar.
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
      error: () => this.logout(),
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
      // Forma antigua (antes de tokens/mustChangePasswordHint, o payload
      // corrupto) → sesión inválida, de vuelta a login en vez de arrancar a
      // medias sin tokens que rotar.
      if (
        !parsed.user ||
        parsed.user.mustChangePasswordHint === undefined ||
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
