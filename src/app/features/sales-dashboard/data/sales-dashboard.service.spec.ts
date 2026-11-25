import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  CaptureBatchResult,
  SaleDetail,
  SaleListItem,
  SalesApiService,
  SalesListPage,
  SalesListParams,
} from './sales-api.service';
import { SALES_PAGE_SIZE_OPTIONS, SalesDashboardService } from './sales-dashboard.service';

const DEBOUNCE_MS = 300;

function item(id: number): SaleListItem {
  return {
    id,
    folio: `A-${id}`,
    documentType: 'INVOICE',
    date: '2026-10-20',
    time: null,
    store: { id: 7, name: 'Centro' },
    customer: null,
    tenderMedia: null,
    reconciliationStatus: { id: 10, code: 'por_conciliar', description: 'Por conciliar' },
    subtotal: 1,
    taxes: 0,
    total: 1,
  };
}

function detail(id: number): SaleDetail {
  return {
    id,
    folio: `A-${id}`,
    documentType: 'INVOICE',
    date: '2026-10-20',
    time: '13:45:00',
    store: { id: 7, name: 'Centro' },
    reconciliationStatus: { id: 10, code: 'por_conciliar', description: 'Por conciliar' },
    reference: null,
    customer: null,
    fiscal: null,
    lines: [],
    payments: [],
    adjustments: null,
    taxes: [],
    breakdown: null,
  };
}

const PAGE: SalesListPage = { data: [item(1), item(2)], total: 42, page: 1, pageSize: 10 };

const NO_FILTERS = {
  dateFrom: undefined,
  dateTo: undefined,
  store: undefined,
  status: undefined,
  tenderMedia: undefined,
  search: undefined,
};

describe('SalesDashboardService', () => {
  let service: SalesDashboardService;
  let api: {
    list: ReturnType<typeof vi.fn<(params: SalesListParams) => Observable<SalesListPage>>>;
    listAll: ReturnType<typeof vi.fn>;
    capture: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn<(id: number) => Observable<SaleDetail>>>;
  };

  beforeEach(() => {
    // `debounceTime` usa temporizadores: se controlan con los de Vitest.
    vi.useFakeTimers();
    api = {
      list: vi.fn(() => of(PAGE)),
      listAll: vi.fn(() => of([item(1)])),
      capture: vi.fn(),
      detail: vi.fn((id: number) => of(detail(id))),
    };
    TestBed.configureTestingModule({
      providers: [SalesDashboardService, { provide: SalesApiService, useValue: api }],
    });
    service = TestBed.inject(SalesDashboardService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  // Propaga los signals a `toObservable` y deja correr el debounce.
  function flushQuery(): void {
    TestBed.tick();
    vi.advanceTimersByTime(DEBOUNCE_MS);
  }

  const lastParams = () => api.list.mock.calls.at(-1)![0];

  describe('consulta inicial', () => {
    it('pide la página 1 con el tamaño por defecto y sin filtros', () => {
      flushQuery();
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(lastParams()).toEqual({ ...NO_FILTERS, page: 1, pageSize: SALES_PAGE_SIZE_OPTIONS[0] });
    });

    it('no consulta antes de que pase el debounce', () => {
      TestBed.tick();
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
      expect(api.list).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it('publica filas y total de la respuesta', () => {
      flushQuery();
      expect(service.rows()).toEqual(PAGE.data);
      expect(service.total()).toBe(42);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('está cargando mientras la respuesta no llega', () => {
      const response = new Subject<SalesListPage>();
      api.list.mockReturnValue(response);
      flushQuery();
      expect(service.loading()).toBe(true);

      response.next(PAGE);
      expect(service.loading()).toBe(false);
      expect(service.rows()).toEqual(PAGE.data);
    });

    it('si falla marca loadFailed y vacía la tabla', () => {
      flushQuery();
      api.list.mockReturnValue(throwError(() => new Error('500')));
      service.reload();
      flushQuery();

      expect(service.loadFailed()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(service.rows()).toEqual([]);
      expect(service.total()).toBe(0);
    });

    it('una consulta correcta posterior limpia loadFailed', () => {
      api.list.mockReturnValueOnce(throwError(() => new Error('500')));
      flushQuery();
      expect(service.loadFailed()).toBe(true);

      service.reload();
      flushQuery();
      expect(service.loadFailed()).toBe(false);
      expect(service.rows()).toEqual(PAGE.data);
    });
  });

  describe('filtros', () => {
    beforeEach(() => flushQuery());

    it('traduce tienda, estado y medio de pago a sus ids y vuelve a la página 1', () => {
      service.setPage(3);
      service.setStoreFilter(7);
      service.setStatusFilter(10);
      service.setTenderMediaFilter(2);
      flushQuery();

      expect(api.list).toHaveBeenCalledTimes(2);
      expect(lastParams()).toEqual({ ...NO_FILTERS, store: 7, status: 10, tenderMedia: 2, page: 1, pageSize: 10 });
    });

    it('"all" no viaja al backend', () => {
      service.setStoreFilter(7);
      service.setStoreFilter('all');
      service.setStatusFilter('all');
      service.setTenderMediaFilter('all');
      expect(service.filters()).toEqual(NO_FILTERS);
    });

    it('el rango de fechas viaja como yyyy-MM-dd en hora local', () => {
      service.setDateRange([new Date(2026, 9, 1, 23, 30), new Date(2026, 9, 20)]);
      flushQuery();
      expect(lastParams()).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-20', page: 1 });
    });

    it('un rango con huecos (botón "x" del picker) se normaliza a sin rango', () => {
      service.setDateRange([new Date(2026, 9, 1), new Date(2026, 9, 2)]);
      service.setDateRange([undefined, undefined] as unknown as [Date, Date]);
      expect(service.dateRange()).toBeNull();
      expect(service.filters().dateFrom).toBeUndefined();
      expect(service.filters().dateTo).toBeUndefined();
    });

    it('la búsqueda se recorta y vacía no se envía', () => {
      service.setSearch('  Ana  ');
      expect(service.filters().search).toBe('Ana');
      service.setSearch('   ');
      expect(service.filters().search).toBeUndefined();
    });

    it('teclear rápido dispara una sola consulta con el último texto', () => {
      for (const text of ['A', 'An', 'Ana']) {
        service.setSearch(text);
        TestBed.tick();
        vi.advanceTimersByTime(100);
      }
      expect(api.list).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(DEBOUNCE_MS);
      expect(api.list).toHaveBeenCalledTimes(2);
      expect(lastParams()).toMatchObject({ search: 'Ana', page: 1 });
    });

    it('el filtro de empresa no viaja al backend pero vuelve a la página 1', () => {
      service.setPage(2);
      flushQuery();
      service.setSubsidiariaFilter(5);
      flushQuery();

      expect(service.subsidiariaFilter()).toBe(5);
      expect(lastParams()).toEqual({ ...NO_FILTERS, page: 1, pageSize: 10 });
      expect('subsidiaria' in lastParams()).toBe(false);
    });
  });

  describe('paginación', () => {
    beforeEach(() => flushQuery());

    it('cambiar de página conserva filtros y tamaño', () => {
      service.setStoreFilter(7);
      service.setPage(4);
      flushQuery();
      expect(lastParams()).toMatchObject({ store: 7, page: 4, pageSize: 10 });
    });

    it('cambiar el tamaño de página vuelve a la página 1', () => {
      service.setPage(4);
      service.setPageSize(50);
      flushQuery();
      expect(lastParams()).toMatchObject({ page: 1, pageSize: 50 });
    });
  });

  describe('cancelación y recarga', () => {
    it('una consulta nueva cancela la anterior y descarta su respuesta tardía', () => {
      const first = new Subject<SalesListPage>();
      const second = new Subject<SalesListPage>();
      api.list.mockReturnValueOnce(first).mockReturnValueOnce(second);

      flushQuery();
      service.setPage(2);
      flushQuery();
      expect(first.observed).toBe(false);

      first.next({ ...PAGE, data: [item(99)] });
      expect(service.rows()).toEqual([]);

      second.next({ ...PAGE, page: 2 });
      expect(service.rows()).toEqual(PAGE.data);
    });

    it('reload repite la misma consulta', () => {
      flushQuery();
      service.setStoreFilter(7);
      flushQuery();
      const before = lastParams();

      service.reload();
      flushQuery();
      expect(api.list).toHaveBeenCalledTimes(3);
      expect(lastParams()).toEqual(before);
    });
  });

  describe('exportación', () => {
    it('pide todas las filas con los filtros actuales, sin paginación', () => {
      service.setStoreFilter(7);
      service.setSearch(' x ');
      let rows: SaleListItem[] | undefined;
      service.exportRows().subscribe((r) => (rows = r));

      expect(api.listAll).toHaveBeenCalledWith({ ...NO_FILTERS, store: 7, search: 'x' });
      expect(rows).toEqual([item(1)]);
    });
  });

  describe('reproceso', () => {
    it('sin rango de fechas no hay objetivo', () => {
      service.setStoreFilter(7);
      expect(service.reprocessTarget()).toBeNull();
    });

    it('con todas las tiendas no hay objetivo', () => {
      service.setDateRange([new Date(2026, 9, 20), new Date(2026, 9, 20)]);
      expect(service.reprocessTarget()).toBeNull();
    });

    it('con un rango de varios días no hay objetivo', () => {
      service.setStoreFilter(7);
      service.setDateRange([new Date(2026, 9, 19), new Date(2026, 9, 20)]);
      expect(service.reprocessTarget()).toBeNull();
    });

    it('un solo día (aunque cambie la hora) y una tienda definen el objetivo', () => {
      const day = new Date(2026, 9, 20, 0, 0);
      service.setStoreFilter(7);
      service.setDateRange([day, new Date(2026, 9, 20, 23, 59)]);
      expect(service.reprocessTarget()).toEqual({ date: day, storeId: 7 });
    });

    it('reprocessDay hace la captura de esa tienda y ese día', () => {
      const result = { status: 'OK' } as CaptureBatchResult;
      api.capture.mockReturnValue(of(result));
      let received: CaptureBatchResult | undefined;

      service.reprocessDay({ date: new Date(2026, 9, 5), storeId: 7 }).subscribe((r) => (received = r));

      expect(api.capture).toHaveBeenCalledWith({ ubicacionIds: [7], dateFrom: '2026-10-05' });
      expect(received).toBe(result);
    });
  });

  describe('detalle', () => {
    it('openSale y closeSale controlan la venta seleccionada', () => {
      expect(service.selectedSale()).toBeNull();
      service.openSale(item(5));
      expect(service.selectedSale()).toEqual(item(5));
      service.closeSale();
      expect(service.selectedSale()).toBeNull();
    });
  });

  describe('detalle de la venta (GET /sales/{id})', () => {
    // Publica la respuesta del resource (microtarea) y deja correr el planificador.
    async function settle(): Promise<void> {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();
    }

    it('sin venta abierta no pide el detalle y no hay carga ni error', async () => {
      await settle();

      expect(api.detail).not.toHaveBeenCalled();
      expect(service.saleDetail()).toBeNull();
      expect(service.saleDetailLoading()).toBe(false);
      expect(service.saleDetailFailed()).toBe(false);
    });

    it('al abrir una venta pide su detalle por id y lo publica', async () => {
      service.openSale(item(5));
      await settle();

      expect(api.detail).toHaveBeenCalledExactlyOnceWith(5);
      expect(service.saleDetail()).toEqual(detail(5));
      expect(service.saleDetailLoading()).toBe(false);
      expect(service.saleDetailFailed()).toBe(false);
    });

    it('mientras llega está cargando y el detalle es null', async () => {
      const response = new Subject<SaleDetail>();
      api.detail.mockReturnValue(response);
      service.openSale(item(5));
      await settle();

      expect(service.saleDetailLoading()).toBe(true);
      expect(service.saleDetail()).toBeNull();

      response.next(detail(5));
      response.complete();
      await settle();

      expect(service.saleDetailLoading()).toBe(false);
      expect(service.saleDetail()?.id).toBe(5);
    });

    it('si falla marca saleDetailFailed y el detalle queda en null', async () => {
      api.detail.mockReturnValue(throwError(() => new Error('500')));
      service.openSale(item(5));
      await settle();

      expect(service.saleDetailFailed()).toBe(true);
      expect(service.saleDetail()).toBeNull();
      expect(service.saleDetailLoading()).toBe(false);
    });

    it('reloadSaleDetail vuelve a pedir el detalle y limpia el error si responde', async () => {
      api.detail.mockReturnValueOnce(throwError(() => new Error('500')));
      service.openSale(item(5));
      await settle();
      expect(service.saleDetailFailed()).toBe(true);

      service.reloadSaleDetail();
      await settle();

      expect(api.detail).toHaveBeenCalledTimes(2);
      expect(api.detail).toHaveBeenLastCalledWith(5);
      expect(service.saleDetailFailed()).toBe(false);
      expect(service.saleDetail()).toEqual(detail(5));
    });

    it('si la respuesta es de otra venta (id distinto) no la muestra', async () => {
      api.detail.mockReturnValue(of(detail(99)));
      service.openSale(item(5));
      await settle();

      expect(service.saleDetail()).toBeNull();
    });

    it('al abrir otra venta pide su detalle y no muestra el de la anterior mientras llega', async () => {
      service.openSale(item(5));
      await settle();
      expect(service.saleDetail()?.id).toBe(5);

      const response = new Subject<SaleDetail>();
      api.detail.mockReturnValue(response);
      service.openSale(item(6));
      await settle();

      expect(api.detail).toHaveBeenLastCalledWith(6);
      expect(service.saleDetail()).toBeNull();

      response.next(detail(6));
      await settle();

      expect(service.saleDetail()?.id).toBe(6);
    });

    it('una respuesta tardía de la venta anterior no pisa a la abierta', async () => {
      const first = new Subject<SaleDetail>();
      const second = new Subject<SaleDetail>();
      api.detail.mockReturnValueOnce(first).mockReturnValueOnce(second);
      service.openSale(item(5));
      await settle();
      service.openSale(item(6));
      await settle();

      second.next(detail(6));
      await settle();
      first.next(detail(5));
      await settle();

      expect(service.saleDetail()?.id).toBe(6);
    });

    it('al cerrar la venta el detalle vuelve a null sin pedir nada más', async () => {
      service.openSale(item(5));
      await settle();

      service.closeSale();
      await settle();

      expect(service.saleDetail()).toBeNull();
      expect(api.detail).toHaveBeenCalledTimes(1);
    });
  });
});
