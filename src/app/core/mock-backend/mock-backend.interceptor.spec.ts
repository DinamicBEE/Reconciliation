import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { MOCK_PERMISSIONS, MOCK_ROLES } from '../auth/auth-mock.data';
import { authTokenInterceptor } from '../interceptors/auth-token.interceptor';
import { mockBackendInterceptor } from './mock-backend.interceptor';

// `environment.apiUrl` es '' en pruebas. El backend simulado es un singleton del módulo:
// cada test crea sus propios roles y cuentas con nombres únicos.
const ADMIN = { email: 'admin@conciliacion.mx', password: 'Conciliacion2026' };
const TESORERIA = { email: 'roberto.sanchez@conciliacion.mx', password: 'Tesoreria2026' };

interface Reply {
  status: number;
  body: any;
}

interface Options {
  body?: unknown;
  params?: Record<string, string | number>;
}

describe('mockBackendInterceptor', () => {
  const token = signal<string | null>(null);
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let seq = 0;

  beforeEach(() => {
    sessionStorage.clear();
    token.set(null);
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor, mockBackendInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken: token, invalidateSession: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  // Envía la petición, avanza los 250 ms de latencia y devuelve respuesta o error HTTP.
  async function send(method: string, url: string, options: Options = {}): Promise<Reply> {
    let reply: Reply | undefined;
    http.request(method, url, { body: options.body, params: options.params, observe: 'response' }).subscribe({
      next: (res) => (reply = { status: res.status, body: res.body }),
      error: (err) => (reply = { status: err.status, body: err.error }),
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(reply).toBeDefined();
    return reply!;
  }

  async function loginAs(account: { email: string; password: string }): Promise<Reply> {
    token.set(null);
    const reply = await send('POST', '/auth/login', { body: { username: account.email, password: account.password } });
    if (reply.status === 200) token.set(reply.body.accessToken);
    return reply;
  }

  const nextSeq = () => ++seq;

  async function createRole(name: string, permissions: string[] = ['view_dashboard']): Promise<Reply> {
    return send('POST', '/roles', { body: { name, permissions } });
  }

  async function createUser(roleIds: string[], overrides: Record<string, unknown> = {}): Promise<Reply> {
    const n = nextSeq();
    return send('POST', '/users', {
      body: {
        firstName: 'Prueba',
        lastName: `Usuario${n}`,
        email: `qa.${n}@conciliacion.mx`,
        phone: null,
        supervisorId: null,
        subsidiariaIds: [1],
        ubicacionIds: [1, 2],
        roleIds,
        status: null,
        ...overrides,
      },
    });
  }

  describe('/auth', () => {
    it('login válido devuelve tokens y el usuario con permisos, empresas y tiendas', async () => {
      const reply = await loginAs(ADMIN);

      expect(reply.status).toBe(200);
      expect(reply.body.accessToken).toMatch(/^mock-access\./);
      expect(reply.body.refreshToken).toMatch(/^mock-refresh\./);
      expect(reply.body.expiresIn).toBe(90);
      const user = reply.body.user;
      expect(user.email).toBe(ADMIN.email);
      expect(user.roles).toEqual(['ADMIN']);
      expect(user.permissions).toEqual(expect.arrayContaining(['manage_users', 'manage_roles', 'view_audit_log']));
      expect(user.subsidiarias).toHaveLength(2);
      expect(user.ubicaciones).toHaveLength(16);
    });

    it('el login no envía Authorization (ruta pública)', async () => {
      token.set('token-previo');
      const reply = await send('POST', '/auth/login', { body: { username: ADMIN.email, password: ADMIN.password } });

      expect(reply.status).toBe(200);
    });

    it('el correo del login no distingue mayúsculas', async () => {
      const reply = await loginAs({ email: ADMIN.email.toUpperCase(), password: ADMIN.password });

      expect(reply.status).toBe(200);
    });

    it('credenciales inválidas responden 401 INVALID_CREDENTIALS', async () => {
      const reply = await loginAs({ email: 'nadie@conciliacion.mx', password: 'cualquiera' });

      expect(reply.status).toBe(401);
      expect(reply.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('una contraseña incorrecta en una cuenta real también es 401 INVALID_CREDENTIALS', async () => {
      const created = await loginAs(ADMIN).then(() => createUser(['CONTABILIDAD']));
      const reply = await loginAs({ email: created.body.email, password: 'incorrecta' });

      expect(reply.status).toBe(401);
      expect(reply.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('5 intentos fallidos bloquean la cuenta con 423 ACCOUNT_LOCKED', async () => {
      await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);
      let reply: Reply = { status: 0, body: null };
      for (let i = 0; i < 5; i++) reply = await loginAs({ email: created.body.email, password: 'incorrecta' });

      expect(reply.status).toBe(423);
      expect(reply.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('GET /auth/me devuelve la sesión con token válido', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/auth/me');

      expect(reply.status).toBe(200);
      expect(reply.body.email).toBe(ADMIN.email);
    });

    it('GET /auth/me sin token responde 401', async () => {
      const reply = await send('GET', '/auth/me');

      expect(reply.status).toBe(401);
    });

    it('GET /auth/me con un token desconocido responde 401', async () => {
      token.set('mock-access.inventado');
      const reply = await send('GET', '/auth/me');

      expect(reply.status).toBe(401);
    });

    it('refresh rota el par de tokens y el refresh anterior deja de servir', async () => {
      const login = await loginAs(ADMIN);
      const refreshToken = login.body.refreshToken;

      const rotated = await send('POST', '/auth/refresh', { body: { refreshToken } });

      expect(rotated.status).toBe(200);
      expect(rotated.body.accessToken).not.toBe(login.body.accessToken);
      expect(rotated.body.refreshToken).not.toBe(refreshToken);
      expect(rotated.body.expiresIn).toBe(90);

      const reused = await send('POST', '/auth/refresh', { body: { refreshToken } });
      expect(reused.status).toBe(401);
      expect(reused.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('el nuevo accessToken emitido por refresh funciona en /auth/me', async () => {
      const login = await loginAs(ADMIN);
      const rotated = await send('POST', '/auth/refresh', { body: { refreshToken: login.body.refreshToken } });
      token.set(rotated.body.accessToken);

      expect((await send('GET', '/auth/me')).status).toBe(200);
    });

    it('logout revoca el refresh token y responde 204', async () => {
      const login = await loginAs(ADMIN);
      const out = await send('POST', '/auth/logout', { body: { refreshToken: login.body.refreshToken } });
      const refresh = await send('POST', '/auth/refresh', { body: { refreshToken: login.body.refreshToken } });

      expect(out.status).toBe(204);
      expect(refresh.status).toBe(401);
    });

    it('un refresh tras 30 minutos sin actividad responde 401 SESSION_IDLE_TIMEOUT', async () => {
      const login = await loginAs(ADMIN);
      await vi.advanceTimersByTimeAsync(31 * 60_000);

      const reply = await send('POST', '/auth/refresh', { body: { refreshToken: login.body.refreshToken } });

      expect(reply.status).toBe(401);
      expect(reply.body.code).toBe('SESSION_IDLE_TIMEOUT');
    });

    it('change-password valida la actual y el mínimo de la nueva', async () => {
      await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);
      await loginAs({ email: created.body.email, password: created.body.temporaryPassword });

      const wrong = await send('POST', '/auth/change-password', { body: { currentPassword: 'mala', newPassword: 'NuevaClave2026' } });
      const short = await send('POST', '/auth/change-password', {
        body: { currentPassword: created.body.temporaryPassword, newPassword: 'corta' },
      });
      const done = await send('POST', '/auth/change-password', {
        body: { currentPassword: created.body.temporaryPassword, newPassword: 'NuevaClave2026' },
      });

      expect(wrong.status).toBe(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(short.status).toBe(400);
      expect(done.status).toBe(204);
      expect((await loginAs({ email: created.body.email, password: 'NuevaClave2026' })).status).toBe(200);
    });
  });

  describe('/users', () => {
    it('lista paginada con token de admin', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/users');

      expect(reply.status).toBe(200);
      expect(reply.body.page).toBe(0);
      expect(reply.body.size).toBe(20);
      expect(reply.body.content).toHaveLength(20);
      expect(reply.body.totalElements).toBeGreaterThan(20);
      expect(reply.body.totalPages).toBe(Math.ceil(reply.body.totalElements / 20));
    });

    it('page y size paginan sin repetir filas', async () => {
      await loginAs(ADMIN);
      const first = await send('GET', '/users', { params: { page: 0, size: 5 } });
      const second = await send('GET', '/users', { params: { page: 1, size: 5 } });
      const ids = [...first.body.content, ...second.body.content].map((u: { id: number }) => u.id);

      expect(first.body.content).toHaveLength(5);
      expect(second.body.page).toBe(1);
      expect(new Set(ids).size).toBe(10);
    });

    it('filtra por search (nombre o correo)', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/users', { params: { search: 'MARINA' } });

      expect(reply.body.totalElements).toBeGreaterThan(0);
      expect(reply.body.content.every((u: { email: string; displayName: string }) => `${u.displayName} ${u.email}`.toLowerCase().includes('marina'))).toBe(true);
    });

    it('filtra por role', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/users', { params: { role: 'ALTAS', size: 100 } });

      expect(reply.body.totalElements).toBeGreaterThan(0);
      expect(reply.body.content.every((u: { roles: string[] }) => u.roles.includes('ALTAS'))).toBe(true);
    });

    it('filtra por status', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/users', { params: { status: 'LOCKED', size: 100 } });

      expect(reply.body.totalElements).toBeGreaterThan(0);
      expect(reply.body.content.every((u: { status: string }) => u.status === 'LOCKED')).toBe(true);
    });

    it('combina filtros y un resultado sin coincidencias queda vacío con 1 página', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/users', { params: { search: 'zzz-no-existe', role: 'ADMIN' } });

      expect(reply.body.content).toEqual([]);
      expect(reply.body.totalElements).toBe(0);
      expect(reply.body.totalPages).toBe(1);
    });

    it('responde 403 a quien no tiene manage_users', async () => {
      await loginAs(TESORERIA);

      expect((await send('GET', '/users')).status).toBe(403);
    });

    it('responde 401 sin token', async () => {
      expect((await send('GET', '/users')).status).toBe(401);
    });

    it('detalle de un usuario existente', async () => {
      const login = await loginAs(ADMIN);
      const reply = await send('GET', `/users/${login.body.user.id}`);

      expect(reply.status).toBe(200);
      expect(reply.body.id).toBe(login.body.user.id);
      expect(reply.body.firstName).toBe('Administrador');
      expect(reply.body).toHaveProperty('activeSessions');
      expect(reply.body).toHaveProperty('cargos');
    });

    it('detalle de uno inexistente responde 404 USER_NOT_FOUND', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/users/999999');

      expect(reply.status).toBe(404);
      expect(reply.body.code).toBe('USER_NOT_FOUND');
    });

    it('POST crea el usuario (201) con contraseña temporal y puede iniciar sesión', async () => {
      await loginAs(ADMIN);
      const reply = await createUser(['CONTABILIDAD']);

      expect(reply.status).toBe(201);
      expect(reply.body.id).toBeGreaterThan(0);
      expect(reply.body.temporaryPassword).toMatch(/^PRUEBAUSUARIO\d{4}$/);
      expect(reply.body.roles).toEqual(['CONTABILIDAD']);
      expect(reply.body.permissions).toEqual(expect.arrayContaining(['view_dashboard', 'export_reports']));
      expect(reply.body.mustChangePassword).toBe(true);

      const login = await loginAs({ email: reply.body.email, password: reply.body.temporaryPassword });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
    });

    it('POST con un correo repetido responde 409 EMAIL_ALREADY_REGISTERED', async () => {
      await loginAs(ADMIN);
      const reply = await createUser(['CONTABILIDAD'], { email: 'Admin@Conciliacion.mx' });

      expect(reply.status).toBe(409);
      expect(reply.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('POST con rol inexistente responde 400 INVALID_ROLE y con tienda inválida 400 INVALID_LOCATION', async () => {
      await loginAs(ADMIN);
      const role = await createUser(['NO_EXISTE']);
      const location = await createUser(['CONTABILIDAD'], { ubicacionIds: [999] });

      expect(role.status).toBe(400);
      expect(role.body.code).toBe('INVALID_ROLE');
      expect(location.status).toBe(400);
      expect(location.body.code).toBe('INVALID_LOCATION');
    });

    it('POST sin permiso responde 403', async () => {
      await loginAs(TESORERIA);

      expect((await createUser(['CONTABILIDAD'])).status).toBe(403);
    });

    it('PATCH /users/{id}/status cambia el estado y valida el valor', async () => {
      await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);
      const id = created.body.id;

      const inactive = await send('PATCH', `/users/${id}/status`, { body: { status: 'inactive' } });
      const active = await send('PATCH', `/users/${id}/status`, { body: { status: 'active' } });
      const blocked = await send('PATCH', `/users/${id}/status`, { body: { status: 'blocked' } });
      const invalid = await send('PATCH', `/users/${id}/status`, { body: { status: 'otro' } });

      expect(inactive.body.status).toBe('INACTIVE');
      expect(active.body.status).toBe('ACTIVE');
      expect(blocked.body.status).toBe('LOCKED');
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('INVALID_USER_STATUS');
    });

    it('un usuario inactivo no puede iniciar sesión (423)', async () => {
      await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);
      await send('PATCH', `/users/${created.body.id}/status`, { body: { status: 'inactive' } });

      const reply = await loginAs({ email: created.body.email, password: created.body.temporaryPassword });

      expect(reply.status).toBe(423);
    });

    it('PATCH /users/{id}/status sobre uno inexistente responde 404', async () => {
      await loginAs(ADMIN);

      expect((await send('PATCH', '/users/999999/status', { body: { status: 'active' } })).status).toBe(404);
    });

    it('DELETE /users/{id} hace baja lógica y no se puede borrar a sí mismo', async () => {
      const login = await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);

      const own = await send('DELETE', `/users/${login.body.user.id}`);
      const removed = await send('DELETE', `/users/${created.body.id}`);
      const after = await send('GET', `/users/${created.body.id}`);

      expect(own.status).toBe(409);
      expect(own.body.code).toBe('CANNOT_DELETE_SELF');
      expect(removed.body).toEqual({ success: true, id: created.body.id });
      expect(after.status).toBe(404);
    });
  });

  describe('/permissions y /roles', () => {
    it('GET /permissions devuelve el catálogo con token de admin', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/permissions');

      expect(reply.status).toBe(200);
      expect(reply.body.map((p: { code: string }) => p.code)).toEqual(MOCK_PERMISSIONS.map((p) => p.code));
    });

    it('GET /permissions y /roles responden 403 sin permiso y 401 sin token', async () => {
      expect((await send('GET', '/permissions')).status).toBe(401);
      expect((await send('GET', '/roles')).status).toBe(401);

      await loginAs(TESORERIA);
      expect((await send('GET', '/permissions')).status).toBe(403);
      expect((await send('GET', '/roles')).status).toBe(403);
    });

    it('GET /roles incluye los roles de la matriz', async () => {
      await loginAs(ADMIN);
      const reply = await send('GET', '/roles');
      const codes = reply.body.map((r: { code: string }) => r.code);

      expect(reply.status).toBe(200);
      expect(codes).toEqual(expect.arrayContaining(MOCK_ROLES.map((r) => r.code)));
    });

    it('POST /roles crea el rol con el code derivado del nombre', async () => {
      await loginAs(ADMIN);
      const n = nextSeq();
      const reply = await createRole(`Revisión Fiscal ${n}`, ['view_dashboard', 'export_reports']);

      expect(reply.status).toBe(201);
      expect(reply.body).toEqual({
        code: `REVISION_FISCAL_${n}`,
        name: `Revisión Fiscal ${n}`,
        defaultPermissions: ['view_dashboard', 'export_reports'],
      });
      const list = await send('GET', '/roles');
      expect(list.body.map((r: { code: string }) => r.code)).toContain(`REVISION_FISCAL_${n}`);
    });

    it('POST /roles con un nombre repetido responde 409 ROLE_ALREADY_EXISTS', async () => {
      await loginAs(ADMIN);
      const name = `Duplicado ${nextSeq()}`;
      await createRole(name);

      const reply = await createRole(name.toLowerCase());

      expect(reply.status).toBe(409);
      expect(reply.body.code).toBe('ROLE_ALREADY_EXISTS');
    });

    it('POST /roles valida permisos y nombre', async () => {
      await loginAs(ADMIN);
      const permission = await createRole(`Invalido ${nextSeq()}`, ['no_existe']);
      const name = await createRole('   ');

      expect(permission.status).toBe(400);
      expect(permission.body.code).toBe('INVALID_PERMISSION');
      expect(name.status).toBe(400);
      expect(name.body.code).toBe('VALIDATION_ERROR');
    });

    it('POST /roles sin manage_roles responde 403', async () => {
      await loginAs(TESORERIA);

      expect((await createRole(`Prohibido ${nextSeq()}`)).status).toBe(403);
    });

    it('GET /roles/{code} devuelve el rol y uno inexistente responde 404 ROLE_NOT_FOUND', async () => {
      await loginAs(ADMIN);
      const created = await createRole(`Consulta ${nextSeq()}`);

      const found = await send('GET', `/roles/${created.body.code}`);
      const missing = await send('GET', '/roles/NO_EXISTE');

      expect(found.status).toBe(200);
      expect(found.body).toEqual(created.body);
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('ROLE_NOT_FOUND');
    });

    it('PATCH /roles/{code} reemplaza permisos y nombre sin cambiar el code', async () => {
      await loginAs(ADMIN);
      const created = await createRole(`Editable ${nextSeq()}`, ['view_dashboard']);

      const reply = await send('PATCH', `/roles/${created.body.code}`, {
        body: { name: 'Nombre nuevo', permissions: ['view_reconciliation', 'view_catalogs'] },
      });

      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({
        code: created.body.code,
        name: 'Nombre nuevo',
        defaultPermissions: ['view_reconciliation', 'view_catalogs'],
      });
      const again = await send('GET', `/roles/${created.body.code}`);
      expect(again.body.defaultPermissions).toEqual(['view_reconciliation', 'view_catalogs']);
    });

    it('PATCH /roles/{code} con permisos nuevos se propaga a quienes tienen el rol', async () => {
      await loginAs(ADMIN);
      const role = await createRole(`Propaga ${nextSeq()}`, ['view_dashboard']);
      const user = await createUser([role.body.code]);

      await send('PATCH', `/roles/${role.body.code}`, { body: { permissions: ['export_reports'] } });
      const detail = await send('GET', `/users/${user.body.id}`);

      expect(detail.body.permissions).toEqual(['export_reports']);
    });

    it('PATCH /roles/{code} con permiso inválido responde 400 y con rol inexistente 404', async () => {
      await loginAs(ADMIN);
      const created = await createRole(`Parche ${nextSeq()}`);

      const invalid = await send('PATCH', `/roles/${created.body.code}`, { body: { permissions: ['x'] } });
      const missing = await send('PATCH', '/roles/NO_EXISTE', { body: { permissions: [] } });

      expect(invalid.status).toBe(400);
      expect(missing.status).toBe(404);
    });

    it('DELETE /roles/{code} responde 204 y el rol deja de existir', async () => {
      await loginAs(ADMIN);
      const created = await createRole(`Borrable ${nextSeq()}`);

      const removed = await send('DELETE', `/roles/${created.body.code}`);
      const after = await send('GET', `/roles/${created.body.code}`);
      const list = await send('GET', '/roles');

      expect(removed.status).toBe(204);
      expect(removed.body).toBeNull();
      expect(after.status).toBe(404);
      expect(list.body.map((r: { code: string }) => r.code)).not.toContain(created.body.code);
    });

    it('DELETE de un rol asignado a una persona habilitada responde 409 ROLE_IN_USE', async () => {
      await loginAs(ADMIN);
      const role = await createRole(`En uso ${nextSeq()}`);
      await createUser([role.body.code]);

      const reply = await send('DELETE', `/roles/${role.body.code}`);

      expect(reply.status).toBe(409);
      expect(reply.body.code).toBe('ROLE_IN_USE');
    });

    it('un rol solo asignado a personas inactivas sí se puede borrar', async () => {
      await loginAs(ADMIN);
      const role = await createRole(`Solo inactivos ${nextSeq()}`);
      await createUser([role.body.code], { status: 'INACTIVE' });

      expect((await send('DELETE', `/roles/${role.body.code}`)).status).toBe(204);
    });

    it('DELETE de un rol inexistente responde 404 ROLE_NOT_FOUND', async () => {
      await loginAs(ADMIN);
      const reply = await send('DELETE', '/roles/NO_EXISTE');

      expect(reply.status).toBe(404);
      expect(reply.body.code).toBe('ROLE_NOT_FOUND');
    });
  });

  describe('/audit-log', () => {
    it('lista la bitácora paginada con view_audit_log, la más reciente primero', async () => {
      await loginAs(ADMIN);
      await createUser(['CONTABILIDAD']);
      const reply = await send('GET', '/audit-log', { params: { size: 10 } });
      const dates: string[] = reply.body.content.map((e: { createdAt: string }) => e.createdAt);

      expect(reply.status).toBe(200);
      expect(reply.body.content).toHaveLength(10);
      expect(reply.body.totalElements).toBeGreaterThan(10);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('filtra por action y por userId', async () => {
      await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);
      await send('PATCH', `/users/${created.body.id}/status`, { body: { status: 'inactive' } });

      const byAction = await send('GET', '/audit-log', { params: { action: 'status_changed', size: 100 } });
      const byUser = await send('GET', '/audit-log', { params: { userId: created.body.id } });

      expect(byAction.body.content.length).toBeGreaterThan(0);
      expect(byAction.body.content.every((e: { action: string }) => e.action === 'status_changed')).toBe(true);
      expect(byUser.body.content.map((e: { action: string }) => e.action).sort()).toEqual(['created', 'status_changed']);
      expect(byUser.body.content.every((e: { target: { id: number } }) => e.target.id === created.body.id)).toBe(true);
    });

    it('GET /users/{id}/audit-log devuelve solo la bitácora de ese usuario', async () => {
      await loginAs(ADMIN);
      const created = await createUser(['CONTABILIDAD']);
      const reply = await send('GET', `/users/${created.body.id}/audit-log`);

      expect(reply.status).toBe(200);
      expect(reply.body.totalElements).toBe(1);
      expect(reply.body.content[0].action).toBe('created');
    });

    it('responde 403 sin view_audit_log y 401 sin token', async () => {
      expect((await send('GET', '/audit-log')).status).toBe(401);

      await loginAs(TESORERIA);
      expect((await send('GET', '/audit-log')).status).toBe(403);
    });

    it('un userId inexistente responde 404', async () => {
      await loginAs(ADMIN);

      expect((await send('GET', '/audit-log', { params: { userId: 999999 } })).status).toBe(404);
    });
  });

  describe('/catalogs', () => {
    it('subsidiarias: 2 empresas', async () => {
      const reply = await send('GET', '/catalogs/subsidiarias');

      expect(reply.status).toBe(200);
      expect(reply.body).toHaveLength(2);
      expect(reply.body.map((s: { nombre: string }) => s.nombre)).toEqual(['Coctel del Mar', 'Hipermar Fish']);
    });

    it('ubicaciones: 16 tiendas, cada una de la subsidiaria 1 o 2', async () => {
      const reply = await send('GET', '/catalogs/ubicaciones');

      expect(reply.body).toHaveLength(16);
      expect(reply.body.every((u: { subsidiariaId: number }) => u.subsidiariaId === 1 || u.subsidiariaId === 2)).toBe(true);
    });

    it.each([
      ['cargos', 3],
      ['puestos', 3],
      ['departamentos', 2],
      ['areas', 3],
    ])('%s devuelve %i entradas con id y nombre', async (name, count) => {
      const reply = await send('GET', `/catalogs/${name}`);

      expect(reply.status).toBe(200);
      expect(reply.body).toHaveLength(count);
      expect(reply.body.every((c: { id: number; nombre: string }) => typeof c.id === 'number' && !!c.nombre)).toBe(true);
    });

    it('un catálogo no simulado pasa al siguiente handler', () => {
      http.get('/catalogs/inexistente').subscribe({ error: () => undefined });

      httpMock.expectOne('/catalogs/inexistente').flush({}, { status: 404, statusText: 'Not Found' });
    });
  });

  describe('/sales', () => {
    it('GET /sales pagina con page y pageSize', async () => {
      const first = await send('GET', '/sales', { params: { page: 1, pageSize: 10 } });
      const second = await send('GET', '/sales', { params: { page: 2, pageSize: 10 } });

      expect(first.status).toBe(200);
      expect(first.body.data).toHaveLength(10);
      expect(first.body.page).toBe(1);
      expect(second.body.page).toBe(2);
      expect(second.body.total).toBe(first.body.total);
      expect(first.body.data[0].folio).not.toBe(second.body.data[0].folio);
    });

    it('pageSize se limita a 100', async () => {
      const reply = await send('GET', '/sales', { params: { pageSize: 500 } });

      expect(reply.body.pageSize).toBe(100);
    });

    it('filtra por rango de fechas', async () => {
      const all = await send('GET', '/sales', { params: { pageSize: 100 } });
      const dates: string[] = all.body.data.map((s: { date: string }) => s.date).sort();
      const from = dates[Math.floor(dates.length / 2)];

      const reply = await send('GET', '/sales', { params: { dateFrom: from, dateTo: from, pageSize: 100 } });

      expect(reply.body.total).toBe(dates.filter((d) => d === from).length);
      expect(reply.body.data.every((s: { date: string }) => s.date === from)).toBe(true);
    });

    it('filtra por tienda, medio de pago y estado', async () => {
      const all = await send('GET', '/sales', { params: { pageSize: 100 } });
      const sample = all.body.data.find((s: { tenderMedia: unknown }) => s.tenderMedia);

      const store = await send('GET', '/sales', { params: { store: sample.store.id, pageSize: 100 } });
      const media = await send('GET', '/sales', { params: { tenderMedia: sample.tenderMedia.id, pageSize: 100 } });
      const status = await send('GET', '/sales', { params: { status: sample.reconciliationStatus.id, pageSize: 100 } });

      expect(store.body.data.every((s: { store: { id: number } }) => s.store.id === sample.store.id)).toBe(true);
      expect(media.body.data.every((s: { tenderMedia: { id: number } }) => s.tenderMedia.id === sample.tenderMedia.id)).toBe(true);
      expect(status.body.data.every((s: { reconciliationStatus: { id: number } }) => s.reconciliationStatus.id === sample.reconciliationStatus.id)).toBe(true);
      expect(store.body.total).toBeLessThanOrEqual(all.body.total);
    });

    it('busca por folio', async () => {
      const all = await send('GET', '/sales', { params: { pageSize: 100 } });
      const folio = all.body.data[0].folio;

      const reply = await send('GET', '/sales', { params: { search: folio } });

      expect(reply.body.data.map((s: { folio: string }) => s.folio)).toContain(folio);
    });

    it('una búsqueda sin coincidencias devuelve total 0', async () => {
      const reply = await send('GET', '/sales', { params: { search: 'zzz-no-existe' } });

      expect(reply.body.total).toBe(0);
      expect(reply.body.data).toEqual([]);
    });

    it('catálogo de medios de pago', async () => {
      const reply = await send('GET', '/sales/catalogs/tender-media');

      expect(reply.status).toBe(200);
      expect(reply.body.map((m: { code: string }) => m.code).sort()).toEqual(['BBVA', 'DIDI_FOOD', 'EFECTIVO', 'RAPPI']);
    });

    it('catálogo de estados de conciliación', async () => {
      const reply = await send('GET', '/sales/catalogs/reconciliation-statuses');

      expect(reply.status).toBe(200);
      expect(reply.body.map((s: { code: string }) => s.code)).toEqual(['conciliado', 'desconciliado', 'por_conciliar']);
    });

    it('POST /sales/capture responde OK con una location por ubicación', async () => {
      const reply = await send('POST', '/sales/capture', { body: { ubicacionIds: [1, 2], dateFrom: '2026-01-01' } });

      expect(reply.status).toBe(200);
      expect(reply.body.status).toBe('OK');
      expect(reply.body.locations).toHaveLength(2);
    });
  });

  describe('rutas no simuladas', () => {
    it('una ruta desconocida pasa al siguiente handler sin esperar la latencia', () => {
      let reply: unknown;
      http.get('/otra/ruta').subscribe((res) => (reply = res));

      httpMock.expectOne('/otra/ruta').flush({ pasa: true });

      expect(reply).toEqual({ pasa: true });
    });

    it('un método no soportado en una ruta simulada también pasa al siguiente handler', () => {
      http.delete('/permissions').subscribe({ error: () => undefined });

      httpMock.expectOne('/permissions').flush({}, { status: 405, statusText: 'Method Not Allowed' });
    });
  });

  describe('latencia', () => {
    it('responde después de 250 ms y no antes', async () => {
      let done = false;
      http.get('/catalogs/areas').subscribe(() => (done = true));

      await vi.advanceTimersByTimeAsync(249);
      expect(done).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
    });
  });
});
