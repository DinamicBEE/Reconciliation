import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService, LoginResult, UserSummaryDto } from './auth.service';

const STORAGE_KEY = 'conciliation-auth';

function userDto(overrides: Partial<UserSummaryDto> = {}): UserSummaryDto {
  return {
    id: 1,
    email: 'admin@conciliacion.mx',
    displayName: 'Admin',
    phone: null,
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['manage_users'],
    subsidiarias: [{ id: 1, nombre: 'Sub 1' }],
    ubicaciones: [],
    mustChangePassword: false,
    lastLoginAt: null,
    emailVerified: true,
    ...overrides,
  } as UserSummaryDto;
}

function loginResult(overrides: Partial<LoginResult> = {}): LoginResult {
  return {
    email: 'admin@conciliacion.mx',
    displayName: 'Admin',
    roles: ['ADMIN'],
    permissions: ['manage_users'],
    mustChangePassword: false,
    subsidiarias: [],
    ubicaciones: [],
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    // 15 min: el timer de refresco no se dispara durante las pruebas con
    // timers reales.
    expiresIn: 900,
    ...overrides,
  } as LoginResult;
}

function storedSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      username: 'admin@conciliacion.mx',
      displayName: 'Admin',
      roles: ['ADMIN'],
      permissions: ['manage_users'],
      mustChangePasswordHint: false,
      subsidiarias: [],
      ubicaciones: [],
    },
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    accessTokenExpiresAt: Date.now() + 15 * 60_000,
    ...overrides,
  };
}

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  function setup(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  describe('sin sesión previa', () => {
    it('arranca sin autenticar y sin token', () => {
      const service = setup();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.accessToken()).toBeNull();
      expect(service.sessionEndReason()).toBeNull();
    });
  });

  describe('login', () => {
    it('hace POST /auth/login con las credenciales y mapea la respuesta', () => {
      const service = setup();
      let result: LoginResult | undefined;
      service.login('admin@conciliacion.mx', 'secreto').subscribe((r) => (result = r));

      const req = httpMock.expectOne('/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'admin@conciliacion.mx', password: 'secreto' });
      req.flush({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: userDto({ mustChangePassword: true }) });

      expect(result).toEqual({
        email: 'admin@conciliacion.mx',
        displayName: 'Admin',
        roles: ['ADMIN'],
        permissions: ['manage_users'],
        mustChangePassword: true,
        subsidiarias: [{ id: 1, nombre: 'Sub 1' }],
        ubicaciones: [],
        accessToken: 'a',
        refreshToken: 'r',
        expiresIn: 900,
      });
    });

    it('no crea la sesión por sí solo (falta completeLogin)', () => {
      const service = setup();
      service.login('u', 'p').subscribe();
      httpMock.expectOne('/auth/login').flush({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: userDto() });
      expect(service.isAuthenticated()).toBe(false);
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('propaga el error HTTP (p. ej. 401) al llamador', () => {
      const service = setup();
      let status: number | undefined;
      service.login('u', 'p').subscribe({ error: (e) => (status = e.status) });
      httpMock.expectOne('/auth/login').flush({ error: 'x', code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
      expect(status).toBe(401);
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('completeLogin', () => {
    it('crea la sesión, expone el usuario y el token y la persiste en sessionStorage', () => {
      const service = setup();
      service.completeLogin(loginResult({ mustChangePassword: true }));

      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('access-1');
      expect(service.currentUser()).toEqual({
        username: 'admin@conciliacion.mx',
        displayName: 'Admin',
        roles: ['ADMIN'],
        permissions: ['manage_users'],
        mustChangePasswordHint: true,
        subsidiarias: [],
        ubicaciones: [],
      });

      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
      expect(stored.accessToken).toBe('access-1');
      expect(stored.refreshToken).toBe('refresh-1');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('limpia el motivo de cierre anterior', () => {
      const service = setup();
      service.invalidateSession('idle_timeout');
      expect(service.sessionEndReason()).toBe('idle_timeout');
      service.completeLogin(loginResult());
      expect(service.sessionEndReason()).toBeNull();
    });
  });

  describe('logout', () => {
    it('cierra la sesión local y avisa al backend con el refreshToken', () => {
      const service = setup();
      service.completeLogin(loginResult());

      service.logout();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
      expect(service.sessionEndReason()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      const req = httpMock.expectOne('/auth/logout');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      req.flush({});
    });

    it('si /auth/logout falla la sesión local sigue cerrada', () => {
      const service = setup();
      service.completeLogin(loginResult());
      service.logout();
      httpMock.expectOne('/auth/logout').flush({}, { status: 0, statusText: 'Unknown Error' });
      expect(service.isAuthenticated()).toBe(false);
    });

    it('sin sesión no llama al backend', () => {
      const service = setup();
      service.logout();
      httpMock.expectNone('/auth/logout');
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('invalidateSession', () => {
    it('cierra la sesión sin llamar a /auth/logout y registra el motivo', () => {
      const service = setup();
      service.completeLogin(loginResult());

      service.invalidateSession('invalid_token');

      expect(service.isAuthenticated()).toBe(false);
      expect(service.sessionEndReason()).toBe('invalid_token');
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      httpMock.expectNone('/auth/logout');
    });
  });

  describe('sesión restaurada de sessionStorage', () => {
    it('retoma una sesión válida y la revalida con GET /auth/me', () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedSession()));
      const service = setup();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('stored-access');

      const req = httpMock.expectOne('/auth/me');
      expect(req.request.method).toBe('GET');
      req.flush(userDto({ displayName: 'Admin Actualizado', roles: ['ADMIN', 'COSTOS'], mustChangePassword: true }));

      expect(service.currentUser()?.displayName).toBe('Admin Actualizado');
      expect(service.currentUser()?.roles).toEqual(['ADMIN', 'COSTOS']);
      expect(service.currentUser()?.mustChangePasswordHint).toBe(true);
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).user.displayName).toBe('Admin Actualizado');
    });

    it('si /auth/me falla deja la sesión como estaba', () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedSession()));
      const service = setup();
      httpMock.expectOne('/auth/me').flush({}, { status: 0, statusText: 'Unknown Error' });
      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()?.displayName).toBe('Admin');
    });

    it('descarta una sesión guardada sin tokens (forma antigua)', () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedSession({ refreshToken: undefined })));
      const service = setup();
      expect(service.isAuthenticated()).toBe(false);
      httpMock.expectNone('/auth/me');
    });

    it('descarta un JSON corrupto', () => {
      sessionStorage.setItem(STORAGE_KEY, '{no-es-json');
      const service = setup();
      expect(service.isAuthenticated()).toBe(false);
      httpMock.expectNone('/auth/me');
    });
  });

  describe('refresco del accessToken', () => {
    it('rota los tokens con POST /auth/refresh 30 s antes de que expire', () => {
      vi.useFakeTimers();
      const service = setup();
      service.completeLogin(loginResult({ expiresIn: 60 }));

      vi.advanceTimersByTime(29_000);
      httpMock.expectNone('/auth/refresh');

      vi.advanceTimersByTime(1_000);
      const req = httpMock.expectOne('/auth/refresh');
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      req.flush({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 });

      expect(service.accessToken()).toBe('access-2');
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).refreshToken).toBe('refresh-2');
    });

    it('cierra por inactividad si el refresh responde SESSION_IDLE_TIMEOUT', () => {
      vi.useFakeTimers();
      const service = setup();
      service.completeLogin(loginResult({ expiresIn: 60 }));

      vi.advanceTimersByTime(30_000);
      httpMock
        .expectOne('/auth/refresh')
        .flush({ error: 'x', code: 'SESSION_IDLE_TIMEOUT' }, { status: 401, statusText: 'Unauthorized' });

      expect(service.isAuthenticated()).toBe(false);
      expect(service.sessionEndReason()).toBe('idle_timeout');
      httpMock.expectNone('/auth/logout');
    });

    it('con cualquier otro rechazo del refresh hace logout', () => {
      vi.useFakeTimers();
      const service = setup();
      service.completeLogin(loginResult({ expiresIn: 60 }));

      vi.advanceTimersByTime(30_000);
      httpMock
        .expectOne('/auth/refresh')
        .flush({ error: 'x', code: 'REFRESH_TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });

      expect(service.isAuthenticated()).toBe(false);
      expect(service.sessionEndReason()).toBeNull();
      httpMock.expectOne('/auth/logout').flush({});
    });

    it('logout cancela el refresco programado', () => {
      vi.useFakeTimers();
      const service = setup();
      service.completeLogin(loginResult({ expiresIn: 60 }));
      service.logout();
      httpMock.expectOne('/auth/logout').flush({});

      vi.advanceTimersByTime(60_000);
      httpMock.expectNone('/auth/refresh');
    });
  });

  describe('markPasswordChangeRequired', () => {
    it('enciende la bandera de cambio de contraseña y la persiste', () => {
      const service = setup();
      service.completeLogin(loginResult());
      service.markPasswordChangeRequired();
      expect(service.currentUser()?.mustChangePasswordHint).toBe(true);
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).user.mustChangePasswordHint).toBe(true);
    });

    it('sin sesión no hace nada', () => {
      const service = setup();
      service.markPasswordChangeRequired();
      expect(service.currentUser()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
