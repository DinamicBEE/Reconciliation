import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { CatalogDetail, CatalogSummary } from './catalogs.model';
import { CATALOG_PAGE_SIZES, CatalogsService } from './catalogs.service';

const LIST_URL = `${environment.apiUrl}/catalogs`;
const ITEMS_URL = `${environment.apiUrl}/catalogs/items`;

function summary(code: string, overrides: Partial<CatalogSummary> = {}): CatalogSummary {
  return {
    code,
    name: `Catálogo ${code}`,
    description: '',
    type: 'INTERNAL',
    origin: 'Interno',
    fromNetsuite: false,
    records: 2,
    lastUpdate: '2026-10-20T10:00:00',
    ...overrides,
  };
}

const BANKS = summary('BANKS', { type: 'NETSUITE', origin: 'NetSuite', fromNetsuite: true });
const TAXES = summary('TAXES', { type: 'DIAN', origin: 'DIAN' });

function detail(catalog: CatalogSummary, page = 1, pageSize = 10): CatalogDetail {
  return {
    catalog,
    columns: [{ key: 'name', label: 'Nombre', type: 'text' }],
    data: [{ id: 1, name: 'Uno' }],
    total: 1,
    page,
    pageSize,
  };
}

describe('CatalogsService', () => {
  let httpMock: HttpTestingController;
  let service: CatalogsService;

  // Publica la respuesta del resource (microtarea) y deja correr el planificador.
  async function settle(): Promise<void> {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
  }

  // Deja pasar el debounce de 300 ms de la búsqueda y dispara la petición resultante.
  async function passDebounce(): Promise<void> {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(300);
    TestBed.tick();
  }

  function expectList(): TestRequest {
    const req = httpMock.expectOne((r) => r.url === LIST_URL);
    expect(req.request.method).toBe('GET');
    return req;
  }

  function expectItems(): TestRequest {
    const req = httpMock.expectOne((r) => r.url === ITEMS_URL);
    expect(req.request.method).toBe('GET');
    return req;
  }

  const expectNoList = () => httpMock.expectNone((r) => r.url === LIST_URL);
  const expectNoItems = () => httpMock.expectNone((r) => r.url === ITEMS_URL);

  function paramsOf(req: TestRequest): Record<string, string | null> {
    const params = req.request.params;
    return Object.fromEntries(params.keys().map((key) => [key, params.get(key)]));
  }

  async function openAndLoad(catalog: CatalogSummary): Promise<void> {
    service.openCatalog(catalog);
    TestBed.tick();
    expectItems().flush(detail(catalog));
    await settle();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CatalogsService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(CatalogsService);
    TestBed.tick();
    expectList().flush([BANKS, TAXES]);
    await settle();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  describe('lista de catálogos', () => {
    it('al crearse pide GET /catalogs sin parámetros y expone la respuesta', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), CatalogsService],
      });
      httpMock = TestBed.inject(HttpTestingController);
      service = TestBed.inject(CatalogsService);
      TestBed.tick();

      const req = expectList();
      expect(req.request.params.keys()).toEqual([]);
      expect(service.loading()).toBe(true);
      expect(service.catalogs()).toEqual([]);

      req.flush([BANKS]);
      await settle();
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
      expect(service.catalogs()).toEqual([BANKS]);
    });

    it('envía el tipo filtrado y lo omite al volver a "all"', async () => {
      service.typeFilter.set('DIAN');
      TestBed.tick();
      const filtered = expectList();
      expect(paramsOf(filtered)).toEqual({ type: 'DIAN' });
      filtered.flush([TAXES]);
      await settle();
      expect(service.catalogs()).toEqual([TAXES]);

      service.typeFilter.set('all');
      TestBed.tick();
      expect(paramsOf(expectList())).toEqual({});
    });

    it('espera 300 ms tras teclear antes de buscar y recorta los espacios', async () => {
      service.search.set('  banco  ');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(299);
      TestBed.tick();
      expectNoList();

      await vi.advanceTimersByTimeAsync(1);
      TestBed.tick();
      expect(paramsOf(expectList())).toEqual({ search: 'banco' });
    });

    it('solo pide la última búsqueda si se teclea dentro del debounce', async () => {
      service.search.set('ba');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(200);
      service.search.set('banco');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(200);
      TestBed.tick();
      expectNoList();

      await passDebounce();
      expect(paramsOf(expectList())).toEqual({ search: 'banco' });
    });

    it('combina búsqueda y tipo', async () => {
      service.typeFilter.set('NETSUITE');
      TestBed.tick();
      expectList().flush([BANKS]);
      await settle();

      service.search.set('banco');
      await passDebounce();
      expect(paramsOf(expectList())).toEqual({ search: 'banco', type: 'NETSUITE' });
    });

    it('vaciar la búsqueda aplica en el acto, sin esperar el debounce', async () => {
      service.search.set('banco');
      await passDebounce();
      expectList().flush([BANKS]);
      await settle();

      service.search.set('');
      TestBed.tick();
      expect(paramsOf(expectList())).toEqual({});
    });

    it('vaciar y teclear de inmediato no revive la búsqueda anterior', async () => {
      service.search.set('abc');
      await passDebounce();
      expectList().flush([BANKS]);
      await settle();

      service.search.set('');
      TestBed.tick();
      expect(paramsOf(expectList())).toEqual({});
      await vi.advanceTimersByTimeAsync(1);

      service.search.set('x');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(100);
      TestBed.tick();
      expectNoList();

      await passDebounce();
      expect(paramsOf(expectList())).toEqual({ search: 'x' });
    });

    it('una búsqueda de solo espacios no dispara otra petición', async () => {
      service.search.set('   ');
      await passDebounce();
      expectNoList();
    });

    it('marca el error, expone lista vacía y reintenta con reloadList', async () => {
      service.typeFilter.set('DIAN');
      TestBed.tick();
      expectList().flush('boom', { status: 500, statusText: 'Server Error' });
      await settle();
      expect(service.loadFailed()).toBe(true);
      expect(service.catalogs()).toEqual([]);
      expect(service.loading()).toBe(false);

      service.reloadList();
      TestBed.tick();
      const retry = expectList();
      expect(paramsOf(retry)).toEqual({ type: 'DIAN' });
      retry.flush([TAXES]);
      await settle();
      expect(service.loadFailed()).toBe(false);
      expect(service.catalogs()).toEqual([TAXES]);
    });
  });

  describe('detalle del catálogo abierto', () => {
    it('sin catálogo abierto no pide registros', () => {
      expectNoItems();
      expect(service.selectedCatalog()).toBeNull();
      expect(service.detail()).toBeNull();
      expect(service.detailLoading()).toBe(false);
      expect(service.detailFailed()).toBe(false);
    });

    it('openCatalog pide la primera página con el tamaño por defecto y expone el detalle', async () => {
      service.openCatalog(BANKS);
      TestBed.tick();
      expect(service.selectedCatalog()).toEqual(BANKS);

      const req = expectItems();
      expect(paramsOf(req)).toEqual({ code: 'BANKS', page: '1', pageSize: String(CATALOG_PAGE_SIZES[0]) });
      expect(service.detailLoading()).toBe(true);
      expect(service.detail()).toBeNull();

      req.flush(detail(BANKS));
      await settle();
      expect(service.detailLoading()).toBe(false);
      expect(service.detail()).toEqual(detail(BANKS));
    });

    it('descarta una respuesta de otro catálogo', async () => {
      service.openCatalog(BANKS);
      TestBed.tick();
      expectItems().flush(detail(TAXES));
      await settle();
      expect(service.detail()).toBeNull();
    });

    it('pide la página elegida', async () => {
      await openAndLoad(BANKS);

      service.page.set(3);
      TestBed.tick();
      expect(paramsOf(expectItems())).toEqual({ code: 'BANKS', page: '3', pageSize: '10' });
    });

    it('la búsqueda de registros usa debounce y vuelve a la página 1', async () => {
      await openAndLoad(BANKS);
      service.page.set(3);
      TestBed.tick();
      expectItems().flush(detail(BANKS, 3));
      await settle();

      service.rowSearch.set(' uno ');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(299);
      TestBed.tick();
      expectNoItems();

      await passDebounce();
      expect(paramsOf(expectItems())).toEqual({ code: 'BANKS', search: 'uno', page: '1', pageSize: '10' });
      expect(service.page()).toBe(1);
    });

    it('vaciar la búsqueda de registros aplica en el acto', async () => {
      await openAndLoad(BANKS);
      service.rowSearch.set('uno');
      await passDebounce();
      expectItems().flush(detail(BANKS));
      await settle();

      service.rowSearch.set('');
      TestBed.tick();
      expect(paramsOf(expectItems())).toEqual({ code: 'BANKS', page: '1', pageSize: '10' });
    });

    it('al abrir otro catálogo reinicia búsqueda y página', async () => {
      await openAndLoad(BANKS);
      service.rowSearch.set('uno');
      await passDebounce();
      expectItems().flush(detail(BANKS));
      await settle();
      service.page.set(2);
      TestBed.tick();
      expectItems().flush(detail(BANKS, 2));
      await settle();

      service.openCatalog(TAXES);
      TestBed.tick();
      expect(service.rowSearch()).toBe('');
      expect(service.page()).toBe(1);
      expect(service.detail()).toBeNull();
      const req = expectItems();
      expect(paramsOf(req)).toEqual({ code: 'TAXES', page: '1', pageSize: '10' });

      req.flush(detail(TAXES));
      await settle();
      expect(service.detail()?.catalog.code).toBe('TAXES');
    });

    it('changePageSize fija el tamaño y vuelve a la página 1 en una sola petición', async () => {
      await openAndLoad(BANKS);
      service.page.set(4);
      TestBed.tick();
      expectItems().flush(detail(BANKS, 4));
      await settle();

      service.changePageSize(50);
      TestBed.tick();
      expect(service.pageSize()).toBe(50);
      expect(service.page()).toBe(1);
      expect(paramsOf(expectItems())).toEqual({ code: 'BANKS', page: '1', pageSize: '50' });
    });

    it('closeCatalog limpia la selección y el detalle sin pedir nada', async () => {
      await openAndLoad(BANKS);

      service.closeCatalog();
      TestBed.tick();
      expectNoItems();
      expect(service.selectedCatalog()).toBeNull();
      expect(service.detail()).toBeNull();
    });

    it('marca el error del detalle y reintenta con reloadDetail', async () => {
      service.openCatalog(BANKS);
      TestBed.tick();
      expectItems().flush('boom', { status: 500, statusText: 'Server Error' });
      await settle();
      expect(service.detailFailed()).toBe(true);
      expect(service.detail()).toBeNull();

      service.reloadDetail();
      TestBed.tick();
      expectItems().flush(detail(BANKS));
      await settle();
      expect(service.detailFailed()).toBe(false);
      expect(service.detail()).toEqual(detail(BANKS));
    });

    it('cambiar la búsqueda de la lista no pide registros', async () => {
      await openAndLoad(BANKS);
      service.search.set('banco');
      await passDebounce();
      expectList().flush([BANKS]);
      await settle();
      expectNoItems();
    });
  });
});
