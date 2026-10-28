import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoleDto } from '../../../core/auth/access-catalog.service';
import { RolesApiService } from './roles-api.service';

// `environment.apiUrl` es '' en desarrollo/pruebas: las rutas son relativas.
const ROLE: RoleDto = {
  code: 'CONTABILIDAD_SUR',
  name: 'Contabilidad Sur',
  defaultPermissions: ['view_dashboard', 'export_reports'],
};

describe('RolesApiService', () => {
  let service: RolesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RolesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('createRole', () => {
    it('hace POST /roles con nombre y permisos y devuelve el rol creado tal cual', () => {
      let created: RoleDto | undefined;
      service.createRole({ name: 'Contabilidad Sur', permissions: ['view_dashboard', 'export_reports'] }).subscribe((r) => (created = r));

      const req = httpMock.expectOne('/roles');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Contabilidad Sur', permissions: ['view_dashboard', 'export_reports'] });
      req.flush(ROLE, { status: 201, statusText: 'Created' });

      expect(created).toEqual(ROLE);
    });

    it('envía la lista de permisos vacía cuando no se marcó ninguno', () => {
      service.createRole({ name: 'Solo lectura', permissions: [] }).subscribe();

      const req = httpMock.expectOne('/roles');
      expect(req.request.body).toEqual({ name: 'Solo lectura', permissions: [] });
      req.flush({ code: 'SOLO_LECTURA', name: 'Solo lectura', defaultPermissions: [] });
    });

    it('propaga el 409 ROLE_ALREADY_EXISTS al suscriptor', () => {
      let error: HttpErrorResponse | undefined;
      service.createRole({ name: 'Contabilidad Sur', permissions: [] }).subscribe({ error: (e) => (error = e) });

      httpMock
        .expectOne('/roles')
        .flush({ error: 'Ya existe', code: 'ROLE_ALREADY_EXISTS' }, { status: 409, statusText: 'Conflict' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error?.status).toBe(409);
      expect(error?.error).toEqual({ error: 'Ya existe', code: 'ROLE_ALREADY_EXISTS' });
    });
  });

  describe('getRole', () => {
    it('hace GET /roles/{code} y devuelve el DTO sin transformarlo', () => {
      let role: RoleDto | undefined;
      service.getRole('CONTABILIDAD_SUR').subscribe((r) => (role = r));

      const req = httpMock.expectOne('/roles/CONTABILIDAD_SUR');
      expect(req.request.method).toBe('GET');
      expect(req.request.body).toBeNull();
      req.flush(ROLE);

      expect(role).toEqual(ROLE);
    });

    it('codifica el código en la URL', () => {
      service.getRole('A B/C?').subscribe();

      const req = httpMock.expectOne('/roles/A%20B%2FC%3F');
      expect(req.request.method).toBe('GET');
      req.flush(ROLE);
    });

    it('propaga el 404 ROLE_NOT_FOUND', () => {
      let status: number | undefined;
      service.getRole('NO_EXISTE').subscribe({ error: (e: HttpErrorResponse) => (status = e.status) });

      httpMock.expectOne('/roles/NO_EXISTE').flush({ code: 'ROLE_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });

      expect(status).toBe(404);
    });
  });

  describe('updateRole', () => {
    it('hace PATCH /roles/{code} con el cuerpo recibido y devuelve el rol actualizado', () => {
      const updated: RoleDto = { ...ROLE, name: 'Contabilidad Norte', defaultPermissions: ['view_dashboard'] };
      let role: RoleDto | undefined;
      service
        .updateRole('CONTABILIDAD_SUR', { name: 'Contabilidad Norte', permissions: ['view_dashboard'] })
        .subscribe((r) => (role = r));

      const req = httpMock.expectOne('/roles/CONTABILIDAD_SUR');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Contabilidad Norte', permissions: ['view_dashboard'] });
      req.flush(updated);

      expect(role).toEqual(updated);
    });

    it('envía solo los campos presentes (cambio parcial)', () => {
      service.updateRole('CONTABILIDAD_SUR', { permissions: [] }).subscribe();

      const req = httpMock.expectOne('/roles/CONTABILIDAD_SUR');
      expect(req.request.body).toEqual({ permissions: [] });
      expect('name' in req.request.body).toBe(false);
      req.flush(ROLE);
    });

    it('codifica el código en la URL', () => {
      service.updateRole('Ñ&1', { name: 'x' }).subscribe();
      httpMock.expectOne(`/roles/${encodeURIComponent('Ñ&1')}`).flush(ROLE);
    });
  });

  describe('deleteRole', () => {
    it('hace DELETE /roles/{code} y completa con el 204', () => {
      const next = vi.fn();
      const complete = vi.fn();
      service.deleteRole('CONTABILIDAD_SUR').subscribe({ next, complete });

      const req = httpMock.expectOne('/roles/CONTABILIDAD_SUR');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(next).toHaveBeenCalledWith(null);
      expect(complete).toHaveBeenCalled();
    });

    it('propaga el 409 ROLE_IN_USE', () => {
      let error: HttpErrorResponse | undefined;
      service.deleteRole('ADMIN').subscribe({ error: (e) => (error = e) });

      httpMock.expectOne('/roles/ADMIN').flush({ code: 'ROLE_IN_USE' }, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect(error?.error).toEqual({ code: 'ROLE_IN_USE' });
    });
  });
});
