import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { SKIP_HTTP_ERROR_ALERT } from '../../../core/interceptors/http-error-alert.interceptor';
import {
  BANK_RESULTS_MAX_PAGE_SIZE,
  BankMatchItem,
  BankMatchResults,
  BankMatchSummary,
  BankReportApiService,
  BankReportImport,
  BankReportRead,
  ReconciliationConfirm,
  ReconciliationHeader,
  describeBankReportError,
  statementErrorResult,
  toReconciliationResult,
  toResultRow,
  toStatementResult,
} from './bank-report-api.service';

const BASE = `${environment.apiUrl}/reconciliation/bank-reports`;
const RECONCILIATIONS = `${environment.apiUrl}/reconciliation/reconciliations`;

const HEADER: ReconciliationHeader = {
  id: 11,
  code: 'CON-0011',
  store: { id: 10, name: 'Cóctel del Mar Chapinero' },
  periodStart: '2026-10-01',
  periodEnd: '2026-10-15',
  status: { code: 'por_conciliar', description: 'Por conciliar' },
  files: [{ fileId: 7, bank: 'BANCOLOMBIA', fileName: 'reporte.xlsx' }],
};

const SUMMARY: BankMatchSummary = {
  total: 3,
  matches: { count: 1, percent: 33.3 },
  differences: { count: 1, percent: 33.3 },
  unmatched: { count: 1, percent: 33.4 },
  toManage: { count: 2, percent: 66.7 },
};

function item(overrides: Partial<BankMatchItem> = {}): BankMatchItem {
  return {
    id: 1,
    date: '2026-10-02',
    reference: 'AUT-001',
    description: 'VISA',
    pos: 100,
    bank: 100,
    difference: 0,
    status: 'MATCH',
    rule: 'AUTH_DATE_AMOUNT',
    ...overrides,
  };
}

function read(overrides: Partial<BankReportRead> = {}): BankReportRead {
  return {
    bank: 'BANCOLOMBIA',
    fileName: 'reporte.xlsx',
    sheetName: 'Hoja1',
    transactions: 12,
    transactionDateFrom: '2026-10-01',
    transactionDateTo: '2026-10-15',
    duplicateTransactions: 0,
    totals: {
      purchase: 1000,
      tip: 50,
      vat: 190,
      consumptionTax: 0,
      total: 1240.5,
      commission: 20,
      withholdingTax: 0,
      withholdingVat: 0,
      withholdingIca: 0,
      net: 1220.5,
    },
    byDay: [],
    byEstablishment: [],
    byNetwork: [],
    problems: [],
    ...overrides,
  };
}

function page(pageNumber: number, data: BankMatchItem[], total: number, pageSize = BANK_RESULTS_MAX_PAGE_SIZE): BankMatchResults {
  return { reconciliation: HEADER, summary: SUMMARY, data, total, page: pageNumber, pageSize };
}

function httpError(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, error, url: BASE });
}

describe('BankReportApiService', () => {
  let service: BankReportApiService;
  let httpMock: HttpTestingController;
  const file = new File(['contenido'], 'reporte.xlsx', { type: 'application/vnd.ms-excel' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BankReportApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function expectFormWith(req: TestRequest): void {
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('bank')).toBe('BANCOLOMBIA');
    const sent = body.get('file') as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.name).toBe('reporte.xlsx');
  }

  describe('read', () => {
    it('hace POST multipart a /bank-reports/read con el banco y el archivo, sin alerta global', () => {
      let received: BankReportRead | undefined;
      service.read('BANCOLOMBIA', file).subscribe((r) => (received = r));

      const req = httpMock.expectOne(`${BASE}/read`);
      expect(req.request.method).toBe('POST');
      expectFormWith(req);
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush(read());

      expect(received).toEqual(read());
    });

    it('propaga el error del back', () => {
      let error: unknown;
      service.read('BANCOLOMBIA', file).subscribe({ error: (e) => (error = e) });

      httpMock.expectOne(`${BASE}/read`).flush({ detail: 'No es un reporte' }, { status: 400, statusText: 'Bad Request' });

      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(400);
    });
  });

  describe('uploadFile', () => {
    it('hace POST multipart a /reconciliations/{id}/files con el banco y el archivo, sin alerta global', () => {
      const response: BankReportImport = {
        fileId: 7,
        bank: 'BANCOLOMBIA',
        fileName: 'reporte.xlsx',
        alreadyLoaded: false,
        transactionsRead: 12,
        inserted: 12,
        skipped: 0,
        transactionDateFrom: '2026-10-01',
        transactionDateTo: '2026-10-15',
        problems: [],
      };
      let received: BankReportImport | undefined;
      service.uploadFile('11', 'BANCOLOMBIA', file).subscribe((r) => (received = r));

      const req = httpMock.expectOne(`${RECONCILIATIONS}/11/files`);
      expect(req.request.method).toBe('POST');
      expectFormWith(req);
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush(response);

      expect(received).toEqual(response);
    });

    it('propaga el error del back', () => {
      let error: unknown;
      service.uploadFile('11', 'BANCOLOMBIA', file).subscribe({ error: (e) => (error = e) });

      httpMock.expectOne(`${RECONCILIATIONS}/11/files`).flush({ detail: 'Ya confirmada' }, { status: 409, statusText: 'Conflict' });

      expect((error as HttpErrorResponse).status).toBe(409);
    });
  });

  describe('match', () => {
    it('hace POST /reconciliations/{id}/match sin cuerpo y devuelve el resumen', () => {
      let received: BankMatchSummary | undefined;
      service.match('11').subscribe((r) => (received = r));

      const req = httpMock.expectOne(`${RECONCILIATIONS}/11/match`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush(SUMMARY);

      expect(received).toEqual(SUMMARY);
    });
  });

  describe('results', () => {
    it('hace GET /reconciliations/{id}/results con página y tamaño, y trae el encabezado', () => {
      let received: BankMatchResults | undefined;
      service.results('11', 3, 20).subscribe((r) => (received = r));

      const req = httpMock.expectOne((r) => r.url === `${RECONCILIATIONS}/11/results`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('3');
      expect(req.request.params.get('pageSize')).toBe('20');
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush(page(3, [], 0, 20));

      expect(received?.reconciliation).toEqual(HEADER);
    });

    it('por defecto pide la página 1 con el tamaño máximo (100)', () => {
      service.results('11').subscribe();

      const req = httpMock.expectOne((r) => r.url === `${RECONCILIATIONS}/11/results`);
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe(String(BANK_RESULTS_MAX_PAGE_SIZE));
      expect(BANK_RESULTS_MAX_PAGE_SIZE).toBe(100);
      req.flush(page(1, [], 0));
    });
  });

  describe('allResults', () => {
    const resultsReq = (pageNumber: number) =>
      httpMock.expectOne((r) => r.url === `${RECONCILIATIONS}/11/results` && r.params.get('page') === String(pageNumber));

    it('con una sola página devuelve su resumen y sus filas sin pedir más', () => {
      let received: { summary: BankMatchSummary; items: BankMatchItem[] } | undefined;
      service.allResults('11').subscribe((r) => (received = r));

      resultsReq(1).flush(page(1, [item({ id: 1 }), item({ id: 2 })], 2));

      expect(received).toEqual({ summary: SUMMARY, items: [item({ id: 1 }), item({ id: 2 })] });
      httpMock.expectNone((r) => r.url === `${RECONCILIATIONS}/11/results`);
    });

    it('sin filas devuelve una lista vacía con el resumen', () => {
      let received: { summary: BankMatchSummary; items: BankMatchItem[] } | undefined;
      service.allResults('11').subscribe((r) => (received = r));

      resultsReq(1).flush(page(1, [], 0));

      expect(received).toEqual({ summary: SUMMARY, items: [] });
    });

    it('un pageSize 0 se trata como una sola página', () => {
      let received: { summary: BankMatchSummary; items: BankMatchItem[] } | undefined;
      service.allResults('11').subscribe((r) => (received = r));

      resultsReq(1).flush(page(1, [item()], 500, 0));

      expect(received?.items).toHaveLength(1);
      httpMock.expectNone((r) => r.url === `${RECONCILIATIONS}/11/results`);
    });

    it('pide el resto de páginas en paralelo y las une en orden aunque lleguen desordenadas', () => {
      let received: { summary: BankMatchSummary; items: BankMatchItem[] } | undefined;
      service.allResults('11').subscribe((r) => (received = r));

      resultsReq(1).flush(page(1, [item({ id: 1 })], 250));
      const second = resultsReq(2);
      const third = resultsReq(3);
      expect(received).toBeUndefined();

      third.flush(page(3, [item({ id: 3 })], 250));
      second.flush(page(2, [item({ id: 2 })], 250));

      expect(received?.summary).toEqual(SUMMARY);
      expect(received?.items.map((i) => i.id)).toEqual([1, 2, 3]);
    });

    it('si falla una página propaga el error', () => {
      let error: unknown;
      service.allResults('11').subscribe({ error: (e) => (error = e) });

      resultsReq(1).flush(page(1, [item()], 150));
      resultsReq(2).flush({ detail: 'Falla' }, { status: 500, statusText: 'Server Error' });

      expect((error as HttpErrorResponse).status).toBe(500);
    });
  });

  describe('confirm', () => {
    const confirmation: ReconciliationConfirm = {
      reconciliation: { ...HEADER, status: { code: 'conciliado', description: 'Conciliado' } },
      summary: SUMMARY,
      reconciledSales: 40,
      differenceSales: 3,
      unmatchedSales: 2,
    };

    it('hace POST /reconciliations/{id}/confirm sin cuerpo ni alerta global y devuelve cómo quedaron las ventas', () => {
      let received: ReconciliationConfirm | undefined;
      service.confirm('11').subscribe((r) => (received = r));

      const req = httpMock.expectOne(`${RECONCILIATIONS}/11/confirm`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      expect(req.request.context.get(SKIP_HTTP_ERROR_ALERT)).toBe(true);
      req.flush(confirmation);

      expect(received).toEqual(confirmation);
    });

    it('propaga el 409 de una conciliación ya confirmada', () => {
      let error: unknown;
      service.confirm('11').subscribe({ error: (e) => (error = e) });

      httpMock.expectOne(`${RECONCILIATIONS}/11/confirm`).flush({ detail: 'Ya confirmada' }, { status: 409, statusText: 'Conflict' });

      expect((error as HttpErrorResponse).status).toBe(409);
    });
  });
});

describe('toStatementResult', () => {
  it('un reporte con transacciones y sin problemas es válido y resume total y fechas', () => {
    expect(toStatementResult(read())).toEqual({
      state: 'valid',
      summary: { totalRecords: 12, totalAmount: 1240.5, dateFrom: '2026-10-01', dateTo: '2026-10-15' },
      reason: null,
      missingColumns: [],
      invalidRows: [],
    });
  });

  it('con filas problemáticas queda en "missing_fields" y lista cada fila con su mensaje', () => {
    const result = toStatementResult(
      read({
        problems: [
          { row: 4, message: 'Fecha ilegible' },
          { row: 9, message: 'Total no cuadra' },
        ],
      }),
    );

    expect(result.state).toBe('missing_fields');
    expect(result.summary).toEqual({ totalRecords: 12, totalAmount: 1240.5, dateFrom: '2026-10-01', dateTo: '2026-10-15' });
    expect(result.reason).toBe('Hay filas ilegibles o que no cuadran.');
    expect(result.invalidRows).toEqual([
      { row: 4, fields: ['Fecha ilegible'] },
      { row: 9, fields: ['Total no cuadra'] },
    ]);
  });

  it('sin transacciones es inválido y conserva las filas problemáticas', () => {
    const result = toStatementResult(read({ transactions: 0, problems: [{ row: 2, message: 'Vacía' }] }));

    expect(result).toEqual({
      state: 'invalid',
      summary: null,
      reason: 'El archivo no trae transacciones.',
      missingColumns: [],
      invalidRows: [{ row: 2, fields: ['Vacía'] }],
    });
  });

  it('sin rango de fechas es inválido aunque traiga transacciones', () => {
    expect(toStatementResult(read({ transactionDateFrom: null })).state).toBe('invalid');
    expect(toStatementResult(read({ transactionDateTo: null })).state).toBe('invalid');
  });
});

describe('statementErrorResult', () => {
  it('un 400 es inválido y usa el detalle del back', () => {
    expect(statementErrorResult(httpError(400, { detail: 'Faltan columnas' }))).toEqual({
      state: 'invalid',
      summary: null,
      reason: 'Faltan columnas',
      missingColumns: [],
      invalidRows: [],
    });
  });

  it('un 400 sin detalle usa el mensaje por defecto', () => {
    expect(statementErrorResult(httpError(400)).reason).toBe('El archivo no es un reporte del banco legible.');
  });

  it('otro error HTTP queda en "error" con el detalle del back', () => {
    const result = statementErrorResult(httpError(500, { detail: 'Servicio caído' }));

    expect(result.state).toBe('error');
    expect(result.reason).toBe('Servicio caído');
    expect(result.summary).toBeNull();
  });

  it('un detalle que no es texto se ignora', () => {
    expect(statementErrorResult(httpError(500, { detail: { code: 1 } })).reason).toBe('No se pudo leer el archivo.');
  });

  it('un error que no es HTTP queda en "error" con el mensaje por defecto', () => {
    expect(statementErrorResult(new Error('boom'))).toMatchObject({ state: 'error', reason: 'No se pudo leer el archivo.' });
  });
});

describe('toResultRow', () => {
  it('una coincidencia trae POS y un movimiento del banco con la franquicia como canal', () => {
    const row = toResultRow(item({ id: 5, reference: 'AUT-5', pos: 120, bank: 120 }), 'Bancolombia');

    expect(row).toEqual({
      id: '5',
      date: '2026-10-02',
      reference: 'AUT-5',
      tenderMedia: null,
      channel: 'VISA',
      pos: { reference: 'AUT-5', amount: 120, concept: 'VISA', paymentMethod: 'VISA' },
      bank: [{ id: 'banco-5', date: '2026-10-02', reference: 'AUT-5', amount: 120, concept: 'VISA', paymentMethod: 'VISA' }],
      candidates: [],
      difference: 0,
      comment: 'Coincide por autorización, fecha e importe.',
      status: 'coincide',
    });
  });

  it('sin descripción el canal es el nombre del banco y el concepto queda vacío', () => {
    const row = toResultRow(item({ description: null }), 'Bancolombia');

    expect(row.channel).toBe('Bancolombia');
    expect(row.pos).toMatchObject({ concept: '', paymentMethod: 'Bancolombia' });
    expect(row.bank[0]).toMatchObject({ concept: '', paymentMethod: 'Bancolombia' });
  });

  it('una descripción vacía también cae al nombre del banco', () => {
    expect(toResultRow(item({ description: '' }), 'Bancolombia').channel).toBe('Bancolombia');
  });

  it('mapea cada estado del back al de la tabla', () => {
    expect(toResultRow(item({ status: 'MATCH' }), 'B').status).toBe('coincide');
    expect(toResultRow(item({ status: 'DIFFERENCE' }), 'B').status).toBe('diferencia');
    expect(toResultRow(item({ status: 'UNMATCHED' }), 'B').status).toBe('sin_coincidencia');
  });

  it('un estado desconocido se trata como sin coincidencia', () => {
    const unknown = item({ status: 'OTRO' as BankMatchItem['status'] });

    expect(toResultRow(unknown, 'B').status).toBe('sin_coincidencia');
  });

  it('solo en el banco: sin POS, con el movimiento y comentario de que no hay venta', () => {
    const row = toResultRow(item({ pos: null, bank: 80, difference: null, status: 'UNMATCHED', rule: null }), 'B');

    expect(row.pos).toBeNull();
    expect(row.bank).toHaveLength(1);
    expect(row.difference).toBe(-80);
    expect(row.comment).toBe('Solo está en el banco: no hay venta con esa autorización.');
  });

  it('solo en el POS: sin movimientos del banco y comentario de que el banco no lo reporta', () => {
    const row = toResultRow(item({ pos: 80, bank: null, difference: null, status: 'UNMATCHED', rule: null }), 'B');

    expect(row.pos).not.toBeNull();
    expect(row.bank).toEqual([]);
    expect(row.difference).toBe(80);
    expect(row.comment).toBe('Solo está en el POS: el banco no reporta ese pago.');
  });

  it('usa la diferencia del back si viene; si no, POS menos banco a 2 decimales', () => {
    expect(toResultRow(item({ pos: 100, bank: 90, difference: 7 }), 'B').difference).toBe(7);
    expect(toResultRow(item({ pos: 100.1, bank: 90.2, difference: null }), 'B').difference).toBe(9.9);
  });

  it('traduce las reglas conocidas y muestra tal cual una regla nueva', () => {
    expect(toResultRow(item({ rule: 'AUTH_DATE' }), 'B').comment).toBe('Misma autorización y fecha, pero el importe es distinto.');
    expect(toResultRow(item({ rule: 'AUTH_AMOUNT_NEAR_DATE' }), 'B').comment).toBe(
      'Misma autorización e importe, pero la fecha es distinta.',
    );
    expect(toResultRow(item({ rule: 'STORE_DATE_AMOUNT' }), 'B').comment).toBe('Coincide por tienda, fecha e importe.');
    expect(toResultRow(item({ rule: 'REGLA_NUEVA' }), 'B').comment).toBe('REGLA_NUEVA');
  });

  it('sin regla y emparejada no lleva comentario', () => {
    expect(toResultRow(item({ rule: null, status: 'DIFFERENCE' }), 'B').comment).toBe('');
  });
});

describe('toReconciliationResult', () => {
  const items = [
    item({ id: 1, pos: 100, bank: 100, status: 'MATCH' }),
    item({ id: 2, pos: 50.1, bank: 40.05, difference: 10.05, status: 'DIFFERENCE' }),
    item({ id: 3, pos: null, bank: 20.2, difference: null, status: 'UNMATCHED', rule: null }),
  ];

  it('usa el total y los porcentajes del back en las tarjetas', () => {
    const result = toReconciliationResult(SUMMARY, items, 'Bancolombia');

    expect(result.total).toBe(3);
    expect(result.kpis).toEqual({
      coincidencias: { count: 1, percentage: 33.3 },
      diferencias: { count: 1, percentage: 33.3 },
      sinCoincidencias: { count: 1, percentage: 33.4 },
    });
  });

  it('suma los montos de cada lado (el lado ausente cuenta 0) a 2 decimales', () => {
    expect(toReconciliationResult(SUMMARY, items, 'Bancolombia').totals).toEqual({ pos: 150.1, bank: 160.25 });
  });

  it('convierte cada fila en el mismo orden', () => {
    const result = toReconciliationResult(SUMMARY, items, 'Bancolombia');

    expect(result.rows.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(result.rows.map((r) => r.status)).toEqual(['coincide', 'diferencia', 'sin_coincidencia']);
  });

  it('sin filas los totales son 0', () => {
    const result = toReconciliationResult({ ...SUMMARY, total: 0 }, [], 'Bancolombia');

    expect(result.totals).toEqual({ pos: 0, bank: 0 });
    expect(result.rows).toEqual([]);
  });
});

describe('describeBankReportError', () => {
  it('un 403 explica que falta el permiso import_settlements', () => {
    expect(describeBankReportError(httpError(403, { detail: 'Forbidden' }))).toBe(
      'Tu cuenta no tiene el permiso para cargar reportes del banco (import_settlements).',
    );
  });

  it('un status 0 es un problema de conexión', () => {
    expect(describeBankReportError(httpError(0))).toBe('No se pudo conectar con el servidor. Intenta de nuevo.');
  });

  it('otro error HTTP usa el detalle del back', () => {
    expect(describeBankReportError(httpError(409, { detail: 'El archivo ya se está procesando' }))).toBe(
      'El archivo ya se está procesando',
    );
  });

  it('sin detalle o con un error que no es HTTP usa el mensaje genérico', () => {
    const generic = 'No se pudo procesar el reporte del banco. Intenta de nuevo.';
    expect(describeBankReportError(httpError(500))).toBe(generic);
    expect(describeBankReportError(new Error('boom'))).toBe(generic);
  });
});
