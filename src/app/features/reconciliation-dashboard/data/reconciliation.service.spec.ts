import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { ReconciliationStatusOption, SalesCatalogService } from '../../sales-dashboard/data/sales-catalog.service';
import { ReconciliationDto, ReconciliationListPage } from './reconciliation-api.service';
import { ReconciliationRun } from './reconciliation-run.model';
import { ReconciliationRunsStore } from './reconciliation-runs.store';
import { ReconciliationService } from './reconciliation.service';

const URL = `${environment.apiUrl}/reconciliations`;

const STATUSES: ReconciliationStatusOption[] = [
  { id: 11, code: 'por_conciliar', description: 'Por conciliar' },
  { id: 12, code: 'conciliado', description: 'Conciliado' },
  { id: 13, code: 'desconciliado', description: 'Desconciliado' },
];

function dto(id: number, overrides: Partial<ReconciliationDto> = {}): ReconciliationDto {
  return {
    id,
    createdAt: '2026-10-01T15:30:00Z',
    company: { id: 1, name: 'Coctel del Mar' },
    store: { id: 10, name: 'Cóctel del Mar Chapinero' },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    status: { id: 12, code: 'conciliado', description: 'Conciliado' },
    comments: null,
    salesCount: 100 + id,
    ...overrides,
  };
}

function listPage(data: ReconciliationDto[], total = data.length): ReconciliationListPage {
  return { data, total, page: 1, pageSize: 10 };
}

describe('ReconciliationService', () => {
  let httpMock: HttpTestingController;
  let service: ReconciliationService;
  let store: ReconciliationRunsStore;
  let statuses: WritableSignal<readonly ReconciliationStatusOption[]>;
  let ensureLoaded: ReturnType<typeof vi.fn>;
  let permissions: string[];

  // Publica la respuesta del resource (microtarea) y deja correr el planificador.
  async function settle(): Promise<void> {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
  }

  function expectList(): TestRequest {
    TestBed.tick();
    const req = httpMock.expectOne((r) => r.url === URL && r.method === 'GET');
    return req;
  }

  function paramsOf(req: TestRequest): Record<string, string | null> {
    const params = req.request.params;
    return Object.fromEntries(params.keys().map((key) => [key, params.get(key)]));
  }

  // Responde una petición de la lista y deja que el resource la publique.
  async function respond(req: TestRequest, page: ReconciliationListPage = listPage([])): Promise<void> {
    req.flush(page);
    await settle();
  }

  // Crea el servicio y responde la primera petición (sin filtros).
  async function start(page: ReconciliationListPage = listPage([dto(1), dto(2)])): Promise<void> {
    service = TestBed.inject(ReconciliationService);
    store = TestBed.inject(ReconciliationRunsStore);
    await respond(expectList(), page);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    statuses = signal<readonly ReconciliationStatusOption[]>(STATUSES);
    ensureLoaded = vi.fn();
    permissions = ['view_dashboard', 'view_reconciliation'];

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ReconciliationService,
        { provide: SalesCatalogService, useValue: { reconciliationStatuses: statuses, ensureLoaded } },
        { provide: AccessControlService, useValue: { hasPermission: (key: string) => permissions.includes(key) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  describe('carga inicial', () => {
    it('pide la página 1 de 10 sin filtros y mientras tanto está cargando', async () => {
      service = TestBed.inject(ReconciliationService);
      const req = expectList();

      expect(paramsOf(req)).toEqual({ page: '1', pageSize: '10' });
      expect(service.loading()).toBe(true);
      expect(service.runs()).toEqual([]);
      expect(service.total()).toBe(0);

      await respond(req, listPage([dto(1)], 37));

      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
      expect(service.total()).toBe(37);
    });

    it('expone las filas convertidas a ReconciliationRun', async () => {
      await start(listPage([dto(7, { comments: null, status: { id: 11, code: 'por_conciliar', description: '' } })]));

      expect(service.runs()).toEqual<ReconciliationRun[]>([
        {
          id: '7',
          code: 'CON-0007',
          createdAt: '2026-10-01T15:30:00Z',
          companyName: 'Coctel del Mar',
          storeName: 'Cóctel del Mar Chapinero',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-15',
          status: 'pendiente',
          comments: '',
          salesCount: 107,
        },
      ]);
    });

    it('guarda en el store lo recibido para la comparativa y el proceso', async () => {
      await start();

      expect(store.find('1')).toMatchObject({ id: '1', salesCount: 101 });
      expect(store.find('2')).toMatchObject({ id: '2', salesCount: 102 });
    });

    it('con view_dashboard pide el catálogo de estados', () => {
      TestBed.inject(ReconciliationService);

      expect(ensureLoaded).toHaveBeenCalledTimes(1);
      expectList().flush(listPage([]));
    });

    it('sin view_dashboard no pide el catálogo de estados', () => {
      permissions = ['view_reconciliation'];

      TestBed.inject(ReconciliationService);

      expect(ensureLoaded).not.toHaveBeenCalled();
      expectList().flush(listPage([]));
    });
  });

  describe('filtro de estatus', () => {
    it.each([
      ['pendiente', '11'],
      ['conciliado', '12'],
      ['desconciliado', '13'],
    ] as const)('%s manda el id del catálogo (%s)', async (filter, id) => {
      await start();

      service.setStatusFilter(filter);

      expect(paramsOf(expectList())).toEqual({ status: id, page: '1', pageSize: '10' });
    });

    it.each([
      ['pendiente', '1'],
      ['conciliado', '2'],
      ['desconciliado', '3'],
    ] as const)('sin catálogo, %s usa el id de respaldo %s', async (filter, id) => {
      statuses.set([]);
      await start();

      service.setStatusFilter(filter);

      expect(expectList().request.params.get('status')).toBe(id);
    });

    it('si el catálogo llega después, vuelve a pedir con el id del catálogo', async () => {
      statuses.set([]);
      await start();
      service.setStatusFilter('conciliado');
      await respond(expectList());

      statuses.set(STATUSES);

      expect(expectList().request.params.get('status')).toBe('12');
    });

    it("'all' quita el parámetro status", async () => {
      await start();
      service.setStatusFilter('conciliado');
      await respond(expectList());

      service.setStatusFilter('all');

      expect(paramsOf(expectList())).toEqual({ page: '1', pageSize: '10' });
    });
  });

  describe('filtro de fechas de creación', () => {
    it('manda createdFrom/createdTo como días locales yyyy-MM-dd', async () => {
      await start();

      // Horas extremas: con `toISOString()` cruzarían de día según la zona.
      service.setDateRange([new Date(2026, 8, 2, 0, 5), new Date(2026, 8, 9, 23, 55)]);

      expect(paramsOf(expectList())).toEqual({
        createdFrom: '2026-09-02',
        createdTo: '2026-09-09',
        page: '1',
        pageSize: '10',
      });
    });

    it('combina estatus y fechas', async () => {
      await start();
      service.setStatusFilter('pendiente');
      service.setDateRange([new Date(2026, 9, 1), new Date(2026, 9, 31)]);

      expect(paramsOf(expectList())).toEqual({
        status: '11',
        createdFrom: '2026-10-01',
        createdTo: '2026-10-31',
        page: '1',
        pageSize: '10',
      });
    });

    it('al limpiar el rango deja de mandar las fechas', async () => {
      await start();
      service.setDateRange([new Date(2026, 8, 2), new Date(2026, 8, 9)]);
      await respond(expectList());

      service.setDateRange(null);

      expect(paramsOf(expectList())).toEqual({ page: '1', pageSize: '10' });
    });
  });

  describe('paginación', () => {
    it('setPage pide esa página con el mismo tamaño', async () => {
      await start();

      service.setPage(3);

      expect(service.page()).toBe(3);
      expect(paramsOf(expectList())).toEqual({ page: '3', pageSize: '10' });
    });

    it('setPageSize cambia el tamaño y vuelve a la página 1', async () => {
      await start();
      service.setPage(3);
      await respond(expectList());

      service.setPageSize(20);

      expect(service.page()).toBe(1);
      expect(paramsOf(expectList())).toEqual({ page: '1', pageSize: '20' });
    });

    it('cambiar el estatus vuelve a la página 1', async () => {
      await start();
      service.setPage(4);
      await respond(expectList());

      service.setStatusFilter('desconciliado');

      expect(service.page()).toBe(1);
      expect(paramsOf(expectList())).toEqual({ status: '13', page: '1', pageSize: '10' });
    });

    it('cambiar el rango de fechas vuelve a la página 1', async () => {
      await start();
      service.setPage(2);
      await respond(expectList());

      service.setDateRange([new Date(2026, 8, 2), new Date(2026, 8, 9)]);

      expect(service.page()).toBe(1);
      expect(expectList().request.params.get('page')).toBe('1');
    });

    it('volver a fijar el mismo filtro no reinicia la página ni repite la petición', async () => {
      await start();
      service.setStatusFilter('conciliado');
      await respond(expectList());
      service.setPage(2);
      await respond(expectList());

      service.setStatusFilter('conciliado');
      TestBed.tick();

      expect(service.page()).toBe(2);
      httpMock.expectNone((r) => r.url === URL);
    });
  });

  describe('reload y errores', () => {
    it('reload repite la petición con los mismos parámetros', async () => {
      await start();
      service.setPage(2);
      await respond(expectList());

      service.reload();

      expect(paramsOf(expectList())).toEqual({ page: '2', pageSize: '10' });
    });

    it('si la carga falla marca loadFailed y deja la tabla vacía', async () => {
      service = TestBed.inject(ReconciliationService);
      expectList().flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(service.loadFailed()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(service.runs()).toEqual([]);
      expect(service.total()).toBe(0);
    });

    it('reintentar tras un fallo carga los datos y limpia loadFailed', async () => {
      service = TestBed.inject(ReconciliationService);
      expectList().flush(null, { status: 0, statusText: 'Unknown Error' });
      await settle();

      service.reload();
      await respond(expectList(), listPage([dto(5)]));

      expect(service.loadFailed()).toBe(false);
      expect(service.runs().map((r) => r.id)).toEqual(['5']);
    });
  });

  describe('setDateRange', () => {
    beforeEach(() => start());

    it('conserva un rango completo', async () => {
      const range: [Date, Date] = [new Date(2026, 8, 2), new Date(2026, 8, 9)];

      service.setDateRange(range);

      expect(service.dateRange()).toBe(range);
      await respond(expectList());
    });

    it('normaliza [undefined, undefined] (botón "x" del range-picker) a null', async () => {
      service.setDateRange([new Date(2026, 8, 2), new Date(2026, 8, 9)]);
      await respond(expectList());

      service.setDateRange([undefined, undefined] as unknown as [Date, Date]);

      expect(service.dateRange()).toBeNull();
      await respond(expectList());
    });

    it('normaliza un rango a medias (un extremo vacío) a null', () => {
      service.setDateRange([new Date(2026, 8, 2), undefined] as unknown as [Date, Date]);
      expect(service.dateRange()).toBeNull();

      service.setDateRange([undefined, new Date(2026, 8, 2)] as unknown as [Date, Date]);
      expect(service.dateRange()).toBeNull();
    });

    it('null se queda en null', () => {
      service.setDateRange(null);

      expect(service.dateRange()).toBeNull();
    });
  });

  describe('create', () => {
    beforeEach(() => start());

    const input = { storeId: 10, periodStart: '2026-10-01', periodEnd: '2026-10-15' };

    it('hace POST /reconciliations solo con la tienda y el periodo (sin comments)', () => {
      service.create(input).subscribe();

      const req = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
      expect(req.request.body).toEqual({ store: 10, periodStart: '2026-10-01', periodEnd: '2026-10-15' });
      expect('comments' in req.request.body).toBe(false);
      req.flush(dto(50));
    });

    it('la conciliación creada trae el código del backend o, si falta, el armado con su id', () => {
      const codes: string[] = [];
      service.create(input).subscribe((run) => codes.push(run.code));
      httpMock.expectOne((r) => r.url === URL && r.method === 'POST').flush(dto(50, { code: 'CON-0050' }));
      service.create(input).subscribe((run) => codes.push(run.code));
      httpMock.expectOne((r) => r.url === URL && r.method === 'POST').flush(dto(51));

      expect(codes).toEqual(['CON-0050', 'CON-0051']);
    });

    it('devuelve la conciliación creada, la guarda en el store y no recarga la tabla', () => {
      let created: ReconciliationRun | undefined;
      service.create(input).subscribe((run) => (created = run));

      httpMock
        .expectOne((r) => r.url === URL && r.method === 'POST')
        .flush(dto(50, { status: { id: 11, code: 'por_conciliar', description: '' }, salesCount: 3 }));
      TestBed.tick();

      expect(created).toMatchObject({ id: '50', status: 'pendiente', salesCount: 3 });
      expect(store.find('50')).toEqual(created);
      httpMock.expectNone((r) => r.url === URL && r.method === 'GET');
    });

    it('si el backend rechaza, propaga el error y no toca el store', () => {
      let error: unknown;
      service.create(input).subscribe({ error: (e) => (error = e) });

      httpMock
        .expectOne((r) => r.url === URL && r.method === 'POST')
        .flush({ detail: 'Sin ventas' }, { status: 409, statusText: 'Conflict' });

      expect(error).toBeTruthy();
      expect(store.find('50')).toBeNull();
    });
  });

  describe('markDesconciliado', () => {
    it('marca la corrida en el store y la tabla la muestra desconciliada', async () => {
      await start();
      const [first, second] = service.runs();

      service.markDesconciliado(first);

      expect(store.find(first.id)?.status).toBe('desconciliado');
      expect(service.runs().map((r) => r.status)).toEqual(['desconciliado', second.status]);
    });
  });
});
