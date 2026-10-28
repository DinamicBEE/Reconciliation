import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SKIP_HTTP_ERROR_ALERT } from '../../../core/interceptors/http-error-alert.interceptor';
import { CaptureBatchResult, SALES_MAX_PAGE_SIZE, SaleListItem, SalesApiService, SalesListPage } from './sales-api.service';

// `environment.apiUrl` es '' en desarrollo/pruebas: las rutas son relativas.
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

function page(pageNumber: number, ids: number[], total: number, pageSize = SALES_MAX_PAGE_SIZE): SalesListPage {
  return { data: ids.map(item), total, page: pageNumber, pageSize };
}

const CAPTURE_RESULT: CaptureBatchResult = {
  status: 'OK',
  capturedCount: 2,
  insertedCount: 2,
  skippedCount: 0,
  failedCount: 0,
  capturedAmount: 200,
  dateFrom: '2026-10-20',
  dateTo: '2026-10-20',
  locationsRequested: 1,
  daysRequested: 1,
  declaredCount: 2,
  locations: [],
};

describe('SalesApiService', () => {
  let service: SalesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SalesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function expectList(): TestRequest {
    const req = httpMock.expectOne((r) => r.url === '/sales');
    expect(req.request.method).toBe('GET');
    return req;
  }

  describe('list', () => {
    it('hace GET /sales con todos los filtros y la paginación como query', () => {
      let result: SalesListPage | undefined;
      service
        .list({
          dateFrom: '2026-10-01',
          dateTo: '2026-10-20',
          store: 7,
          tenderMedia: 2,
          status: 10,
          search: 'A-1',
          page: 3,
          pageSize: 50,
        })
        .subscribe((r) => (result = r));

      const req = expectList();
      const params = req.request.params;
      expect(params.keys().sort()).toEqual(['dateFrom', 'dateTo', 'page', 'pageSize', 'search', 'status', 'store', 'tenderMedia']);
      expect(params.get('dateFrom')).toBe('2026-10-01');
      expect(params.get('dateTo')).toBe('2026-10-20');
      expect(params.get('store')).toBe('7');
      expect(params.get('tenderMedia')).toBe('2');
      expect(params.get('status')).toBe('10');
      expect(params.get('search')).toBe('A-1');
      expect(params.get('page')).toBe('3');
      expect(params.get('pageSize')).toBe('50');

      const body = page(3, [1, 2], 102, 50);
      req.flush(body);
      expect(result).toEqual(body);
    });

    it('omite los filtros undefined, null o vacíos', () => {
      service
        .list({ dateFrom: undefined, store: null as unknown as number, search: '', page: 1, pageSize: 10 })
        .subscribe();

      const req = expectList();
      expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);
      req.flush(page(1, [], 0, 10));
    });

    it('conserva el 0 como valor válido', () => {
      service.list({ store: 0 }).subscribe();
      const req = expectList();
      expect(req.request.params.get('store')).toBe('0');
      req.flush(page(1, [], 0));
    });

    it('sin parámetros no manda query', () => {
      service.list({}).subscribe();
      const req = expectList();
      expect(req.request.params.keys()).toEqual([]);
      expect(req.request.urlWithParams).toBe('/sales');
      req.flush(page(1, [], 0));
    });

    it('propaga los errores HTTP', () => {
      let status: number | undefined;
      service.list({}).subscribe({ error: (e: HttpErrorResponse) => (status = e.status) });
      expectList().flush(null, { status: 500, statusText: 'Server Error' });
      expect(status).toBe(500);
    });
  });

  describe('listAll', () => {
    it('recorre todas las páginas de 100 con los mismos filtros y concatena las filas', () => {
      let rows: SaleListItem[] | undefined;
      service.listAll({ store: 7, search: 'x' }).subscribe((r) => (rows = r));

      const first = expectList();
      expect(first.request.params.get('page')).toBe('1');
      expect(first.request.params.get('pageSize')).toBe(String(SALES_MAX_PAGE_SIZE));
      expect(first.request.params.get('store')).toBe('7');
      expect(first.request.params.get('search')).toBe('x');
      first.flush(page(1, [1, 2], 250));
      expect(rows).toBeUndefined();

      const second = expectList();
      expect(second.request.params.get('page')).toBe('2');
      expect(second.request.params.get('store')).toBe('7');
      second.flush(page(2, [3], 250));

      const third = expectList();
      expect(third.request.params.get('page')).toBe('3');
      third.flush(page(3, [4], 250));

      httpMock.expectNone((r) => r.url === '/sales');
      expect(rows?.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    });

    it('con una sola página no pide más', () => {
      let rows: SaleListItem[] | undefined;
      service.listAll({}).subscribe((r) => (rows = r));
      expectList().flush(page(1, [1], 1));
      expect(rows?.map((r) => r.id)).toEqual([1]);
    });

    it('sin resultados devuelve una lista vacía', () => {
      let rows: SaleListItem[] | undefined;
      service.listAll({}).subscribe((r) => (rows = r));
      expectList().flush(page(1, [], 0));
      expect(rows).toEqual([]);
    });

    it('se detiene justo cuando page × pageSize alcanza el total', () => {
      let rows: SaleListItem[] | undefined;
      service.listAll({}).subscribe((r) => (rows = r));
      expectList().flush(page(1, [1], 200));
      expectList().flush(page(2, [2], 200));
      expect(rows?.map((r) => r.id)).toEqual([1, 2]);
    });

    it('si falla una página intermedia emite el error y no entrega filas', () => {
      const next = vi.fn();
      let error: HttpErrorResponse | undefined;
      service.listAll({}).subscribe({ next, error: (e) => (error = e) });
      expectList().flush(page(1, [1], 300));
      expectList().flush(null, { status: 503, statusText: 'Unavailable' });

      expect(next).not.toHaveBeenCalled();
      expect(error?.status).toBe(503);
    });
  });

  describe('capture', () => {
    it('hace POST /sales/capture con el cuerpo y sin la alerta genérica de errores', () => {
      let result: CaptureBatchResult | undefined;
      service.capture({ ubicacionIds: [7], dateFrom: '2026-10-20' }).subscribe((r) => (result = r));

      const req = httpMock.expectOne('/sales/capture');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ubicacionIds: [7], dateFrom: '2026-10-20' });
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush(CAPTURE_RESULT);

      expect(result).toEqual(CAPTURE_RESULT);
    });

    it('propaga el 502 con el CaptureBatchResult en el cuerpo del error', () => {
      const body: CaptureBatchResult = { ...CAPTURE_RESULT, status: 'ERROR', insertedCount: 0 };
      let error: HttpErrorResponse | undefined;
      service.capture({ ubicacionIds: [7], dateFrom: '2026-10-20', dateTo: '2026-10-21' }).subscribe({
        error: (e) => (error = e),
      });

      const req = httpMock.expectOne('/sales/capture');
      expect(req.request.body).toEqual({ ubicacionIds: [7], dateFrom: '2026-10-20', dateTo: '2026-10-21' });
      req.flush(body, { status: 502, statusText: 'Bad Gateway' });

      expect(error?.status).toBe(502);
      expect(error?.error).toEqual(body);
    });
  });
});
