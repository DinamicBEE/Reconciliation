import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccessCatalogService, PermissionDto, RoleDto } from './access-catalog.service';
import { AuthService } from './auth.service';

interface FakeUser {
  permissions: string[];
}

const ROLES: RoleDto[] = [
  { code: 'ADMIN', name: 'Administrador', defaultPermissions: ['manage_users', 'manage_roles'] },
  { code: 'CONTABILIDAD', name: 'Contabilidad', defaultPermissions: ['view_dashboard', 'manage_users'] },
];

const PERMISSIONS: PermissionDto[] = [
  { code: 'manage_users', description: 'Gestionar usuarios', module: 'Administración' },
  { code: 'view_dashboard', description: 'Ver resumen de venta', module: 'Operación' },
  { code: 'manage_roles', description: 'Gestionar roles', module: 'Administración' },
];

describe('AccessCatalogService', () => {
  let httpMock: HttpTestingController;
  let currentUser: WritableSignal<FakeUser | null>;

  function setup(user: FakeUser | null): AccessCatalogService {
    currentUser = signal(user);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser, isAuthenticated: () => currentUser() !== null } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(AccessCatalogService);
    TestBed.tick();
    return service;
  }

  // Los dos GET del forkJoin, en vuelo a la vez.
  function expectCatalogRequests(): { roles: TestRequest; permissions: TestRequest } {
    const roles = httpMock.expectOne('/roles');
    const permissions = httpMock.expectOne('/permissions');
    expect(roles.request.method).toBe('GET');
    expect(permissions.request.method).toBe('GET');
    return { roles, permissions };
  }

  // El resource publica la respuesta en una microtarea: tras `flush` hay que
  // esperar a que la app quede estable (ya sin peticiones en vuelo).
  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  async function flushCatalogs(): Promise<void> {
    const { roles, permissions } = expectCatalogRequests();
    roles.flush(ROLES);
    permissions.flush(PERMISSIONS);
    await settle();
  }

  afterEach(() => {
    httpMock.verify();
  });

  describe('sin permiso para los catálogos', () => {
    it('sin sesión no pide nada y todo queda vacío', async () => {
      const service = setup(null);
      httpMock.expectNone('/roles');
      httpMock.expectNone('/permissions');
      expect(service.canLoad()).toBe(false);
      expect(service.roles()).toEqual([]);
      expect(service.permissions()).toEqual([]);
      expect(service.roleOptions()).toEqual([]);
      expect(service.permissionGroups()).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('con sesión sin manage_users ni manage_roles no pide nada', async () => {
      const service = setup({ permissions: ['view_dashboard'] });
      httpMock.expectNone('/roles');
      httpMock.expectNone('/permissions');
      expect(service.canLoad()).toBe(false);
      expect(service.roles()).toEqual([]);
    });
  });

  describe('con permiso', () => {
    it.each([['manage_users'], ['manage_roles']])('con %s pide /roles y /permissions', async (permission) => {
      const service = setup({ permissions: [permission] });
      expect(service.canLoad()).toBe(true);
      await flushCatalogs();
      expect(service.roles().length).toBe(2);
    });

    it('está cargando mientras las peticiones siguen en vuelo', async () => {
      const service = setup({ permissions: ['manage_users'] });
      const { roles, permissions } = expectCatalogRequests();
      expect(service.loading()).toBe(true);

      roles.flush(ROLES);
      TestBed.tick();
      // forkJoin espera a los dos.
      expect(service.loading()).toBe(true);
      expect(service.roles()).toEqual([]);

      permissions.flush(PERMISSIONS);
      await settle();
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('mapea code→id, name→label, description→label y module→group', async () => {
      const service = setup({ permissions: ['manage_users'] });
      await flushCatalogs();

      expect(service.roles()).toEqual([
        { id: 'ADMIN', label: 'Administrador', defaultPermissions: ['manage_users', 'manage_roles'] },
        { id: 'CONTABILIDAD', label: 'Contabilidad', defaultPermissions: ['view_dashboard', 'manage_users'] },
      ]);
      expect(service.permissions()).toEqual([
        { key: 'manage_users', label: 'Gestionar usuarios', group: 'Administración' },
        { key: 'view_dashboard', label: 'Ver resumen de venta', group: 'Operación' },
        { key: 'manage_roles', label: 'Gestionar roles', group: 'Administración' },
      ]);
      expect(service.roleOptions()).toEqual([
        { value: 'ADMIN', label: 'Administrador' },
        { value: 'CONTABILIDAD', label: 'Contabilidad' },
      ]);
    });

    it('agrupa los permisos por módulo en orden de llegada', async () => {
      const service = setup({ permissions: ['manage_users'] });
      await flushCatalogs();

      expect(service.permissionGroups().map((g) => g.group)).toEqual(['Administración', 'Operación']);
      expect(service.permissionGroups()[0].items.map((p) => p.key)).toEqual(['manage_users', 'manage_roles']);
      expect(service.permissionGroups()[1].items.map((p) => p.key)).toEqual(['view_dashboard']);
    });

    it('roleLabel y permissionLabel usan el catálogo', async () => {
      const service = setup({ permissions: ['manage_users'] });
      await flushCatalogs();
      expect(service.roleLabel('ADMIN')).toBe('Administrador');
      expect(service.permissionLabel('view_dashboard')).toBe('Ver resumen de venta');
    });

    it('defaultPermissionsForRoles une los permisos por defecto sin repetir', async () => {
      const service = setup({ permissions: ['manage_users'] });
      await flushCatalogs();
      expect(service.defaultPermissionsForRoles(['ADMIN', 'CONTABILIDAD'])).toEqual([
        'manage_users',
        'manage_roles',
        'view_dashboard',
      ]);
      expect(service.defaultPermissionsForRoles([])).toEqual([]);
      expect(service.defaultPermissionsForRoles(['TESORERIA'])).toEqual([]);
    });
  });

  describe('error', () => {
    it('marca loadFailed y deja las listas vacías sin lanzar', async () => {
      const service = setup({ permissions: ['manage_users'] });
      const { roles, permissions } = expectCatalogRequests();
      roles.flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      await settle();

      // forkJoin cancela la otra petición al fallar una.
      expect(permissions.cancelled).toBe(true);
      expect(service.loadFailed()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(() => service.roles()).not.toThrow();
      expect(service.roles()).toEqual([]);
      expect(service.permissions()).toEqual([]);
      expect(service.roleOptions()).toEqual([]);
      expect(service.permissionGroups()).toEqual([]);
      expect(service.roleLabel('ADMIN')).toBe('Admin');
    });

    it('load() reintenta tras el error y limpia loadFailed al responder', async () => {
      const service = setup({ permissions: ['manage_users'] });
      expectCatalogRequests().roles.flush({}, { status: 0, statusText: 'Unknown Error' });
      await settle();
      expect(service.loadFailed()).toBe(true);

      service.load();
      TestBed.tick();
      await flushCatalogs();
      expect(service.loadFailed()).toBe(false);
      expect(service.roles().length).toBe(2);
    });
  });

  describe('load()', () => {
    it('vuelve a pedir ambos catálogos y refleja la respuesta nueva', async () => {
      const service = setup({ permissions: ['manage_roles'] });
      await flushCatalogs();

      service.load();
      TestBed.tick();
      const { roles, permissions } = expectCatalogRequests();
      roles.flush([{ code: 'ALTAS', name: 'Altas', defaultPermissions: [] }]);
      permissions.flush([]);
      await settle();

      expect(service.roleOptions()).toEqual([{ value: 'ALTAS', label: 'Altas' }]);
      expect(service.permissions()).toEqual([]);
    });
  });

  describe('cambios de sesión', () => {
    it('al perder la sesión vuelve a vacío sin pedir nada', async () => {
      const service = setup({ permissions: ['manage_users'] });
      await flushCatalogs();
      expect(service.roles().length).toBe(2);

      currentUser.set(null);
      TestBed.tick();

      httpMock.expectNone('/roles');
      expect(service.roles()).toEqual([]);
      expect(service.permissions()).toEqual([]);
      expect(service.loading()).toBe(false);
    });

    it('al cerrar sesión con la carga en vuelo vuelve a vacío y descarta la respuesta tardía', async () => {
      const service = setup({ permissions: ['manage_users'] });
      const { roles, permissions } = expectCatalogRequests();
      expect(service.loading()).toBe(true);

      currentUser.set(null);
      TestBed.tick();
      expect(service.loading()).toBe(false);
      expect(service.roles()).toEqual([]);

      // Al pasar a reposo (`params` = undefined) Angular NO aborta la carga en
      // curso: la petición sigue en vuelo, pero su respuesta se descarta.
      roles.flush(ROLES);
      permissions.flush(PERMISSIONS);
      await settle();
      expect(service.roles()).toEqual([]);
      expect(service.permissions()).toEqual([]);
      expect(service.loadFailed()).toBe(false);
    });

    it('load() mientras ya está cargando no duplica las peticiones', async () => {
      const service = setup({ permissions: ['manage_users'] });
      service.load();
      TestBed.tick();
      await flushCatalogs();
      expect(service.roles().length).toBe(2);
    });

    it('al iniciar sesión con permiso pide los catálogos', async () => {
      const service = setup(null);
      httpMock.expectNone('/roles');

      currentUser.set({ permissions: ['manage_users'] });
      TestBed.tick();
      await flushCatalogs();
      expect(service.roles().length).toBe(2);
    });
  });

  describe('roleLabel / permissionLabel sin catálogo', () => {
    it('humanizan códigos desconocidos', async () => {
      const service = setup(null);
      expect(service.roleLabel('CONTABILIDAD')).toBe('Contabilidad');
      expect(service.roleLabel('SUPER_ADMIN')).toBe('Super admin');
      expect(service.permissionLabel('view_audit_log')).toBe('View audit log');
    });

    it('humanizan un código que no está en el catálogo cargado', async () => {
      const service = setup({ permissions: ['manage_users'] });
      await flushCatalogs();
      expect(service.roleLabel('TESORERIA')).toBe('Tesoreria');
    });
  });
});
