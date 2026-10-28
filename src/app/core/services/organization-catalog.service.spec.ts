import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';
import {
  ORGANIZATION_CATALOG_KINDS,
  OrganizationCatalogKind,
  OrganizationCatalogService,
  UbicacionCatalogEntry,
} from './organization-catalog.service';

const SUBSIDIARIAS: CatalogEntry[] = [
  { id: 1, nombre: 'Sub 1' },
  { id: 2, nombre: 'Sub 2' },
];

const UBICACIONES: UbicacionCatalogEntry[] = [
  { id: 100, nombre: 'Tienda A', subsidiariaId: 1 },
  { id: 101, nombre: 'Tienda B', subsidiariaId: 1 },
  { id: 200, nombre: 'Tienda C', subsidiariaId: 2 },
];

const RESPONSES: Record<OrganizationCatalogKind, CatalogEntry[]> = {
  subsidiarias: SUBSIDIARIAS,
  ubicaciones: UBICACIONES,
  cargos: [{ id: 1, nombre: 'Gerente' }],
  puestos: [{ id: 1, nombre: 'Analista' }],
  departamentos: [{ id: 1, nombre: 'Finanzas' }],
  // En una base nueva algunos catálogos llegan vacíos.
  areas: [],
};

const url = (kind: OrganizationCatalogKind) => `/catalogs/${kind}`;

describe('OrganizationCatalogService', () => {
  let httpMock: HttpTestingController;
  let authenticated: WritableSignal<boolean>;

  function setup(isAuthenticated = true): OrganizationCatalogService {
    authenticated = signal(isAuthenticated);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: authenticated, currentUser: signal(null) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(OrganizationCatalogService);
    TestBed.tick();
    return service;
  }

  // El resource publica la respuesta en una microtarea: tras `flush` hay que
  // esperar a que la app quede estable (ya sin peticiones en vuelo).
  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function expectGet(kind: OrganizationCatalogKind): TestRequest {
    const req = httpMock.expectOne(url(kind));
    expect(req.request.method).toBe('GET');
    return req;
  }

  function expectNoRequests(): void {
    for (const kind of ORGANIZATION_CATALOG_KINDS) httpMock.expectNone(url(kind));
  }

  async function flushAll(responses: Partial<Record<OrganizationCatalogKind, CatalogEntry[] | 'error'>> = {}): Promise<void> {
    for (const kind of ORGANIZATION_CATALOG_KINDS) {
      const response = responses[kind] ?? RESPONSES[kind];
      if (response === 'error') {
        expectGet(kind).flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      } else {
        expectGet(kind).flush(response);
      }
    }
    await settle();
  }

  async function loadAll(service: OrganizationCatalogService): Promise<void> {
    service.ensureLoaded();
    TestBed.tick();
    await flushAll();
  }

  afterEach(() => {
    httpMock.verify();
  });

  describe('antes de ensureLoaded', () => {
    it('no pide nada y todo queda vacío', () => {
      const service = setup();
      expectNoRequests();
      for (const kind of ORGANIZATION_CATALOG_KINDS) expect(service.options(kind)).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });
  });

  describe('ensureLoaded', () => {
    it('pide los seis catálogos y los expone', async () => {
      const service = setup();
      await loadAll(service);

      expect(service.subsidiarias()).toEqual(SUBSIDIARIAS);
      expect(service.ubicaciones()).toEqual(UBICACIONES);
      expect(service.cargos()).toEqual(RESPONSES.cargos);
      expect(service.puestos()).toEqual(RESPONSES.puestos);
      expect(service.departamentos()).toEqual(RESPONSES.departamentos);
      expect(service.areas()).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('está cargando mientras haya peticiones en vuelo', async () => {
      const service = setup();
      service.ensureLoaded();
      TestBed.tick();
      expect(service.loading()).toBe(true);
      await flushAll();
      expect(service.loading()).toBe(false);
    });

    it('sin sesión no pide nada', () => {
      const service = setup(false);
      service.ensureLoaded();
      TestBed.tick();
      expectNoRequests();
      expect(service.subsidiarias()).toEqual([]);
    });

    it('una segunda llamada sin fallos no vuelve a pedir', async () => {
      const service = setup();
      await loadAll(service);
      service.ensureLoaded();
      TestBed.tick();
      expectNoRequests();
      expect(service.cargos()).toEqual(RESPONSES.cargos);
    });
  });

  describe('errores', () => {
    it('la falla de un catálogo marca loadFailed y no vacía los otros', async () => {
      const service = setup();
      service.ensureLoaded();
      TestBed.tick();
      await flushAll({ cargos: 'error' });

      expect(service.loadFailed()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(() => service.cargos()).not.toThrow();
      expect(service.cargos()).toEqual([]);
      expect(service.find('cargos', 1)).toBeNull();
      expect(service.subsidiarias()).toEqual(SUBSIDIARIAS);
      expect(service.ubicaciones()).toEqual(UBICACIONES);
      expect(service.departamentos()).toEqual(RESPONSES.departamentos);
    });

    it('ensureLoaded posterior solo reintenta los que fallaron', async () => {
      const service = setup();
      service.ensureLoaded();
      TestBed.tick();
      await flushAll({ cargos: 'error', areas: 'error' });

      service.ensureLoaded();
      TestBed.tick();
      for (const kind of ['subsidiarias', 'ubicaciones', 'puestos', 'departamentos'] as const) {
        httpMock.expectNone(url(kind));
      }
      expectGet('cargos').flush(RESPONSES.cargos);
      expectGet('areas').flush([{ id: 7, nombre: 'Operaciones' }]);
      await settle();

      expect(service.loadFailed()).toBe(false);
      expect(service.cargos()).toEqual(RESPONSES.cargos);
      expect(service.areas()).toEqual([{ id: 7, nombre: 'Operaciones' }]);
      expect(service.subsidiarias()).toEqual(SUBSIDIARIAS);
    });
  });

  describe('reload', () => {
    it('sin solicitud previa equivale a la primera carga', async () => {
      const service = setup();
      service.reload();
      TestBed.tick();
      await flushAll();
      expect(service.subsidiarias()).toEqual(SUBSIDIARIAS);
    });

    it('vuelve a pedir los seis aunque no hayan fallado', async () => {
      const service = setup();
      await loadAll(service);

      service.reload();
      TestBed.tick();
      await flushAll({ subsidiarias: [{ id: 3, nombre: 'Sub 3' }] });

      expect(service.subsidiarias()).toEqual([{ id: 3, nombre: 'Sub 3' }]);
      expect(service.loadFailed()).toBe(false);
    });
  });

  describe('find', () => {
    it('busca por id dentro del catálogo indicado', async () => {
      const service = setup();
      await loadAll(service);
      expect(service.find('subsidiarias', 2)).toEqual({ id: 2, nombre: 'Sub 2' });
      expect(service.find('subsidiarias', 99)).toBeNull();
    });
  });

  describe('ubicacionesFor', () => {
    it('filtra por las subsidiarias indicadas', async () => {
      const service = setup();
      await loadAll(service);
      expect(service.ubicacionesFor([1]).map((u) => u.id)).toEqual([100, 101]);
      expect(service.ubicacionesFor([2]).map((u) => u.id)).toEqual([200]);
      expect(service.ubicacionesFor([3])).toEqual([]);
    });

    it('sin subsidiarias elegidas devuelve todas', async () => {
      const service = setup();
      await loadAll(service);
      expect(service.ubicacionesFor([])).toEqual(UBICACIONES);
    });
  });

  describe('pruneUbicaciones', () => {
    it('quita las ubicaciones que no pertenecen a las subsidiarias elegidas', async () => {
      const service = setup();
      await loadAll(service);
      expect(service.pruneUbicaciones([100, 200, 101], [1])).toEqual([100, 101]);
    });

    it('conserva ids que no están en el catálogo', async () => {
      const service = setup();
      await loadAll(service);
      expect(service.pruneUbicaciones([100, 999, 200], [2])).toEqual([999, 200]);
    });

    it('sin subsidiarias elegidas no toca nada', async () => {
      const service = setup();
      await loadAll(service);
      expect(service.pruneUbicaciones([100, 200], [])).toEqual([100, 200]);
    });

    it('sin catálogo cargado no toca nada', () => {
      const service = setup();
      expect(service.pruneUbicaciones([100, 200], [1])).toEqual([100, 200]);
    });
  });

  describe('cambios de sesión', () => {
    it('al cerrar sesión vuelve a vacío sin pedir nada', async () => {
      const service = setup();
      await loadAll(service);

      authenticated.set(false);
      TestBed.tick();

      expectNoRequests();
      for (const kind of ORGANIZATION_CATALOG_KINDS) expect(service.options(kind)).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('al cerrar sesión con la carga en vuelo descarta las respuestas tardías', async () => {
      const service = setup();
      service.ensureLoaded();
      TestBed.tick();
      const pending = ORGANIZATION_CATALOG_KINDS.map((kind) => [kind, expectGet(kind)] as const);

      authenticated.set(false);
      TestBed.tick();
      expect(service.loading()).toBe(false);

      for (const [kind, req] of pending) req.flush(RESPONSES[kind]);
      await settle();
      for (const kind of ORGANIZATION_CATALOG_KINDS) expect(service.options(kind)).toEqual([]);
    });
  });
});
