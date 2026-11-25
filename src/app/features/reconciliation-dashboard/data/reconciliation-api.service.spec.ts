import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { SKIP_HTTP_ERROR_ALERT } from '../../../core/interceptors/http-error-alert.interceptor';
import {
  ReconciliationApiService,
  ReconciliationDto,
  ReconciliationListPage,
  describeCreateReconciliationError,
  reconciliationCode,
  toReconciliationRun,
} from './reconciliation-api.service';

const URL = `${environment.apiUrl}/reconciliations`;

function dto(overrides: Partial<ReconciliationDto> = {}): ReconciliationDto {
  return {
    id: 42,
    createdAt: '2026-10-01T15:30:00Z',
    company: { id: 1, name: 'Coctel del Mar' },
    store: { id: 10, name: 'Cóctel del Mar Chapinero' },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    status: { id: 1, code: 'por_conciliar', description: 'Por conciliar' },
    comments: 'En espera del extracto bancario.',
    salesCount: 290,
    ...overrides,
  };
}

function httpError(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error, url: URL });
}

describe('ReconciliationApiService', () => {
  let service: ReconciliationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReconciliationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('hace GET /reconciliations con los filtros y devuelve la página tal cual', () => {
      const page: ReconciliationListPage = { data: [dto()], total: 1, page: 2, pageSize: 20 };
      let received: ReconciliationListPage | undefined;

      service
        .list({ status: 2, createdFrom: '2026-09-01', createdTo: '2026-09-30', page: 2, pageSize: 20 })
        .subscribe((p) => (received = p));

      const req = httpMock.expectOne((r) => r.url === URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('status')).toBe('2');
      expect(req.request.params.get('createdFrom')).toBe('2026-09-01');
      expect(req.request.params.get('createdTo')).toBe('2026-09-30');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('20');
      req.flush(page);

      expect(received).toEqual(page);
    });

    it('solo manda los parámetros con valor', () => {
      service
        .list({ status: undefined, createdFrom: '', createdTo: null as unknown as string, page: 1, pageSize: 10 })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === URL);
      expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });

    it('sin filtros no manda parámetros', () => {
      service.list({}).subscribe();

      const req = httpMock.expectOne((r) => r.url === URL);
      expect(req.request.params.keys()).toEqual([]);
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });
  });

  describe('create', () => {
    it('hace POST /reconciliations con el cuerpo y devuelve la conciliación creada', () => {
      const body = { store: 10, periodStart: '2026-09-01', periodEnd: '2026-09-15', comments: 'Hola' };
      let created: ReconciliationDto | undefined;

      service.create(body).subscribe((r) => (created = r));

      const req = httpMock.expectOne(URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush(dto(), { status: 201, statusText: 'Created' });

      expect(created).toEqual(dto());
    });

    it('omite la alerta genérica de errores HTTP (SKIP_HTTP_ERROR_ALERT)', () => {
      service.create({ store: 10, periodStart: '2026-09-01', periodEnd: '2026-09-15' }).subscribe({ error: () => {} });

      const req = httpMock.expectOne(URL);
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush({ detail: 'x' }, { status: 409, statusText: 'Conflict' });
    });

    it('propaga el HttpErrorResponse a quien se suscribe', () => {
      let error: unknown;
      service.create({ store: 10, periodStart: '2026-09-01', periodEnd: '2026-09-15' }).subscribe({ error: (e) => (error = e) });

      httpMock.expectOne(URL).flush({ detail: 'Sin ventas' }, { status: 409, statusText: 'Conflict' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(409);
    });
  });
});

describe('toReconciliationRun', () => {
  it('convierte la conciliación del backend en la fila de la tabla', () => {
    expect(toReconciliationRun(dto({ code: 'CON-0042' }))).toEqual({
      id: '42',
      code: 'CON-0042',
      createdAt: '2026-10-01T15:30:00Z',
      companyName: 'Coctel del Mar',
      storeName: 'Cóctel del Mar Chapinero',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
      status: 'pendiente',
      comments: 'En espera del extracto bancario.',
      salesCount: 290,
    });
  });

  it('traduce cada código de estado del catálogo', () => {
    const statusOf = (code: string) => toReconciliationRun(dto({ status: { id: 9, code, description: '' } })).status;

    expect(statusOf('por_conciliar')).toBe('pendiente');
    expect(statusOf('conciliado')).toBe('conciliado');
    expect(statusOf('desconciliado')).toBe('desconciliado');
  });

  it('un código de estado desconocido queda pendiente', () => {
    expect(toReconciliationRun(dto({ status: { id: 9, code: 'en_revision', description: '' } })).status).toBe('pendiente');
  });

  it('comentarios null quedan como cadena vacía', () => {
    expect(toReconciliationRun(dto({ comments: null })).comments).toBe('');
  });

  it('usa el código que manda el backend tal cual', () => {
    expect(toReconciliationRun(dto({ id: 42, code: 'CON-9999' })).code).toBe('CON-9999');
  });

  it('sin código del backend lo arma con el id', () => {
    expect(toReconciliationRun(dto({ id: 7, code: undefined })).code).toBe('CON-0007');
  });

  it('ignora filesCount y matched: no forman parte de la fila', () => {
    const run = toReconciliationRun(dto({ filesCount: 2, matched: true }));

    expect('filesCount' in run).toBe(false);
    expect('matched' in run).toBe(false);
  });
});

describe('reconciliationCode', () => {
  it('antepone CON- y rellena el id a 4 dígitos', () => {
    expect(reconciliationCode(2)).toBe('CON-0002');
    expect(reconciliationCode(42)).toBe('CON-0042');
  });

  it('acepta el id en texto', () => {
    expect(reconciliationCode('11')).toBe('CON-0011');
  });

  it('no recorta un id de más de 4 dígitos', () => {
    expect(reconciliationCode(12345)).toBe('CON-12345');
  });
});

describe('describeCreateReconciliationError', () => {
  it('409 con detail es una advertencia con el texto del backend', () => {
    expect(describeCreateReconciliationError(httpError(409, { detail: 'No hay ventas en el periodo.' }))).toEqual({
      level: 'warning',
      text: 'No hay ventas en el periodo.',
    });
  });

  it('409 sin detail es una advertencia con el texto por defecto', () => {
    expect(describeCreateReconciliationError(httpError(409))).toEqual({
      level: 'warning',
      text: 'No hay ventas en ese periodo o alguna ya está en otra conciliación.',
    });
  });

  it('409 con detail que no es texto usa el texto por defecto', () => {
    expect(describeCreateReconciliationError(httpError(409, { detail: { code: 1 } })).text).toBe(
      'No hay ventas en ese periodo o alguna ya está en otra conciliación.',
    );
  });

  it('403 avisa que falta el permiso create_reconciliation, aunque traiga detail', () => {
    expect(describeCreateReconciliationError(httpError(403, { detail: 'Forbidden' }))).toEqual({
      level: 'error',
      text: 'Tu cuenta no tiene el permiso para crear conciliaciones (create_reconciliation).',
    });
  });

  it('status 0 avisa que no hay conexión con el servidor', () => {
    expect(describeCreateReconciliationError(httpError(0))).toEqual({
      level: 'error',
      text: 'No se pudo conectar con el servidor. Intenta de nuevo.',
    });
  });

  it('otro status con detail muestra el detail como error', () => {
    expect(describeCreateReconciliationError(httpError(400, { detail: 'El periodo es inválido.' }))).toEqual({
      level: 'error',
      text: 'El periodo es inválido.',
    });
  });

  it('otro status sin detail da el error genérico', () => {
    expect(describeCreateReconciliationError(httpError(500, 'boom'))).toEqual({
      level: 'error',
      text: 'No se pudo crear la conciliación. Intenta de nuevo.',
    });
  });

  it('un error que no es HTTP da el error genérico', () => {
    expect(describeCreateReconciliationError(new Error('x'))).toEqual({
      level: 'error',
      text: 'No se pudo crear la conciliación. Intenta de nuevo.',
    });
    expect(describeCreateReconciliationError(undefined).level).toBe('error');
  });
});
