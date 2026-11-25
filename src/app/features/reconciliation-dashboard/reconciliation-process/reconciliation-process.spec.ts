import { formatNumber } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Observable, Subject, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../../core/country/active-country';
import { MoneyPipe } from '../../../core/country/money.pipe';
import { PageHeaderService } from '../../../core/layout/header/page-header.service';
import { BankCatalogService, BankOption } from '../data/bank-catalog.service';
import {
  BankMatchItem,
  BankMatchSummary,
  BankReportApiService,
  BankReportImport,
  BankReportRead,
  BankMatchResults,
  ReconciliationConfirm,
  ReconciliationHeader,
  toResultRow,
} from '../data/bank-report-api.service';
import { ReconciliationBankMovement, ReconciliationResult, ReconciliationResultRow } from '../data/reconciliation-result.model';
import { MOCK_RECONCILIATION_RUNS } from '../data/reconciliation-runs.mock-data';
import { ReconciliationRunsStore } from '../data/reconciliation-runs.store';
import { LINE_ACTION_LABEL, LineResolution } from './line-detail/line-detail';
import { ReconciliationProcess } from './reconciliation-process';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xlsx(name = 'bancolombia_Reporte_Conciliar_20260702_20260706.xlsx', content = 'contenido'): File {
  return new File([content], name, { type: XLSX_TYPE });
}

const BANCOLOMBIA: BankOption = { id: 1, code: 'BANCOLOMBIA', name: 'Bancolombia' };
const OTHER_BANK: BankOption = { id: 2, code: 'OTRO', name: 'Otro Banco' };

// Vista previa del back (`POST /bank-reports/read`): por defecto, un reporte válido.
function readResponse(overrides: Partial<BankReportRead> = {}): BankReportRead {
  return {
    bank: 'BANCOLOMBIA',
    fileName: 'reporte.xlsx',
    sheetName: 'Hoja1',
    transactions: 12345,
    transactionDateFrom: '2026-07-02',
    transactionDateTo: '2026-07-06',
    duplicateTransactions: 0,
    totals: {
      purchase: 1200000,
      tip: 0,
      vat: 0,
      consumptionTax: 0,
      total: 1234567.5,
      commission: 0,
      withholdingTax: 0,
      withholdingVat: 0,
      withholdingIca: 0,
      net: 1234567.5,
    },
    byDay: [],
    byEstablishment: [],
    byNetwork: [],
    problems: [],
    ...overrides,
  };
}

const READ_VALID = readResponse();
const READ_MISSING_FIELDS = readResponse({
  problems: [
    { row: 3, message: 'VALOR TOTAL' },
    { row: 8, message: 'VALOR TOTAL, FECHA DE CANJE' },
  ],
});
const READ_EMPTY = readResponse({ transactions: 0, transactionDateFrom: null, transactionDateTo: null });

function httpError(status: number, detail?: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: detail === undefined ? null : { detail } });
}

// 400: el back no reconoce el archivo como reporte del banco.
const NOT_A_REPORT = httpError(400, 'No coincide con el formato del reporte de Bancolombia.');
const SERVER_ERROR = httpError(500);

const IMPORTED: BankReportImport = {
  fileId: 77,
  bank: 'BANCOLOMBIA',
  fileName: 'bancolombia_Reporte_Conciliar_20260702_20260706.xlsx',
  alreadyLoaded: false,
  transactionsRead: 4,
  inserted: 4,
  skipped: 0,
  transactionDateFrom: '2026-09-05',
  transactionDateTo: '2026-09-12',
  problems: [],
};

// Tarjetas del cruce: el total y los porcentajes vienen del back, no de las filas.
const SUMMARY: BankMatchSummary = {
  total: 1243,
  matches: { count: 1120, percent: 90.1 },
  differences: { count: 62, percent: 5 },
  unmatched: { count: 61, percent: 4.9 },
  toManage: { count: 123, percent: 9.9 },
};

function matchItem(
  id: number,
  reference: string,
  date: string,
  pos: number | null,
  bank: number | null,
  status: BankMatchItem['status'],
  description: string | null,
): BankMatchItem {
  return { id, date, reference, description, pos, bank, difference: null, status, rule: null };
}

// Una coincidencia, una diferencia, una solo POS (sin franquicia: el canal es el banco) y una solo banco.
const ITEMS: BankMatchItem[] = [
  matchItem(1, 'BBVA-0001', '2026-09-12', 2000, 2000, 'MATCH', 'VISA'),
  matchItem(2, 'CORTE-0827-02', '2026-09-10', 1234.5, 1200, 'DIFFERENCE', 'MASTERCARD'),
  matchItem(3, 'RAP-0001', '2026-09-08', 350, null, 'UNMATCHED', null),
  matchItem(4, 'DIDI-0001', '2026-09-05', null, 99.9, 'UNMATCHED', 'AMEX'),
];

// Filas tal como las arma el componente con `toResultRow` (ids '1'…'4').
const ROWS: ReconciliationResultRow[] = ITEMS.map((item) => toResultRow(item, BANCOLOMBIA.name));

const movement = (reference: string, amount: number, id = `M-${reference}`): ReconciliationBankMovement => ({
  id,
  date: '2026-09-10',
  reference,
  amount,
  concept: `Concepto ${reference}`,
  paymentMethod: 'Tarjeta',
});

// Ajuste de la línea con diferencia (POS 1234.50): dos movimientos que suman justo el POS.
const ADJUSTMENT: LineResolution = {
  rowId: ROWS[1].id,
  type: 'ajuste',
  comment: 'Ajuste verificado con el banco',
  movements: [movement('MOV-X1', 700), movement('MOV-X2', 534.5)],
};

// `n` líneas coincidentes (para probar la paginación a 10), con ids que no chocan con ITEMS.
function manyItems(n: number): BankMatchItem[] {
  return Array.from({ length: n }, (_, i) =>
    matchItem(100 + i, `R-${String(i + 1).padStart(2, '0')}`, '2026-09-01', 100 + i, 100 + i, 'MATCH', 'VISA'),
  );
}

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

// Encabezado de la conciliación 7 (la del store) tal como lo devuelve el back.
const HEADER_7: ReconciliationHeader = {
  id: 7,
  code: 'CON-0007',
  store: { id: 10, name: 'Cóctel del Mar Chapinero' },
  periodStart: '2026-09-01',
  periodEnd: '2026-09-15',
  status: { code: 'conciliado', description: 'Conciliado' },
  files: [{ fileId: 77, bank: 'BANCOLOMBIA', fileName: 'reporte.xlsx' }],
};

// Respuesta de `POST .../{id}/confirm`: cómo quedaron las ventas.
const CONFIRMATION: ReconciliationConfirm = {
  reconciliation: HEADER_7,
  summary: SUMMARY,
  reconciledSales: 40,
  differenceSales: 3,
  unmatchedSales: 2,
};

// Página mínima de `GET .../{id}/results` (la que pide el proceso para armar el encabezado).
function headerPage(header: ReconciliationHeader): BankMatchResults {
  return { reconciliation: header, summary: SUMMARY, data: [], total: 0, page: 1, pageSize: 1 };
}

const NOT_FOUND = httpError(404, 'La conciliación no existe.');

const PARENT = { label: 'Conciliación bancaria', path: '/conciliacion' };

describe('ReconciliationProcess', () => {
  let fixture: ComponentFixture<ReconciliationProcess>;
  let el: HTMLElement;
  let message: { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let banks: WritableSignal<readonly BankOption[]>;
  let banksLoading: WritableSignal<boolean>;
  let ensureBanks: Mock<() => void>;
  let bankReports: {
    read: Mock<(bank: string, file: File) => Observable<BankReportRead>>;
    uploadFile: Mock<(reconciliationId: string, bank: string, file: File) => Observable<BankReportImport>>;
    match: Mock<(reconciliationId: string) => Observable<BankMatchSummary>>;
    allResults: Mock<(reconciliationId: string) => Observable<{ summary: BankMatchSummary; items: BankMatchItem[] }>>;
    results: Mock<(reconciliationId: string, page?: number, pageSize?: number) => Observable<BankMatchResults>>;
    confirm: Mock<(reconciliationId: string) => Observable<ReconciliationConfirm>>;
  };
  // Carga del reporte en curso (paso 2): la responde `answer()` o la falla el test.
  let upload$: Subject<BankReportImport>;

  beforeEach(async () => {
    // Fake timers: el paso 2 usa `interval` (1 s) y el avance es determinista.
    vi.useFakeTimers();
    message = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
    banks = signal<readonly BankOption[]>([BANCOLOMBIA]);
    banksLoading = signal(false);
    ensureBanks = vi.fn();
    bankReports = {
      // Por defecto el reporte se lee como válido; cada test puede cambiarlo.
      read: vi.fn(() => of(READ_VALID)),
      uploadFile: vi.fn(() => (upload$ = new Subject<BankReportImport>())),
      match: vi.fn(() => of(SUMMARY)),
      allResults: vi.fn(() => of({ summary: SUMMARY, items: ITEMS })),
      // Solo se pide si el store no tiene la corrida; por defecto el back no la encuentra.
      results: vi.fn(() => throwError(() => NOT_FOUND)),
      confirm: vi.fn(() => of(CONFIRMATION)),
    };

    await TestBed.configureTestingModule({
      imports: [ReconciliationProcess],
      providers: [
        // Ruta hoja con título y padre, como `app.routes.ts`: el header los lee de `data`.
        provideRouter([{ path: 'proceso', children: [], data: { title: 'Nueva conciliación', parent: PARENT } }]),
        provideCountry(ACTIVE_COUNTRY),
        { provide: NzMessageService, useValue: message },
        { provide: BankReportApiService, useValue: bankReports },
        {
          provide: BankCatalogService,
          useValue: {
            banks: banks.asReadonly(),
            loading: banksLoading.asReadonly(),
            ensureLoaded: ensureBanks,
            find: (code: string | null | undefined) => banks().find((bank) => bank.code === code) ?? null,
          },
        },
        // El detalle de la línea (real) exige el permiso de gestión.
        { provide: AccessControlService, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
    // El store arranca vacío: se siembra con las corridas de ejemplo (p. ej. CON-0007).
    TestBed.inject(ReconciliationRunsStore).upsert(MOCK_RECONCILIATION_RUNS);

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/proceso');
    // Sin navegación real (onBack / routerLink).
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(ReconciliationProcess);
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Los steps de zorro se actualizan en una microtarea: segundo ciclo tras estabilizar.
  // Con fake timers se adelanta 0 ms (sin tocar el `interval` de la barra) hasta estabilizar.
  async function settle(): Promise<void> {
    fixture.detectChanges();
    let stable = false;
    const whenStable = fixture.whenStable().then(() => (stable = true));
    for (let i = 0; i < 20 && !stable; i++) await vi.advanceTimersByTimeAsync(0);
    await whenStable;
    fixture.detectChanges();
  }

  async function render(runId?: string): Promise<void> {
    if (runId !== undefined) fixture.componentRef.setInput('runId', runId);
    await settle();
  }

  // Elige el banco en el select "Banco o canal" (lo mismo que emite `nz-select` al cambiar).
  async function selectBank(code: string | null): Promise<void> {
    fixture.debugElement.query(By.css('nz-select#process-bank')).triggerEventHandler('ngModelChange', code);
    await settle();
  }

  // Abre la conciliación CON-0007 (pendiente) con el banco ya elegido, salvo `null`.
  async function renderRun(bankCode: string | null = BANCOLOMBIA.code): Promise<void> {
    await render('CON-0007');
    if (bankCode !== null) await selectBank(bankCode);
  }

  const steps = () => Array.from(el.querySelectorAll<HTMLElement>('nz-step'));
  // "Siguiente"/"Finalizar" es el botón primario del pie (en el paso 2 con
  // resultado, "Descargar" va antes).
  const nextButton = () => el.querySelector<HTMLButtonElement>('.process-footer button.ant-btn-primary')!;
  const footerButtons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.process-footer button'));
  const dropzoneRow = () => el.querySelector<HTMLElement>('.import-dropzone-row')!;
  const fileInput = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;
  const loadedBox = () => el.querySelector<HTMLElement>('.file-loaded');
  const sourceCard = () => el.querySelectorAll<HTMLElement>('.process-content nz-card')[0]!;
  const bankCard = () => el.querySelectorAll<HTMLElement>('.process-content nz-card')[1]!;
  const loading = () => el.querySelector<HTMLElement>('.statement-loading');
  const legend = () => el.querySelector<HTMLElement>('.status-legend');
  const reason = () => el.querySelector<HTMLElement>('.statement-result__reason');
  const statementRows = () =>
    Array.from(el.querySelectorAll<HTMLElement>('.statement-row')).map((row) => ({
      label: row.querySelector('dt')!.textContent!.trim(),
      value: row.querySelector('dd')!.textContent!.trim(),
    }));

  async function drop(file: File): Promise<void> {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    let dataTransfer: unknown;
    if (typeof DataTransfer !== 'undefined') {
      const dt = new DataTransfer();
      dt.items.add(file);
      dataTransfer = dt;
    } else {
      dataTransfer = { files: [file] };
    }
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    dropzoneRow().dispatchEvent(event);
    await settle();
  }

  async function pick(file: File): Promise<void> {
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  // Lectura que el test resuelve cuando quiere (para probar `reading()` y la carrera).
  function pendingRead(): Subject<BankReportRead> {
    const pending = new Subject<BankReportRead>();
    bankReports.read.mockReturnValueOnce(pending);
    return pending;
  }

  function resolveRead(pending: Subject<BankReportRead>, response: BankReportRead = READ_VALID): void {
    pending.next(response);
    pending.complete();
  }

  // El back termina la carga y el cruce del reporte enviado al entrar al paso 2.
  async function answer(items: BankMatchItem[] = ITEMS, summary: BankMatchSummary = SUMMARY): Promise<void> {
    bankReports.allResults.mockReturnValue(of({ summary, items }));
    upload$.next(IMPORTED);
    upload$.complete();
    await settle();
  }

  // Registra una acción en cada línea no coincidente y marca todas (habilita "Siguiente").
  async function markAllRows(): Promise<void> {
    const cmp = internals();
    for (const row of cmp.result()!.rows.filter((r) => r.status !== 'coincide')) {
      cmp.onLineResolved({ rowId: row.id, type: 'pendiente', comment: '' });
    }
    cmp.onCheckAll(true);
    await settle();
  }

  // Avanza hasta el paso `index` (base 0); responde la carga y marca las líneas si hay que pasar el paso 2.
  async function goToStep(index: number): Promise<void> {
    await drop(xlsx());
    for (let i = 0; i < index; i++) {
      nextButton().click();
      await settle();
      if (i === 0 && index > 1) {
        await answer();
        await markAllRows();
      }
    }
  }

  async function tick(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  }

  const gears = () => el.querySelector<SVGElement>('.gears');
  const validationTitle = () => el.querySelector('.validation__title')?.textContent?.trim();
  const validationSubtitles = () =>
    Array.from(el.querySelectorAll('.validation__subtitle')).map((n) => n.textContent!.trim());
  // Miembros `protected` del componente que los tests leen o invocan.
  interface Internals {
    validationProgress(): number;
    result(): ReconciliationResult | null;
    selectedIds(): ReadonlySet<string>;
    resolutions(): ReadonlyMap<string, LineResolution>;
    managing(): ReconciliationResultRow | null;
    allChecked(): boolean;
    indeterminate(): boolean;
    allRowsChecked(): boolean;
    onCheckAll(checked: boolean): void;
    onCheck(row: ReconciliationResultRow, checked: boolean): void;
    onLineResolved(resolution: LineResolution): void;
    openDetail(row: ReconciliationResultRow): void;
  }
  const internals = () => fixture.componentInstance as unknown as Internals;
  const bankSelect = () => el.querySelector<HTMLElement>('nz-select#process-bank')!;
  const notice = () => el.querySelector<HTMLElement>('.process-notice');
  const pageHeader = () => TestBed.inject(PageHeaderService).header();
  const progress = () => internals().validationProgress();

  describe('conciliación inexistente', () => {
    it('con un runId desconocido muestra el aviso y no pinta los steps', async () => {
      await render('CON-9999');

      expect(el.textContent).toContain('Esta conciliación no existe.');
      expect(el.querySelector('nz-steps')).toBeNull();
      expect(steps()).toHaveLength(0);
      expect(pageHeader()!.subtitle).toBeNull();
    });

    it('sin runId muestra el aviso y no pinta los steps', async () => {
      await render();

      expect(el.textContent).toContain('Esta conciliación no existe.');
      expect(el.querySelector('nz-steps')).toBeNull();
    });
  });

  describe('conciliación existente', () => {
    beforeEach(() => renderRun());

    it('no muestra el aviso de inexistente', () => {
      expect(el.textContent).not.toContain('Esta conciliación no existe.');
    });

    it('pinta los 3 steps con el primero activo', () => {
      expect(steps()).toHaveLength(3);
      expect(steps().map((s) => s.querySelector('.ant-steps-item-title')?.textContent?.trim())).toEqual([
        'Carga de archivos',
        'Validación',
        'Resultado',
      ]);
      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(steps()[1].classList.contains('ant-steps-item-wait')).toBeTruthy();
    });

    it('le entrega al header "código · restaurante · periodo" como subtítulo, con el título y el padre de la ruta', () => {
      expect(pageHeader()).toEqual({
        title: 'Nueva conciliación',
        subtitle: 'CON-0007 · Cóctel del Mar Chapinero · 01/09/2026 – 15/09/2026',
        parent: PARENT,
        actions: null,
      });
    });

    it('no pide el encabezado al back: la corrida ya está en el store', () => {
      expect(bankReports.results).not.toHaveBeenCalled();
    });

    it('no pinta su propio encabezado de página', () => {
      expect(el.querySelector('nz-page-header')).toBeNull();
      expect(el.querySelector('.ant-page-header-back-button')).toBeNull();
    });

    it('al destruirse quita su subtítulo del header y deja el de la ruta', () => {
      fixture.destroy();

      expect(pageHeader()).toMatchObject({ title: 'Nueva conciliación', subtitle: null, parent: PARENT });
    });
  });

  describe('paso 1 · banco o canal', () => {
    const cardTitle = () => norm(bankCard().querySelector('.process-source__title')?.textContent);

    it('pide el catálogo de bancos al crearse', async () => {
      await renderRun(null);

      expect(ensureBanks).toHaveBeenCalledTimes(1);
    });

    it('pinta el select "Banco o canal" habilitado, con su placeholder y sin banco elegido', async () => {
      await renderRun(null);

      expect(el.querySelector('label[for="process-bank"]')?.textContent?.trim()).toBe('Banco o canal');
      expect(bankSelect().textContent).toContain('Selecciona el banco del reporte');
      expect(bankSelect().classList.contains('ant-select-disabled')).toBe(false);
      expect(norm(sourceCard().querySelector('.process-source__subtitle')?.textContent)).toBe(
        'Un reporte por conciliación (.xlsx)',
      );
    });

    it('las opciones del select salen del catálogo de bancos', async () => {
      banks.set([BANCOLOMBIA, OTHER_BANK]);
      await renderRun(null);

      bankSelect().querySelector<HTMLElement>('.ant-select-selector')!.click();
      await settle();

      const options = Array.from(document.body.querySelectorAll('.ant-select-item-option')).map((o) => norm(o.textContent));
      expect(options).toEqual(['Bancolombia', 'Otro Banco']);
    });

    it('mientras carga el catálogo el select muestra que está cargando', async () => {
      banksLoading.set(true);
      await renderRun(null);

      expect(bankSelect().querySelector('.anticon-loading')).not.toBeNull();
    });

    it('sin banco el card pide elegirlo y no lee el archivo', async () => {
      await renderRun(null);

      expect(cardTitle()).toBe('Banco (reporte del banco)');
      expect(bankCard().textContent).toContain('Elige el banco y carga su reporte para ver su resumen.');

      await drop(xlsx());

      expect(bankReports.read).not.toHaveBeenCalled();
      expect(loadedBox()).not.toBeNull();
      expect(loading()).toBeNull();
      expect(legend()).toBeNull();
      expect(nextButton().disabled).toBe(true);
    });

    it('con banco el card toma su nombre y el texto inicial pide el reporte', async () => {
      await renderRun();

      expect(cardTitle()).toBe('Bancolombia (reporte del banco)');
      expect(bankCard().textContent).toContain('Carga el reporte del banco para ver su resumen.');
    });

    it('elegir el banco después del archivo lo lee con ese banco y habilita "Siguiente"', async () => {
      await renderRun(null);
      const file = xlsx();
      await drop(file);

      await selectBank(BANCOLOMBIA.code);

      expect(bankReports.read).toHaveBeenCalledExactlyOnceWith('BANCOLOMBIA', file);
      expect(legend()!.textContent!.trim()).toBe('Archivo válido');
      expect(nextButton().disabled).toBe(false);
    });

    it('cambiar de banco vuelve a leer el archivo ya elegido con el nuevo banco', async () => {
      banks.set([BANCOLOMBIA, OTHER_BANK]);
      await renderRun();
      const file = xlsx();
      await drop(file);

      await selectBank(OTHER_BANK.code);

      expect(bankReports.read).toHaveBeenCalledTimes(2);
      expect(bankReports.read).toHaveBeenLastCalledWith('OTRO', file);
      expect(cardTitle()).toBe('Otro Banco (reporte del banco)');
      expect(legend()!.textContent!.trim()).toBe('Archivo válido');
    });

    it('si la relectura con el nuevo banco falla, "Siguiente" queda deshabilitado', async () => {
      banks.set([BANCOLOMBIA, OTHER_BANK]);
      await renderRun();
      await drop(xlsx());
      expect(nextButton().disabled).toBe(false);

      bankReports.read.mockReturnValue(throwError(() => NOT_A_REPORT));
      await selectBank(OTHER_BANK.code);

      expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
      expect(nextButton().disabled).toBe(true);
    });

    it('cambiar de banco cancela la lectura en curso con el banco anterior', async () => {
      banks.set([BANCOLOMBIA, OTHER_BANK]);
      await renderRun();
      const first = pendingRead();
      await drop(xlsx());

      await selectBank(OTHER_BANK.code);

      expect(first.observed).toBe(false);
      expect(legend()!.textContent!.trim()).toBe('Archivo válido');
    });

    it('cambiar de banco sin archivo no lee nada', async () => {
      banks.set([BANCOLOMBIA, OTHER_BANK]);
      await renderRun();

      await selectBank(OTHER_BANK.code);

      expect(bankReports.read).not.toHaveBeenCalled();
    });

    it('quitar el banco descarta el resumen y deshabilita "Siguiente"', async () => {
      await renderRun();
      await drop(xlsx());
      expect(nextButton().disabled).toBe(false);

      await selectBank(null);

      expect(bankReports.read).toHaveBeenCalledTimes(1);
      expect(legend()).toBeNull();
      expect(statementRows()).toHaveLength(0);
      expect(bankCard().textContent).toContain('Elige el banco y carga su reporte para ver su resumen.');
      expect(nextButton().disabled).toBe(true);
    });

    it('un código que no está en el catálogo cuenta como sin banco', async () => {
      await renderRun('INEXISTENTE');
      await drop(xlsx());

      expect(bankReports.read).not.toHaveBeenCalled();
      expect(nextButton().disabled).toBe(true);
    });

    it('la carga va a la conciliación con el banco elegido y las filas sin franquicia toman su nombre', async () => {
      banks.set([BANCOLOMBIA, OTHER_BANK]);
      await renderRun(OTHER_BANK.code);
      const file = xlsx();
      await drop(file);

      nextButton().click();
      await settle();
      expect(bankReports.uploadFile).toHaveBeenCalledExactlyOnceWith('CON-0007', 'OTRO', file);

      await answer();
      expect(internals().result()!.rows[2].channel).toBe('Otro Banco');
    });
  });

  describe('conciliación ya confirmada', () => {
    beforeEach(() => render('CON-0001'));

    it('avisa que no admite más reportes y deshabilita el select de banco', () => {
      expect(norm(notice()?.textContent)).toBe('Esta conciliación ya está confirmada: no admite más reportes.');
      expect(bankSelect().classList.contains('ant-select-disabled')).toBe(true);
    });

    it('"Siguiente" queda deshabilitado aunque haya banco y un reporte válido', async () => {
      await selectBank(BANCOLOMBIA.code);
      await drop(xlsx());
      expect(legend()!.textContent!.trim()).toBe('Archivo válido');

      expect(nextButton().disabled).toBe(true);
      nextButton().click();
      await settle();

      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(bankReports.uploadFile).not.toHaveBeenCalled();
    });

    it('una conciliación pendiente no muestra el aviso', async () => {
      fixture.componentRef.setInput('runId', 'CON-0007');
      await settle();

      expect(notice()).toBeNull();
      expect(bankSelect().classList.contains('ant-select-disabled')).toBe(false);
    });
  });

  describe('conciliación que no está en el store (p. ej. tras recargar)', () => {
    const HEADER_11: ReconciliationHeader = {
      id: 11,
      code: 'CON-0011',
      store: { id: 20, name: 'Hipermar Fish H23E' },
      periodStart: '2026-10-01',
      periodEnd: '2026-10-15',
      status: { code: 'por_conciliar', description: 'Por conciliar' },
      files: [],
    };

    it('pide la página 1 de tamaño 1 de los resultados y arma la corrida con su encabezado', async () => {
      bankReports.results.mockReturnValue(of(headerPage(HEADER_11)));

      await render('11');

      expect(bankReports.results).toHaveBeenCalledExactlyOnceWith('11', 1, 1);
      expect(steps()).toHaveLength(3);
      expect(el.textContent).not.toContain('Esta conciliación no existe.');
      expect(pageHeader()!.subtitle).toBe('CON-0011 · Hipermar Fish H23E · 01/10/2026 – 15/10/2026');
      expect(notice()).toBeNull();
    });

    it('mientras llega el encabezado muestra "Cargando la conciliación…"', async () => {
      const pending = new Subject<BankMatchResults>();
      bankReports.results.mockReturnValue(pending);

      // Con la petición en vuelo la app no queda estable: se repinta sin esperar a `whenStable`.
      fixture.componentRef.setInput('runId', '11');
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(bankReports.results).toHaveBeenCalledWith('11', 1, 1);
      expect(el.textContent).toContain('Cargando la conciliación…');
      expect(el.textContent).not.toContain('Esta conciliación no existe.');
      expect(steps()).toHaveLength(0);

      pending.next(headerPage(HEADER_11));
      pending.complete();
      await settle();

      expect(el.textContent).not.toContain('Cargando la conciliación…');
      expect(steps()).toHaveLength(3);
    });

    it('si el back no la encuentra muestra el aviso de inexistente', async () => {
      await render('11');

      expect(bankReports.results).toHaveBeenCalledWith('11', 1, 1);
      expect(el.textContent).toContain('Esta conciliación no existe.');
      expect(el.textContent).not.toContain('Cargando la conciliación…');
      expect(steps()).toHaveLength(0);
    });

    it('un encabezado conciliado se muestra como conciliación confirmada', async () => {
      bankReports.results.mockReturnValue(of(headerPage({ ...HEADER_11, status: { code: 'conciliado', description: '' } })));

      await render('11');

      expect(norm(notice()?.textContent)).toBe('Esta conciliación ya está confirmada: no admite más reportes.');
      expect(bankSelect().classList.contains('ant-select-disabled')).toBe(true);
    });

    it('con la corrida armada del encabezado el reporte se carga en esa conciliación', async () => {
      bankReports.results.mockReturnValue(of(headerPage(HEADER_11)));
      await render('11');
      await selectBank(BANCOLOMBIA.code);
      const file = xlsx();
      await drop(file);

      nextButton().click();
      await settle();

      expect(bankReports.uploadFile).toHaveBeenCalledExactlyOnceWith('11', 'BANCOLOMBIA', file);
    });
  });

  describe('paso 1 · archivo bancario', () => {
    beforeEach(() => renderRun());

    it('"Siguiente" está deshabilitado sin archivo y no se muestra el indicador', () => {
      expect(nextButton().textContent).toContain('Siguiente');
      expect(nextButton().disabled).toBe(true);
      expect(loadedBox()).toBeNull();
    });

    it('el input solo acepta .xlsx', () => {
      expect(fileInput().accept).toContain('.xlsx');
      expect(fileInput().accept).not.toContain('.csv');
      expect(fileInput().accept).not.toContain('.txt');
    });

    describe('formato del archivo', () => {
      it('soltar un .xlsx lo manda a leer al back con el banco y muestra nombre, tamaño e indicador', async () => {
        const file = xlsx('banco-julio.xlsx', 'x'.repeat(2048));
        await drop(file);

        expect(bankReports.read).toHaveBeenCalledTimes(1);
        expect(bankReports.read).toHaveBeenCalledWith('BANCOLOMBIA', file);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('banco-julio.xlsx');
        expect(loadedBox()!.textContent).toContain('Archivo cargado correctamente');
        expect(loadedBox()!.textContent).toContain('2.0 KB');
        expect(message.error).not.toHaveBeenCalled();
      });

      it('leer el archivo no lo carga ni lo cruza todavía', async () => {
        await drop(xlsx());

        expect(bankReports.uploadFile).not.toHaveBeenCalled();
        expect(bankReports.match).not.toHaveBeenCalled();
      });

      it('elegir un .xlsx con el selector también lo lee', async () => {
        const file = xlsx('elegido.xlsx');
        await pick(file);

        expect(bankReports.read).toHaveBeenCalledWith('BANCOLOMBIA', file);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('elegido.xlsx');
        expect(nextButton().disabled).toBe(false);
      });

      it('la extensión .XLSX en mayúsculas también se acepta', async () => {
        await drop(xlsx('EXTRACTO.XLSX'));

        expect(bankReports.read).toHaveBeenCalledTimes(1);
        expect(message.error).not.toHaveBeenCalled();
      });

      it('soltar un .csv lo rechaza con aviso y no lo lee', async () => {
        await drop(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

        expect(message.error).toHaveBeenCalledTimes(1);
        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(bankReports.read).not.toHaveBeenCalled();
        expect(loadedBox()).toBeNull();
        expect(el.textContent).not.toContain('extracto.csv');
        expect(nextButton().disabled).toBe(true);
      });

      it('elegir un .csv con el selector también se rechaza', async () => {
        await pick(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(bankReports.read).not.toHaveBeenCalled();
        expect(loadedBox()).toBeNull();
        expect(nextButton().disabled).toBe(true);
      });

      it('soltar un .txt, un .xls o una imagen se rechaza', async () => {
        await drop(new File(['x'], 'extracto.txt', { type: 'text/plain' }));
        await drop(new File(['x'], 'extracto.xls', { type: 'application/vnd.ms-excel' }));
        await drop(new File(['x'], 'foto.png', { type: 'image/png' }));

        expect(message.error).toHaveBeenCalledTimes(3);
        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(bankReports.read).not.toHaveBeenCalled();
        expect(loadedBox()).toBeNull();
      });

      it('elegir una imagen con el selector también se rechaza', async () => {
        await pick(new File(['x'], 'foto.png', { type: 'image/png' }));

        expect(loadedBox()).toBeNull();
        expect(nextButton().disabled).toBe(true);
        expect(message.error).toHaveBeenCalledTimes(1);
      });

      it('un archivo rechazado no reemplaza al ya cargado ni a su resultado', async () => {
        await drop(xlsx('bueno.xlsx'));
        await drop(new File(['x'], 'extracto.csv', { type: 'text/csv' }));

        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('bueno.xlsx');
        expect(legend()!.textContent).toContain('Archivo válido');
        expect(bankReports.read).toHaveBeenCalledTimes(1);
        expect(nextButton().disabled).toBe(false);
      });

      it('soltar sin archivos no cambia nada', async () => {
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { files: [] } });
        dropzoneRow().dispatchEvent(event);
        fixture.detectChanges();

        expect(loadedBox()).toBeNull();
        expect(bankReports.read).not.toHaveBeenCalled();
        expect(message.error).not.toHaveBeenCalled();
      });
    });

    describe('card del reporte del banco', () => {
      it('antes de cargar solo muestra el encabezado y el texto inicial', () => {
        expect(bankCard().textContent).toContain('Bancolombia (reporte del banco)');
        expect(bankCard().textContent).toContain('Carga el reporte del banco para ver su resumen.');
        expect(loading()).toBeNull();
        expect(legend()).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(reason()).toBeNull();
      });

      it('archivo válido: muestra las 3 filas con valores formateados y la leyenda de éxito', async () => {
        await drop(xlsx());

        const expectedRecords = formatNumber(12345, ACTIVE_COUNTRY.locale);
        const expectedAmount = TestBed.runInInjectionContext(() => new MoneyPipe().transform(1234567.5));

        expect(expectedRecords).not.toBe('12345'); // lleva separador de miles
        expect(statementRows()).toEqual([
          { label: 'Total de registros', value: expectedRecords },
          { label: 'Total de movimientos', value: expectedAmount },
          { label: 'Rango de fechas', value: '02/07/2026 – 06/07/2026' },
        ]);
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(legend()!.classList.contains('status-legend-success')).toBe(true);
        expect(legend()!.classList.contains('status-legend-warning')).toBe(false);
        expect(legend()!.classList.contains('status-legend-error')).toBe(false);
        expect(reason()).toBeNull();
        expect(el.textContent).not.toContain('Carga el reporte del banco para ver su resumen.');
        expect(loading()).toBeNull();
        expect(nextButton().disabled).toBe(false);
      });

      it('archivo que el back rechaza (400): leyenda de error con el detalle del back, sin filas', async () => {
        bankReports.read.mockReturnValue(throwError(() => NOT_A_REPORT));
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(legend()!.classList.contains('status-legend-error')).toBe(true);
        expect(legend()!.classList.contains('status-legend-warning')).toBe(false);
        expect(legend()!.classList.contains('status-legend-success')).toBe(false);
        expect(reason()!.textContent!.trim()).toBe('No coincide con el formato del reporte de Bancolombia.');
        expect(el.querySelector('.statement-list')).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(el.textContent).not.toContain('Carga el reporte del banco para ver su resumen.');
        expect(nextButton().disabled).toBe(true);
        // El archivo sí se cargó (se ve su nombre); lo que falla es la revisión.
        expect(loadedBox()).not.toBeNull();
      });

      it('un 400 sin detalle usa el motivo por defecto', async () => {
        bankReports.read.mockReturnValue(throwError(() => httpError(400)));
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(reason()!.textContent!.trim()).toBe('El archivo no es un reporte del banco legible.');
      });

      it('un reporte sin transacciones es inválido', async () => {
        bankReports.read.mockReturnValue(of(READ_EMPTY));
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(reason()!.textContent!.trim()).toBe('El archivo no trae transacciones.');
        expect(statementRows()).toHaveLength(0);
        expect(nextButton().disabled).toBe(true);
      });

      it('filas con problemas: leyenda de advertencia, resumen y "Fila N: mensaje" por fila', async () => {
        bankReports.read.mockReturnValue(of(READ_MISSING_FIELDS));
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Campos faltantes');
        expect(legend()!.classList.contains('status-legend-warning')).toBe(true);
        expect(legend()!.classList.contains('status-legend-error')).toBe(false);
        expect(legend()!.classList.contains('status-legend-success')).toBe(false);
        expect(reason()!.textContent!.trim()).toBe('Hay filas ilegibles o que no cuadran.');
        expect(Array.from(el.querySelectorAll('ul.statement-list--warning li')).map((li) => li.textContent!.trim())).toEqual([
          'Fila 3: VALOR TOTAL',
          'Fila 8: VALOR TOTAL, FECHA DE CANJE',
        ]);
        expect(el.querySelector('ul.statement-list--error')).toBeNull();
        // El back sí resume lo legible del reporte.
        expect(statementRows()).toHaveLength(3);
        expect(nextButton().disabled).toBe(true);
      });

      it('error del servidor al leer: leyenda de error con el motivo y "Siguiente" deshabilitado', async () => {
        bankReports.read.mockReturnValue(throwError(() => SERVER_ERROR));
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Error en el archivo');
        expect(legend()!.classList.contains('status-legend-error')).toBe(true);
        expect(legend()!.classList.contains('status-legend-success')).toBe(false);
        expect(reason()!.textContent!.trim()).toBe('No se pudo leer el archivo.');
        expect(el.querySelector('.statement-list')).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(nextButton().disabled).toBe(true);
      });

      it('mientras se lee muestra el spinner y oculta resumen, leyenda y texto inicial', async () => {
        const pending = pendingRead();

        await drop(xlsx());

        expect(loading()).not.toBeNull();
        expect(loading()!.querySelector('nz-spin')).not.toBeNull();
        expect(loading()!.textContent).toContain('Revisando el archivo');
        expect(legend()).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(el.textContent).not.toContain('Carga el reporte del banco para ver su resumen.');
        expect(nextButton().disabled).toBe(true);
        // El archivo ya se ve cargado mientras se revisa.
        expect(loadedBox()).not.toBeNull();

        resolveRead(pending);
        await settle();

        expect(loading()).toBeNull();
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(statementRows()).toHaveLength(3);
        expect(nextButton().disabled).toBe(false);
      });

      it('si la lectura falla, el spinner desaparece y se ve la leyenda', async () => {
        const pending = pendingRead();
        await pick(xlsx());
        expect(loading()).not.toBeNull();

        pending.error(NOT_A_REPORT);
        await settle();

        expect(loading()).toBeNull();
        expect(legend()!.classList.contains('status-legend-error')).toBe(true);
      });

      it('cargar otro archivo descarta el resultado anterior y vuelve a mostrar el spinner', async () => {
        await drop(xlsx('primero.xlsx'));
        expect(nextButton().disabled).toBe(false);

        const pending = pendingRead();
        await drop(xlsx('segundo.xlsx'));

        expect(loading()).not.toBeNull();
        expect(legend()).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(nextButton().disabled).toBe(true);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('segundo.xlsx');

        pending.error(NOT_A_REPORT);
        await settle();

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(nextButton().disabled).toBe(true);
      });

      it('carrera: una carga nueva cancela la lectura anterior y gana la última', async () => {
        const first = pendingRead();
        const second = pendingRead();

        await drop(xlsx('primero.xlsx'));
        await drop(xlsx('segundo.xlsx'));

        // La primera petición se cancela al cargar la segunda.
        expect(first.observed).toBe(false);
        expect(second.observed).toBe(true);

        resolveRead(second);
        await settle();
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(loading()).toBeNull();

        first.error(NOT_A_REPORT); // llega tarde: no debe pisar al resultado vigente
        await settle();

        expect(bankReports.read).toHaveBeenCalledTimes(2);
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(statementRows()).toHaveLength(3);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('segundo.xlsx');
        expect(nextButton().disabled).toBe(false);
      });

      it('carrera: si la primera lectura responde antes que la segunda, se ignora y sigue el spinner', async () => {
        const first = pendingRead();
        const second = pendingRead();

        await drop(xlsx('primero.xlsx'));
        await drop(xlsx('segundo.xlsx'));

        resolveRead(first); // obsoleta: no debe pintarse ni habilitar "Siguiente"
        await settle();

        expect(loading()).not.toBeNull();
        expect(legend()).toBeNull();
        expect(nextButton().disabled).toBe(true);

        second.error(NOT_A_REPORT);
        await settle();

        expect(loading()).toBeNull();
        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(nextButton().disabled).toBe(true);
      });

      it('al destruir el componente se cancela la lectura en curso', async () => {
        const pending = pendingRead();
        await drop(xlsx());
        expect(pending.observed).toBe(true);

        fixture.destroy();

        expect(pending.observed).toBe(false);
      });
    });

    describe('dropzone', () => {
      it('arrastrar encima marca el dropzone y soltar lo desmarca', async () => {
        const button = el.querySelector<HTMLButtonElement>('.import-dropzone')!;
        dropzoneRow().dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
        fixture.detectChanges();
        expect(button.classList.contains('import-dropzone--over')).toBe(true);

        await drop(xlsx());
        expect(button.classList.contains('import-dropzone--over')).toBe(false);
      });

      it('al salir del contenedor con el cursor se desmarca el dropzone', () => {
        const button = el.querySelector<HTMLButtonElement>('.import-dropzone')!;
        dropzoneRow().dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
        fixture.detectChanges();

        dropzoneRow().dispatchEvent(new Event('dragleave', { bubbles: true }));
        fixture.detectChanges();

        expect(button.classList.contains('import-dropzone--over')).toBe(false);
      });
    });
  });

  describe('navegación entre pasos', () => {
    beforeEach(() => renderRun());

    it('"Siguiente" no avanza sin archivo en el paso 1', () => {
      nextButton().click();
      fixture.detectChanges();

      expect(el.querySelector('.import-dropzone')).not.toBeNull();
      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
    });

    it('"Siguiente" no avanza con un reporte inválido, con filas con problemas o con error', async () => {
      const responses: Observable<BankReportRead>[] = [
        throwError(() => NOT_A_REPORT),
        of(READ_MISSING_FIELDS),
        throwError(() => SERVER_ERROR),
      ];
      for (const response of responses) {
        bankReports.read.mockReturnValue(response);
        await drop(xlsx());

        nextButton().click();
        await settle();

        expect(el.querySelector('.import-dropzone')).not.toBeNull();
        expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
      }
      expect(bankReports.uploadFile).not.toHaveBeenCalled();
    });

    it('"Siguiente" no avanza mientras se revisa el archivo', async () => {
      pendingRead();
      await drop(xlsx());

      nextButton().click();
      await settle();

      expect(el.querySelector('.statement-loading')).not.toBeNull();
      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
    });

    it('con un extracto válido "Siguiente" avanza hasta "Finalizar"', async () => {
      await drop(xlsx());
      expect(nextButton().disabled).toBe(false);

      nextButton().click(); // paso 2 (validación)
      await settle();
      expect(el.querySelector('.import-dropzone')).toBeNull();
      expect(nextButton().textContent).toContain('Confirmar conciliación');

      await answer();
      await markAllRows();
      nextButton().click(); // paso 3
      await settle();

      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(nextButton().textContent).toContain('Finalizar');
      expect(nextButton().disabled).toBe(false);
    });

    it('avanza de uno en uno: paso 1, 2 y 3', async () => {
      await goToStep(0);
      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();

      nextButton().click();
      await settle();
      expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(steps()[0].classList.contains('ant-steps-item-finish')).toBeTruthy();

      await answer();
      await markAllRows();
      nextButton().click();
      await settle();

      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(steps()[1].classList.contains('ant-steps-item-finish')).toBeTruthy();
      expect(steps().filter((s) => s.classList.contains('ant-steps-item-process'))).toHaveLength(1);
    });

    it('el paso 3 "Resultado" muestra el resumen y ya no el espacio reservado', async () => {
      await goToStep(2);

      expect(el.querySelector('.import-dropzone')).toBeNull();
      expect(el.querySelector('.validation')).toBeNull();
      expect(el.querySelector('nz-table')).toBeNull();
      expect(el.querySelector('.completion')).not.toBeNull();
      expect(el.querySelector('.process-pending')).toBeNull();
      expect(el.textContent).not.toContain('Este paso está pendiente por definir.');
    });

    it('en el paso 3 el botón dice "Finalizar", con icono antes del label, y está habilitado', async () => {
      await goToStep(2);

      expect(nextButton().textContent).toContain('Finalizar');
      expect(nextButton().textContent).not.toContain('Siguiente');
      expect(nextButton().disabled).toBe(false);
      expect(nextButton().firstElementChild?.tagName.toLowerCase()).toBe('svg');
      expect(nextButton().classList.contains('ant-btn-primary')).toBe(true);
    });

    it('"Finalizar" navega a /conciliacion sin abrir el diálogo de confirmación', async () => {
      const confirm = vi.spyOn(fixture.debugElement.injector.get(NzModalService), 'confirm');
      await goToStep(2);
      expect(navigateByUrl).not.toHaveBeenCalled();

      nextButton().click();

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(navigateByUrl).toHaveBeenCalledWith('/conciliacion');
      expect(confirm).not.toHaveBeenCalled();
      // La guardia (canDeactivate) que se evalúa durante esa navegación ya no pregunta.
      expect(fixture.componentInstance.confirmLeave('/conciliacion')).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('no hay botón "Anterior"', async () => {
      await goToStep(2);

      const labels = Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
      expect(labels.some((l) => /anterior|atr[aá]s|volver/i.test(l))).toBe(false);
      expect(el.querySelectorAll('.process-footer button')).toHaveLength(1);
    });

    it('los steps no son clicables: clic en un step no cambia el paso', async () => {
      await goToStep(2);

      for (const index of [0, 1]) {
        const target =
          steps()[index].querySelector<HTMLElement>('.ant-steps-item-container') ?? steps()[index];
        target.click();
        await settle();

        expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
      }
      expect(steps().filter((s) => s.classList.contains('ant-steps-item-process'))).toHaveLength(1);
    });

    it('los steps no se anuncian como interactivos', () => {
      expect(el.querySelector('nz-steps .ant-steps-navigation')).toBeNull();
      for (const step of steps()) {
        expect(step.querySelector('[role="button"]')).toBeNull();
      }
    });
  });

  describe('paso 2 · validación (esperando al back)', () => {
    beforeEach(async () => {
      await renderRun();
      await goToStep(1);
    });

    const percentText = () => el.querySelector('.validation__progress .ant-progress-text')?.textContent?.trim();

    it('al entrar carga el reporte en la conciliación con el banco y el archivo; aún no cruza ni pide resultados', () => {
      expect(bankReports.uploadFile).toHaveBeenCalledTimes(1);
      expect(bankReports.uploadFile).toHaveBeenCalledWith('CON-0007', 'BANCOLOMBIA', expect.any(File));
      expect(bankReports.uploadFile.mock.calls[0][2].name).toBe('bancolombia_Reporte_Conciliar_20260702_20260706.xlsx');
      expect(bankReports.match).not.toHaveBeenCalled();
      expect(bankReports.allResults).not.toHaveBeenCalled();
    });

    it('tras la carga cruza la conciliación y pide todos sus resultados por su id', async () => {
      await answer();

      expect(bankReports.match).toHaveBeenCalledTimes(1);
      expect(bankReports.match).toHaveBeenCalledWith('CON-0007');
      expect(bankReports.allResults).toHaveBeenCalledTimes(1);
      expect(bankReports.allResults).toHaveBeenCalledWith('CON-0007');
    });

    it('arma el resultado con las tarjetas del back y las filas del cruce', async () => {
      await answer();

      const result = internals().result()!;
      expect(result.total).toBe(1243);
      expect(result.kpis.coincidencias).toEqual({ count: 1120, percentage: 90.1 });
      expect(result.totals).toEqual({ pos: 3584.5, bank: 3299.9 });
      expect(result.rows).toEqual(ROWS);
    });

    it('un reporte nuevo no muestra aviso', async () => {
      await answer();

      expect(message.info).not.toHaveBeenCalled();
    });

    it('si el reporte ya estaba cargado avisa y de todos modos lo cruza', async () => {
      upload$.next({ ...IMPORTED, alreadyLoaded: true });
      upload$.complete();
      await settle();

      expect(message.info).toHaveBeenCalledTimes(1);
      expect(message.info).toHaveBeenCalledWith(
        'Este reporte ya estaba cargado: se liga a la conciliación sin guardarlo otra vez.',
      );
      expect(bankReports.match).toHaveBeenCalledWith('CON-0007');
      expect(el.querySelector('.result-kpis')).not.toBeNull();
    });

    it('muestra engranes en movimiento, el título de proceso y dos subtítulos', () => {
      expect(el.querySelector('.import-dropzone')).toBeNull();
      expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(gears()).not.toBeNull();
      expect(validationTitle()).toBe('Procesando información...');
      expect(validationSubtitles()).toEqual([
        'Estamos unificando los datos del Punto de venta y el banco.',
        'Esto puede tomar unos segundos.',
      ]);
      expect(el.querySelector('.validation__progress')).not.toBeNull();
      expect(progress()).toBe(0);
    });

    it('antes de responder no hay KPIs, tabla ni "Descargar"', () => {
      expect(el.querySelector('.result-kpis')).toBeNull();
      expect(el.querySelector('.status-card')).toBeNull();
      expect(el.querySelector('nz-table')).toBeNull();
      expect(footerButtons()).toHaveLength(1);
      expect(footerButtons()[0].textContent).toContain('Confirmar conciliación');
    });

    it('"Siguiente" está deshabilitado y no avanza mientras no responde el back', async () => {
      expect(nextButton().disabled).toBe(true);

      nextButton().click();
      await settle();

      expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(validationTitle()).toBe('Procesando información...');
    });

    it('la barra sube 10% por segundo', async () => {
      for (let pct = 10; pct <= 80; pct += 10) {
        await tick(1000);
        expect(progress()).toBe(pct);
        expect(percentText()).toBe(`${pct}%`);
        expect(nextButton().disabled).toBe(true);
      }
    });

    it('no avanza antes de que pase un segundo', async () => {
      await tick(999);
      expect(progress()).toBe(0);
      await tick(1);
      expect(progress()).toBe(10);
    });

    it('se detiene en 80% aunque pasen más segundos sin respuesta, con "Siguiente" deshabilitado', async () => {
      await tick(8000);
      expect(progress()).toBe(80);

      await tick(30_000);

      expect(progress()).toBe(80);
      expect(percentText()).toBe('80%');
      expect(validationTitle()).toBe('Procesando información...');
      expect(el.querySelector('nz-table')).toBeNull();
      expect(nextButton().disabled).toBe(true);
    });

    it('al responder el back (tras el 80%) la animación desaparece; "Siguiente" espera a las marcas', async () => {
      await tick(8000);
      await answer();

      expect(progress()).toBe(100);
      expect(gears()).toBeNull();
      expect(el.querySelector('.validation')).toBeNull();
      expect(el.querySelector('.validation__progress')).toBeNull();
      expect(el.textContent).not.toContain('Procesando información...');
      expect(el.textContent).not.toContain('Información procesada');
      expect(nextButton().disabled).toBe(true);
    });

    it('si el back responde antes del 80%, también reemplaza la animación', async () => {
      await tick(3000);
      expect(progress()).toBe(30);

      await answer();

      expect(progress()).toBe(100);
      expect(el.querySelector('.validation')).toBeNull();
      expect(el.querySelector('.result-kpis')).not.toBeNull();
      expect(nextButton().disabled).toBe(true);
    });

    // Si el back responde antes del 80%, el temporizador de la barra se corta.
    it('tras la respuesta la barra se queda en 100% aunque el temporizador siga vivo', async () => {
      await tick(3000);
      await answer();

      await tick(5000);

      expect(progress()).toBe(100);
    });

    it('"Siguiente" con todas las líneas marcadas avanza al paso 3 y no vuelve a cargar', async () => {
      await answer();
      await markAllRows();

      nextButton().click();
      await settle();

      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(el.querySelector('.validation')).toBeNull();
      expect(el.querySelector('nz-table')).toBeNull();
      expect(el.querySelector('.result-kpis')).toBeNull();
      expect(el.querySelector('.process-footer__hint')).toBeNull();
      expect(bankReports.uploadFile).toHaveBeenCalledTimes(1);
      expect(bankReports.match).toHaveBeenCalledTimes(1);
    });

    it('al destruir el componente se cancela la carga y el temporizador', async () => {
      await tick(2000);
      expect(upload$.observed).toBe(true);
      expect(progress()).toBe(20);

      fixture.destroy();
      await vi.advanceTimersByTimeAsync(5000);

      expect(upload$.observed).toBe(false);
      expect(progress()).toBe(20);
    });
  });

  describe('paso 2 · error del back', () => {
    const errorBox = () => el.querySelector<HTMLElement>('.validation-error');
    const errorButton = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.validation-error__actions button')).find((b) =>
        norm(b.textContent).includes(label),
      );

    beforeEach(async () => {
      await renderRun();
      await goToStep(1);
    });

    async function failUpload(error: unknown): Promise<void> {
      upload$.error(error);
      await settle();
    }

    it('si la carga falla muestra el error en lugar de la animación, con "Siguiente" deshabilitado', async () => {
      await tick(2000);
      await failUpload(httpError(403, 'Forbidden'));

      expect(errorBox()).not.toBeNull();
      expect(norm(errorBox()!.querySelector('.validation-error__title')?.textContent)).toBe(
        'No se pudo procesar el reporte del banco',
      );
      expect(norm(errorBox()!.querySelector('.validation-error__detail')?.textContent)).toBe(
        'Tu cuenta no tiene el permiso para cargar reportes del banco (import_settlements).',
      );
      expect(gears()).toBeNull();
      expect(el.querySelector('.result-kpis')).toBeNull();
      expect(bankReports.match).not.toHaveBeenCalled();
      expect(nextButton().disabled).toBe(true);
    });

    it('el error corta la barra: no sigue subiendo', async () => {
      await tick(2000);
      await failUpload(SERVER_ERROR);

      await tick(5000);

      expect(progress()).toBe(20);
    });

    it('si falla el cruce muestra el detalle del back y no pide resultados', async () => {
      bankReports.match.mockReturnValue(throwError(() => httpError(409, 'El archivo ya se está cruzando.')));
      upload$.next(IMPORTED);
      upload$.complete();
      await settle();

      expect(norm(errorBox()!.querySelector('.validation-error__detail')?.textContent)).toBe('El archivo ya se está cruzando.');
      expect(bankReports.allResults).not.toHaveBeenCalled();
    });

    it('si fallan los resultados muestra el error de conexión', async () => {
      bankReports.allResults.mockReturnValue(throwError(() => httpError(0)));
      upload$.next(IMPORTED);
      upload$.complete();
      await settle();

      expect(norm(errorBox()!.querySelector('.validation-error__detail')?.textContent)).toBe(
        'No se pudo conectar con el servidor. Intenta de nuevo.',
      );
      expect(internals().result()).toBeNull();
    });

    it('trae los botones "Volver a la carga" y "Reintentar", con icono y label', async () => {
      await failUpload(SERVER_ERROR);

      for (const label of ['Volver a la carga', 'Reintentar']) {
        const button = errorButton(label)!;
        expect(button).toBeDefined();
        expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');
      }
      expect(errorButton('Reintentar')!.classList.contains('ant-btn-primary')).toBe(true);
    });

    it('"Volver a la carga" regresa al paso 1 con el mismo archivo y su resumen, sin volver a leerlo', async () => {
      await failUpload(SERVER_ERROR);

      errorButton('Volver a la carga')!.click();
      await settle();

      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(errorBox()).toBeNull();
      expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe(
        'bancolombia_Reporte_Conciliar_20260702_20260706.xlsx',
      );
      expect(legend()!.textContent!.trim()).toBe('Archivo válido');
      expect(bankReports.read).toHaveBeenCalledTimes(1);
      expect(nextButton().disabled).toBe(false);
    });

    it('tras volver a la carga, "Siguiente" vuelve a cargar el reporte', async () => {
      await failUpload(SERVER_ERROR);
      errorButton('Volver a la carga')!.click();
      await settle();

      nextButton().click();
      await settle();

      expect(bankReports.uploadFile).toHaveBeenCalledTimes(2);
      expect(gears()).not.toBeNull();
      await answer();
      expect(el.querySelector('.result-kpis')).not.toBeNull();
    });

    it('"Reintentar" vuelve a cargar desde 0% y, si el back responde, muestra el resultado', async () => {
      await tick(3000);
      await failUpload(SERVER_ERROR);

      errorButton('Reintentar')!.click();
      await settle();

      expect(bankReports.uploadFile).toHaveBeenCalledTimes(2);
      expect(errorBox()).toBeNull();
      expect(gears()).not.toBeNull();
      expect(progress()).toBe(0);

      await tick(1000);
      expect(progress()).toBe(10);

      await answer();
      expect(progress()).toBe(100);
      expect(el.querySelector('.result-kpis')).not.toBeNull();
      expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
    });
  });
  describe('paso 2 · resultado', () => {
    const money = (value: number) => TestBed.runInInjectionContext(() => new MoneyPipe().transform(value))!;

    const kpiCards = () => Array.from(el.querySelectorAll<HTMLElement>('.result-kpis .status-card'));
    const kpiLabel = (card: HTMLElement) => norm(card.querySelector('.status-card__label')?.textContent);
    const kpiValue = (card: HTMLElement) => norm(card.querySelector('.status-card__value')?.textContent);
    // Texto esperado del KPI "Por gestionar": `N (xx.x%)` sobre `total` líneas.
    const pendingText = (count: number, total: number) =>
      `${formatNumber(count, ACTIVE_COUNTRY.locale)} (${formatNumber(total === 0 ? 0 : Math.round((count / total) * 1000) / 10, ACTIVE_COUNTRY.locale, '1.1-1')}%)`;
    const headers = () => Array.from(el.querySelectorAll<HTMLElement>('nz-table thead th')).map((th) => norm(th.textContent));
    const bodyRows = () => Array.from(el.querySelectorAll<HTMLTableRowElement>('nz-table tbody tr.clickable-row'));
    const cells = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('td'));
    const headerCheckbox = () => el.querySelector<HTMLInputElement>('nz-table thead input[type="checkbox"]')!;
    const rowCheckbox = (index: number) => bodyRows()[index].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const headerWrapper = () => el.querySelector<HTMLElement>('nz-table thead .ant-checkbox')!;
    const drawerTitle = () => document.body.querySelector('.ant-drawer-title')?.textContent?.trim();
    const lineDetail = () => document.body.querySelector<HTMLElement>('app-line-detail');
    const selectedCount = () => internals().selectedIds().size;
    const hint = () => norm(el.querySelector('.process-footer__hint')?.textContent);
    // Zorro marca cada página con `title` = su número.
    const goToPage = (page: number) =>
      el.querySelector<HTMLElement>(`nz-pagination .ant-pagination-item[title="${page}"]`)!.click();
    const managing = () => internals().managing();
    // 2 coincidentes y 1 con diferencia: permite estados parciales de la cabecera.
    const MIXED: BankMatchItem[] = [...manyItems(2), ITEMS[1]];

    async function showResult(items: BankMatchItem[] = ITEMS, summary: BankMatchSummary = SUMMARY): Promise<void> {
      await renderRun();
      await goToStep(1);
      await answer(items, summary);
    }

    describe('KPIs', () => {
      beforeEach(() => showResult());

      it('muestra 4 KPI en orden: Coincidencias, Diferencias, Sin coincidencias, Por gestionar', () => {
        expect(kpiCards().map(kpiLabel)).toEqual(['Coincidencias', 'Diferencias', 'Sin coincidencias', 'Por gestionar']);
      });

      it('el 4.º KPI es neutral, con icono, y cuenta las líneas con el checkbox bloqueado', () => {
        const pending = kpiCards()[3];

        expect(pending.classList.contains('status-card-neutral')).toBe(true);
        expect(pending.querySelector('.status-card__icon svg')).not.toBeNull();
        // De las 4 líneas solo la que coincide está habilitada.
        expect(kpiValue(pending)).toBe(pendingText(3, 4));
        expect(el.querySelectorAll('.result-kpis .status-card-neutral')).toHaveLength(1);
      });

      it('"Por gestionar" muestra `N (xx.x%)` sobre el total de líneas, con un decimal', () => {
        const value = kpiValue(kpiCards()[3]);
        const expected = Math.round((3 / ROWS.length) * 1000) / 10;

        expect(expected).toBe(75);
        expect(value).toBe(`3 (${formatNumber(expected, ACTIVE_COUNTRY.locale, '1.1-1')}%)`);
        expect(value).toMatch(/^3 \(75[.,]0%\)$/);
        expect(kpiCards()[3].querySelector('.status-card__percentage')).not.toBeNull();
      });

      it('"Por gestionar" baja al registrar una acción en una línea', async () => {
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'ajuste', comment: 'Motivo' });
        await settle();
        expect(kpiValue(kpiCards()[3])).toBe(pendingText(2, 4));

        internals().onLineResolved({ rowId: ROWS[2].id, type: 'pendiente', comment: '' });
        await settle();
        expect(kpiValue(kpiCards()[3])).toBe(pendingText(1, 4));

        internals().onLineResolved({ rowId: ROWS[3].id, type: 'reconciliacion', comment: 'Motivo' });
        await settle();
        expect(kpiValue(kpiCards()[3])).toBe(pendingText(0, 4));
      });

      it('el porcentaje de "Por gestionar" baja junto con el conteo al registrar acciones', async () => {
        const percent = () => Number(/\(([\d.,]+)%\)/.exec(kpiValue(kpiCards()[3]))![1].replace(',', '.'));
        const before = percent();

        internals().onLineResolved({ rowId: ROWS[1].id, type: 'ajuste', comment: 'Motivo' });
        await settle();

        expect(percent()).toBeLessThan(before);
        expect(percent()).toBe(50);
      });

      it('"Por gestionar" no cambia al marcar o desmarcar una línea que coincide', async () => {
        rowCheckbox(0).click();
        await settle();
        expect(kpiValue(kpiCards()[3])).toBe(pendingText(3, 4));

        rowCheckbox(0).click();
        await settle();
        expect(kpiValue(kpiCards()[3])).toBe(pendingText(3, 4));
      });

      it('la fila de KPI usa 4 columnas', () => {
        expect(kpiCards()).toHaveLength(4);
        expect(el.querySelectorAll('.result-kpis > nz-card')).toHaveLength(4);
      });

      it('cada KPI lleva su clase de semáforo (success, warning, error) y su icono', () => {
        const [ok, warn, bad] = kpiCards();

        expect(ok.classList.contains('status-card-success')).toBe(true);
        expect(warn.classList.contains('status-card-warning')).toBe(true);
        expect(bad.classList.contains('status-card-error')).toBe(true);
        for (const card of kpiCards()) {
          expect(card.classList.contains('status-card')).toBe(true);
          expect(card.querySelector('.status-card__icon svg')).not.toBeNull();
        }
        expect(ok.classList.contains('status-card-error')).toBe(false);
        expect(bad.classList.contains('status-card-success')).toBe(false);
      });

      it('el valor es `count (percentage%)` con separador de miles y un decimal', () => {
        const locale = ACTIVE_COUNTRY.locale;
        const thousands = formatNumber(1120, locale);

        expect(thousands).not.toBe('1120'); // lleva separador de miles
        expect(kpiValue(kpiCards()[0])).toBe(`${thousands} (${formatNumber(90.1, locale, '1.1-1')}%)`);
        // 5 -> "5.0" / "5,0": siempre un decimal.
        expect(kpiValue(kpiCards()[1])).toBe(`62 (${formatNumber(5, locale, '1.1-1')}%)`);
        expect(kpiValue(kpiCards()[1])).toMatch(/\(5[.,]0%\)$/);
        expect(kpiValue(kpiCards()[2])).toBe(`61 (${formatNumber(4.9, locale, '1.1-1')}%)`);
      });

      it('reemplaza la animación de espera: sin engranes, título, subtítulos ni barra', () => {
        expect(gears()).toBeNull();
        expect(el.querySelector('.validation')).toBeNull();
        expect(validationTitle()).toBeUndefined();
        expect(validationSubtitles()).toEqual([]);
        expect(el.querySelector('nz-progress')).toBeNull();
        expect(el.textContent).not.toContain('Procesando información...');
        expect(el.textContent).not.toContain('Información procesada');
        expect(el.querySelector('.gears--paused')).toBeNull();
      });
    });

    describe('KPI como foco de la tabla', () => {
      // Orden recibido: RAP (sin), BBVA (coincide), DIDI (sin), CORTE (diferencia).
      const FOCUS: BankMatchItem[] = [ITEMS[2], ITEMS[0], ITEMS[3], ITEMS[1]];
      const ORIGINAL = ['RAP-0001', 'BBVA-0001', 'DIDI-0001', 'CORTE-0827-02'];
      const COINCIDE = 0;
      const DIFERENCIA = 1;
      const SIN_COINCIDENCIA = 2;
      const POR_GESTIONAR = 3;

      const references = () => bodyRows().map((row) => norm(row.querySelector('.cell-title')?.textContent));
      const activeCards = () => kpiCards().filter((card) => card.classList.contains('status-card--active'));
      const pressed = () => kpiCards().map((card) => card.getAttribute('aria-pressed'));
      const key = (card: HTMLElement, name: string) => {
        const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
        card.dispatchEvent(event);
        return event;
      };

      async function press(index: number): Promise<void> {
        kpiCards()[index].click();
        await settle();
      }

      beforeEach(() => showResult(FOCUS));

      it('los 4 indicadores son botones enfocables, sin ninguno activo al inicio', () => {
        expect(references()).toEqual(ORIGINAL);
        for (const card of kpiCards()) {
          expect(card.getAttribute('role')).toBe('button');
          expect(card.getAttribute('tabindex')).toBe('0');
          expect(card.classList.contains('status-card--clickable')).toBe(true);
        }
        expect(pressed()).toEqual(['false', 'false', 'false', 'false']);
        expect(activeCards()).toHaveLength(0);
      });

      it.each([
        ['Coincidencias', COINCIDE, ['BBVA-0001', 'RAP-0001', 'DIDI-0001', 'CORTE-0827-02']],
        ['Diferencias', DIFERENCIA, ['CORTE-0827-02', 'RAP-0001', 'BBVA-0001', 'DIDI-0001']],
        ['Sin coincidencias', SIN_COINCIDENCIA, ['RAP-0001', 'DIDI-0001', 'BBVA-0001', 'CORTE-0827-02']],
        ['Por gestionar', POR_GESTIONAR, ['RAP-0001', 'DIDI-0001', 'CORTE-0827-02', 'BBVA-0001']],
      ])('clic en "%s" pone sus líneas primero y las demás después en su orden original', async (_label, index, expected) => {
        await press(index);

        expect(references()).toEqual(expected);
        expect(bodyRows()).toHaveLength(4);
      });

      it.each([
        ['Coincidencias', COINCIDE],
        ['Diferencias', DIFERENCIA],
        ['Sin coincidencias', SIN_COINCIDENCIA],
        ['Por gestionar', POR_GESTIONAR],
      ])('un segundo clic en "%s" restaura el orden original', async (_label, index) => {
        await press(index);
        expect(references()).not.toEqual(ORIGINAL);

        await press(index);

        expect(references()).toEqual(ORIGINAL);
        expect(activeCards()).toHaveLength(0);
        expect(pressed()).toEqual(['false', 'false', 'false', 'false']);
      });

      it('marca como activo y `aria-pressed` solo al indicador elegido, de a uno', async () => {
        await press(DIFERENCIA);
        expect(activeCards()).toEqual([kpiCards()[DIFERENCIA]]);
        expect(pressed()).toEqual(['false', 'true', 'false', 'false']);

        await press(POR_GESTIONAR);
        expect(activeCards()).toEqual([kpiCards()[POR_GESTIONAR]]);
        expect(pressed()).toEqual(['false', 'false', 'false', 'true']);
      });

      it('cambiar de indicador reordena según el nuevo, no se acumula con el anterior', async () => {
        await press(DIFERENCIA);
        await press(COINCIDE);

        expect(references()).toEqual(['BBVA-0001', 'RAP-0001', 'DIDI-0001', 'CORTE-0827-02']);
      });

      it('Enter activa el indicador y otro Enter lo quita', async () => {
        key(kpiCards()[SIN_COINCIDENCIA], 'Enter');
        await settle();

        expect(references()).toEqual(['RAP-0001', 'DIDI-0001', 'BBVA-0001', 'CORTE-0827-02']);
        expect(pressed()).toEqual(['false', 'false', 'true', 'false']);

        key(kpiCards()[SIN_COINCIDENCIA], 'Enter');
        await settle();

        expect(references()).toEqual(ORIGINAL);
      });

      it('Espacio activa el indicador, lo alterna y evita el desplazamiento de la página', async () => {
        const first = key(kpiCards()[DIFERENCIA], ' ');
        await settle();

        expect(first.defaultPrevented).toBe(true);
        expect(references()).toEqual(['CORTE-0827-02', 'RAP-0001', 'BBVA-0001', 'DIDI-0001']);
        expect(activeCards()).toEqual([kpiCards()[DIFERENCIA]]);

        key(kpiCards()[DIFERENCIA], ' ');
        await settle();

        expect(references()).toEqual(ORIGINAL);
        expect(activeCards()).toHaveLength(0);
      });

      it('otras teclas no activan el indicador', async () => {
        key(kpiCards()[DIFERENCIA], 'a');
        key(kpiCards()[DIFERENCIA], 'Tab');
        await settle();

        expect(references()).toEqual(ORIGINAL);
        expect(activeCards()).toHaveLength(0);
      });

      it('los KPI siguen mostrando sus conteos y porcentajes, con o sin foco', async () => {
        const locale = ACTIVE_COUNTRY.locale;
        const values = () => kpiCards().map(kpiValue);
        const before = values();
        expect(before).toEqual([
          `${formatNumber(1120, locale)} (${formatNumber(90.1, locale, '1.1-1')}%)`,
          `62 (${formatNumber(5, locale, '1.1-1')}%)`,
          `61 (${formatNumber(4.9, locale, '1.1-1')}%)`,
          pendingText(3, 4),
        ]);

        await press(DIFERENCIA);
        expect(values()).toEqual(before);

        await press(DIFERENCIA);
        expect(values()).toEqual(before);
      });

      it('"Por gestionar" se actualiza al registrar una acción: la línea sale del grupo y la tabla se reordena', async () => {
        await press(POR_GESTIONAR);
        expect(references()).toEqual(['RAP-0001', 'DIDI-0001', 'CORTE-0827-02', 'BBVA-0001']);

        internals().onLineResolved({ rowId: ROWS[1].id, type: 'ajuste', comment: 'Motivo' });
        await settle();

        expect(references()).toEqual(['RAP-0001', 'DIDI-0001', 'BBVA-0001', 'CORTE-0827-02']);
        expect(kpiValue(kpiCards()[POR_GESTIONAR])).toBe(pendingText(2, 4));
        expect(activeCards()).toEqual([kpiCards()[POR_GESTIONAR]]);

        internals().onLineResolved({ rowId: ROWS[2].id, type: 'pendiente', comment: '' });
        internals().onLineResolved({ rowId: ROWS[3].id, type: 'pendiente', comment: '' });
        await settle();

        // Sin líneas por gestionar el foco no mueve nada: queda el orden original.
        expect(references()).toEqual(ORIGINAL);
        expect(kpiValue(kpiCards()[POR_GESTIONAR])).toBe(pendingText(0, 4));
      });

      it('con foco en un estado, registrar una acción no mueve las líneas', async () => {
        await press(DIFERENCIA);

        internals().onLineResolved({ rowId: ROWS[1].id, type: 'ajuste', comment: 'Motivo' });
        await settle();

        expect(references()).toEqual(['CORTE-0827-02', 'RAP-0001', 'BBVA-0001', 'DIDI-0001']);
      });

      it('el foco no cambia la selección ni las marcas de las líneas', async () => {
        rowCheckbox(1).click(); // BBVA, la única marcable
        await settle();

        await press(COINCIDE);

        expect([...internals().selectedIds()]).toEqual([ROWS[0].id]);
        expect(rowCheckbox(0).checked).toBe(true);
        expect(hint()).toBe('1 de 4 líneas marcadas');
      });
    });

    describe('KPI como foco de la tabla con varias páginas', () => {
      // 12 coincidentes, y al final una con diferencia y una sin coincidencia: 14 líneas, 2 páginas.
      const MANY: BankMatchItem[] = [...manyItems(12), ITEMS[1], ITEMS[2]];
      const references = () => bodyRows().map((row) => norm(row.querySelector('.cell-title')?.textContent));
      const activePage = () => el.querySelector('nz-pagination .ant-pagination-item-active')?.getAttribute('title');

      beforeEach(() => showResult(MANY));

      it('hay 2 páginas y la diferencia queda fuera de la primera', () => {
        expect(bodyRows()).toHaveLength(10);
        expect(references()).not.toContain('CORTE-0827-02');
        expect(el.querySelectorAll('nz-pagination .ant-pagination-item')).toHaveLength(2);
      });

      it('cambiar el foco regresa a la página 1 y la fila enfocada queda arriba', async () => {
        goToPage(2);
        await settle();
        expect(activePage()).toBe('2');

        kpiCards()[1].click(); // Diferencias
        await settle();

        expect(activePage()).toBe('1');
        expect(bodyRows()).toHaveLength(10);
        expect(references().slice(0, 2)).toEqual(['CORTE-0827-02', 'R-01']);
      });

      it('quitar el foco también regresa a la página 1', async () => {
        kpiCards()[1].click();
        await settle();
        goToPage(2);
        await settle();
        expect(activePage()).toBe('2');

        kpiCards()[1].click();
        await settle();

        expect(activePage()).toBe('1');
        expect(references()[0]).toBe('R-01');
      });

      it('pasar de un indicador a otro desde la página 2 vuelve a la página 1', async () => {
        kpiCards()[2].click(); // Sin coincidencias
        await settle();
        goToPage(2);
        await settle();

        kpiCards()[3].click(); // Por gestionar
        await settle();

        expect(activePage()).toBe('1');
        expect(references().slice(0, 2)).toEqual(['CORTE-0827-02', 'RAP-0001']);
      });

      it('las líneas no enfocadas siguen en la tabla, en la página 2', async () => {
        kpiCards()[2].click(); // Sin coincidencias
        await settle();
        goToPage(2);
        await settle();

        expect(references()).toEqual(['R-10', 'R-11', 'R-12', 'CORTE-0827-02']);
      });
    });

    describe('KPI "Por gestionar" sin líneas por resolver', () => {
      it('es 0 si todas las líneas coinciden', async () => {
        await showResult(manyItems(3));

        expect(kpiValue(kpiCards()[3])).toBe(pendingText(0, 3));
        expect(kpiValue(kpiCards()[3])).toMatch(/^0 \(0[.,]0%\)$/);
      });

      it('es `0 (0.0%)` también sin ninguna línea', async () => {
        await showResult([], { ...SUMMARY, total: 0 });

        expect(kpiValue(kpiCards()[3])).toMatch(/^0 \(0[.,]0%\)$/);
      });
    });

    describe('tabla', () => {
      beforeEach(() => showResult());

      it('tiene las columnas checkbox, Fecha, Referencias, POS, Banco, Estado y Notas', () => {
        expect(headers()).toEqual(['', 'Fecha', 'Referencias', 'POS', 'Banco', 'Estado', 'Notas']);
        expect(headerCheckbox()).not.toBeNull();
      });

      it('pinta una fila por línea, en el orden recibido', () => {
        expect(bodyRows()).toHaveLength(4);
        expect(bodyRows().map((row) => norm(row.querySelector('.cell-title')?.textContent))).toEqual([
          'BBVA-0001',
          'CORTE-0827-02',
          'RAP-0001',
          'DIDI-0001',
        ]);
      });

      it('la fecha va en dd/MM/yyyy', () => {
        expect(bodyRows().map((row) => norm(cells(row)[1].textContent))).toEqual([
          '12/09/2026',
          '10/09/2026',
          '08/09/2026',
          '05/09/2026',
        ]);
      });

      it('Referencias: referencia como título y el canal (franquicia o, sin ella, el banco) como subtítulo', () => {
        expect(
          bodyRows().map((row) => [
            norm(row.querySelector('.cell-title')?.textContent),
            norm(row.querySelector('.cell-subtitle')?.textContent),
          ]),
        ).toEqual([
          ['BBVA-0001', 'VISA'],
          ['CORTE-0827-02', 'MASTERCARD'],
          ['RAP-0001', 'Bancolombia'],
          ['DIDI-0001', 'AMEX'],
        ]);
      });

      it('POS y Banco usan el pipe `money`, y "—" cuando el monto es null', () => {
        const amounts = bodyRows().map((row) => [norm(cells(row)[3].textContent), norm(cells(row)[4].textContent)]);

        expect(amounts).toEqual([
          [norm(money(2000)), norm(money(2000))],
          [norm(money(1234.5)), norm(money(1200))],
          [norm(money(350)), '—'],
          ['—', norm(money(99.9))],
        ]);
        // Los montos son números formateados, no el número crudo.
        expect(amounts[1][0]).not.toBe('1234.5');
      });

      it('Notas: "—" mientras la línea no tiene una acción con comentario', () => {
        expect(bodyRows().map((row) => norm(cells(row)[6].textContent))).toEqual(['—', '—', '—', '—']);
      });

      it('Banco: con un solo movimiento no pinta el subtítulo de conteo', () => {
        for (const row of bodyRows()) expect(norm(cells(row)[4].textContent)).not.toContain('movimiento');
      });

      it('Estado: tag con la etiqueta y el color de cada estado', () => {
        const tags = bodyRows().map((row) => row.querySelector<HTMLElement>('app-result-status-tag nz-tag')!);

        expect(tags.map((tag) => norm(tag.textContent))).toEqual([
          'Coincide',
          'Diferencia',
          'Sin coincidencia',
          'Sin coincidencia',
        ]);
        expect(tags[0].classList.contains('ant-tag-success')).toBe(true);
        expect(tags[1].classList.contains('ant-tag-warning')).toBe(true);
        expect(tags[2].classList.contains('ant-tag-error')).toBe(true);
        expect(tags[3].classList.contains('ant-tag-error')).toBe(true);
      });

      it('con 10 líneas o menos no hay segunda página', () => {
        expect(el.querySelectorAll('nz-pagination .ant-pagination-item')).toHaveLength(1);
      });
    });

    describe('paginación a 10', () => {
      beforeEach(() => showResult(manyItems(25)));

      it('muestra 10 filas por página y 3 páginas con 25 líneas', () => {
        expect(bodyRows()).toHaveLength(10);
        expect(el.querySelectorAll('nz-pagination .ant-pagination-item')).toHaveLength(3);
        expect(norm(bodyRows()[0].querySelector('.cell-title')?.textContent)).toBe('R-01');
      });

      it('la última página trae el resto (5 líneas)', async () => {
        goToPage(3);
        await settle();

        expect(bodyRows()).toHaveLength(5);
        expect(norm(bodyRows()[0].querySelector('.cell-title')?.textContent)).toBe('R-21');
      });
    });

    describe('selección', () => {
      beforeEach(() => showResult());

      it('al inicio no hay nada seleccionado (cabecera sin marcar ni indeterminada)', () => {
        expect(selectedCount()).toBe(0);
        expect(headerCheckbox().checked).toBe(false);
        expect(headerWrapper().classList.contains('ant-checkbox-indeterminate')).toBe(false);
        for (let i = 0; i < 4; i++) expect(rowCheckbox(i).checked).toBe(false);
      });

      it('solo las líneas que coinciden se pueden marcar; diferencia y sin coincidencia están deshabilitadas', () => {
        expect(rowCheckbox(0).disabled).toBe(false);
        expect(rowCheckbox(1).disabled).toBe(true);
        expect(rowCheckbox(2).disabled).toBe(true);
        expect(rowCheckbox(3).disabled).toBe(true);
      });

      it('marcar una línea que coincide la selecciona', async () => {
        rowCheckbox(0).click();
        await settle();

        expect(selectedCount()).toBe(1);
        expect(rowCheckbox(0).checked).toBe(true);
        expect(hint()).toBe('1 de 4 líneas marcadas');
      });

      it('un checkbox deshabilitado no marca la línea (ni con clic ni vía onCheck)', async () => {
        rowCheckbox(1).click();
        await settle();
        internals().onCheck(ROWS[2], true);
        await settle();

        expect(selectedCount()).toBe(0);
        expect(rowCheckbox(1).checked).toBe(false);
        expect(rowCheckbox(2).checked).toBe(false);
      });

      it('el checkbox de la cabecera marca solo las marcables y al desmarcarlo las quita', async () => {
        headerCheckbox().click();
        await settle();

        expect([...internals().selectedIds()]).toEqual([ROWS[0].id]);
        expect(rowCheckbox(0).checked).toBe(true);
        for (let i = 1; i < 4; i++) expect(rowCheckbox(i).checked).toBe(false);
        // Marcó todas las marcables: la cabecera queda marcada, no indeterminada.
        expect(headerCheckbox().checked).toBe(true);
        expect(headerWrapper().classList.contains('ant-checkbox-indeterminate')).toBe(false);
        expect(internals().allRowsChecked()).toBe(false);

        headerCheckbox().click();
        await settle();

        expect(selectedCount()).toBe(0);
        expect(headerCheckbox().checked).toBe(false);
        expect(rowCheckbox(0).checked).toBe(false);
      });

      it('registrar una acción habilita la línea y la marca', async () => {
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'pendiente', comment: '' });
        await settle();

        expect(rowCheckbox(1).disabled).toBe(false);
        expect(rowCheckbox(1).checked).toBe(true);
        expect(rowCheckbox(2).disabled).toBe(true);
        expect(hint()).toBe('1 de 4 líneas marcadas');
      });

      it('una línea resuelta se puede desmarcar y volver a marcar', async () => {
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'ajuste', comment: 'Motivo' });
        await settle();

        rowCheckbox(1).click();
        await settle();
        expect(rowCheckbox(1).checked).toBe(false);
        expect(selectedCount()).toBe(0);

        rowCheckbox(1).click();
        await settle();
        expect(rowCheckbox(1).checked).toBe(true);
      });

      it('el check-all de la cabecera incluye las líneas ya resueltas', async () => {
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'pendiente', comment: '' });
        await settle();
        headerCheckbox().click(); // indeterminada: marca todas las marcables
        await settle();

        expect([...internals().selectedIds()].sort()).toEqual([ROWS[0].id, ROWS[1].id].sort());
        expect(headerCheckbox().checked).toBe(true);
      });

      it('el click del checkbox NO abre el detalle', async () => {
        rowCheckbox(0).click();
        headerCheckbox().click();
        await settle();

        expect(managing()).toBeNull();
        expect(lineDetail()).toBeNull();
        expect(drawerTitle()).toBeUndefined();
      });
    });

    describe('selección parcial de la cabecera', () => {
      beforeEach(() => showResult(MIXED));

      it('marcar una de dos marcables deja la cabecera indeterminada', async () => {
        rowCheckbox(0).click();
        await settle();

        expect(selectedCount()).toBe(1);
        expect(internals().allChecked()).toBe(false);
        expect(internals().indeterminate()).toBe(true);
        expect(headerCheckbox().checked).toBe(false);
        expect(headerWrapper().classList.contains('ant-checkbox-indeterminate')).toBe(true);
      });

      it('marcar las dos marcables marca la cabecera; desmarcar una la vuelve indeterminada', async () => {
        rowCheckbox(0).click();
        rowCheckbox(1).click();
        await settle();
        expect(headerCheckbox().checked).toBe(true);
        expect(headerWrapper().classList.contains('ant-checkbox-indeterminate')).toBe(false);

        rowCheckbox(1).click();
        await settle();

        expect(selectedCount()).toBe(1);
        expect(headerCheckbox().checked).toBe(false);
        expect(headerWrapper().classList.contains('ant-checkbox-indeterminate')).toBe(true);
      });

      it('desmarcar la única línea marcada quita el estado indeterminado', async () => {
        rowCheckbox(0).click();
        await settle();
        rowCheckbox(0).click();
        await settle();

        expect(selectedCount()).toBe(0);
        expect(headerWrapper().classList.contains('ant-checkbox-indeterminate')).toBe(false);
      });
    });

    describe('selección con paginación', () => {
      beforeEach(() => showResult(manyItems(25)));

      it('seleccionar todas marca también las líneas de otras páginas', async () => {
        headerCheckbox().click();
        await settle();
        expect(selectedCount()).toBe(25);
        expect(hint()).toBe('25 de 25 líneas marcadas');

        goToPage(3);
        await settle();

        expect(bodyRows()).toHaveLength(5);
        for (let i = 0; i < 5; i++) expect(rowCheckbox(i).checked).toBe(true);
        expect(headerCheckbox().checked).toBe(true);
      });
    });

    describe('"N de M líneas marcadas"', () => {
      it('no aparece en el paso 1 ni mientras se espera al back', async () => {
        await renderRun();
        await drop(xlsx());
        expect(el.querySelector('.process-footer__hint')).toBeNull();

        nextButton().click();
        await settle();
        expect(el.querySelector('.process-footer__hint')).toBeNull();
      });

      it('con resultado cuenta las marcadas sobre el total de líneas', async () => {
        await showResult();
        expect(hint()).toBe('0 de 4 líneas marcadas');

        rowCheckbox(0).click();
        await settle();
        expect(hint()).toBe('1 de 4 líneas marcadas');

        await markAllRows();
        expect(hint()).toBe('4 de 4 líneas marcadas');
      });
    });

    describe('detalle de la línea (drawer)', () => {
      beforeEach(() => showResult());

      afterEach(() => vi.restoreAllMocks());

      const diffRow = () => bodyRows()[1]; // CORTE-0827-02, con diferencia
      const closeDrawer = async () => {
        document.body.querySelector<HTMLElement>('.ant-drawer-close')!.click();
        await settle();
      };
      const drawerButton = (label: string) =>
        Array.from(document.body.querySelectorAll<HTMLButtonElement>('app-line-detail button')).find((b) =>
          norm(b.textContent).includes(label),
        );

      it('al inicio el drawer está cerrado', () => {
        expect(managing()).toBeNull();
        expect(lineDetail()).toBeNull();
        expect(drawerTitle()).toBeUndefined();
      });

      it('click en una línea abre el drawer con título y el detalle de esa línea', async () => {
        diffRow().click();
        await settle();

        expect(drawerTitle()).toBe('Detalle de la línea — CORTE-0827-02');
        expect(managing()).toEqual(ROWS[1]);
        const detail = lineDetail()!;
        expect(detail).not.toBeNull();
        expect(norm(detail.textContent)).toContain('Banco (Movimientos)');
        expect(detail.querySelector('.line-top__comment')).toBeNull();
        // Ya no se incrusta "Gestión de diferencias".
        expect(document.body.querySelector('app-difference-management')).toBeNull();
      });

      it('el título usa la referencia de la línea elegida', async () => {
        bodyRows()[0].click();
        await settle();

        expect(drawerTitle()).toBe('Detalle de la línea — BBVA-0001');
      });

      it('abrir el drawer no cambia la selección', async () => {
        diffRow().click();
        await settle();

        expect(selectedCount()).toBe(0);
      });

      it('cerrar el drawer (botón de cierre) quita el detalle', async () => {
        diffRow().click();
        await settle();
        expect(lineDetail()).not.toBeNull();

        await closeDrawer();

        expect(lineDetail()).toBeNull();
        expect(managing()).toBeNull();
      });

      it('se puede abrir otra línea tras cerrar la anterior', async () => {
        diffRow().click();
        await settle();
        await closeDrawer();

        bodyRows()[2].click();
        await settle();

        expect(drawerTitle()).toBe('Detalle de la línea — RAP-0001');
      });

      it('"Marcar pendiente" en el detalle guarda la acción, marca la línea y cierra el drawer', async () => {
        diffRow().click();
        await settle();

        drawerButton('Marcar pendiente')!.click();
        await settle();

        expect(message.success).toHaveBeenCalledWith('Marcada como pendiente.');
        expect(lineDetail()).toBeNull();
        expect(managing()).toBeNull();
        expect(internals().resolutions().get(ROWS[1].id)).toEqual({ rowId: ROWS[1].id, type: 'pendiente', comment: '' });
        expect(rowCheckbox(1).disabled).toBe(false);
        expect(rowCheckbox(1).checked).toBe(true);
        expect(hint()).toBe('1 de 4 líneas marcadas');
      });

      it('al reabrir una línea resuelta el detalle es de solo lectura', async () => {
        diffRow().click();
        await settle();
        drawerButton('Marcar pendiente')!.click();
        await settle();

        diffRow().click();
        await settle();

        const detail = lineDetail()!;
        expect(norm(detail.querySelector('.line-resolution')?.textContent)).toBe('Marcada como pendiente.');
        expect(drawerButton('Marcar pendiente')).toBeUndefined();
        expect(drawerButton('Ajustar monto')).toBeUndefined();
      });

      it('una línea que coincide abre el detalle sin acciones', async () => {
        bodyRows()[0].click();
        await settle();

        expect(lineDetail()).not.toBeNull();
        expect(drawerButton('Marcar pendiente')).toBeUndefined();
        expect(drawerButton('Reconciliar')).toBeUndefined();
      });
    });

    describe('onLineResolved', () => {
      beforeEach(() => showResult());

      it.each([
        ['pendiente', 'Marcada como pendiente.'],
        ['ajuste', 'Monto ajustado.'],
        ['reconciliacion', 'Reconciliada con archivo.'],
      ] as const)('con %s guarda la acción, marca la línea y avisa "%s"', async (type, text) => {
        const resolution: LineResolution = { rowId: ROWS[2].id, type, comment: 'Motivo' };
        internals().openDetail(ROWS[2]);
        await settle();

        internals().onLineResolved(resolution);
        await settle();

        expect(LINE_ACTION_LABEL[type] + '.').toBe(text);
        expect(message.success).toHaveBeenCalledWith(text);
        expect(internals().resolutions().get(ROWS[2].id)).toEqual(resolution);
        expect(internals().selectedIds().has(ROWS[2].id)).toBe(true);
        expect(managing()).toBeNull();
      });

      it('resolver una línea no marca ni habilita las demás', async () => {
        internals().onLineResolved({ rowId: ROWS[2].id, type: 'pendiente', comment: '' });
        await settle();

        expect([...internals().selectedIds()]).toEqual([ROWS[2].id]);
        expect(rowCheckbox(1).disabled).toBe(true);
        expect(rowCheckbox(3).disabled).toBe(true);
      });
    });

    describe('ajuste en la tabla del paso Validación', () => {
      const diffCells = () => cells(bodyRows()[1]);

      beforeEach(() => showResult());
      afterEach(() => vi.restoreAllMocks());

      it('antes de ajustar la línea muestra el banco del back, sin "ajustado" ni nota', () => {
        expect(norm(diffCells()[4].textContent)).toBe(norm(money(1200)));
        expect(norm(diffCells()[6].textContent)).toBe('—');
      });

      it('tras un ajuste el banco muestra el nuevo total y "N movimientos · ajustado"', async () => {
        internals().onLineResolved(ADJUSTMENT);
        await settle();

        expect(norm(diffCells()[4].textContent)).toBe(`${norm(money(1234.5))} 2 movimientos · ajustado`);
        expect(norm(diffCells()[4].querySelector('.cell-subtitle')?.textContent)).toBe('2 movimientos · ajustado');
      });

      it('con un solo movimiento ajustado usa el singular y conserva " · ajustado"', async () => {
        internals().onLineResolved({ ...ADJUSTMENT, movements: [movement('SOLO', 1000)] });
        await settle();

        expect(norm(diffCells()[4].textContent)).toBe(`${norm(money(1000))} 1 movimiento · ajustado`);
      });

      it('la nota de la acción aparece en la columna Notas, con el texto completo como title', async () => {
        internals().onLineResolved(ADJUSTMENT);
        await settle();

        expect(norm(diffCells()[6].textContent)).toBe(ADJUSTMENT.comment);
        expect(diffCells()[6].getAttribute('title')).toBe(ADJUSTMENT.comment);
      });

      it('ajustar una línea no toca el banco ni las notas de las demás', async () => {
        internals().onLineResolved(ADJUSTMENT);
        await settle();

        expect(norm(cells(bodyRows()[0])[4].textContent)).toBe(norm(money(2000)));
        expect(norm(cells(bodyRows()[0])[6].textContent)).toBe('—');
        expect(norm(cells(bodyRows()[2])[4].textContent)).toBe('—');
      });

      it('"pendiente" no cambia el banco (sin "ajustado") y no escribe nota', async () => {
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'pendiente', comment: '' });
        await settle();

        expect(norm(diffCells()[4].textContent)).toBe(norm(money(1200)));
        expect(norm(diffCells()[6].textContent)).toBe('—');
      });

      it('una reconciliación con archivo muestra su nota pero conserva los movimientos del back', async () => {
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'reconciliacion', comment: 'Conciliada con extracto' });
        await settle();

        expect(norm(diffCells()[4].textContent)).toBe(norm(money(1200)));
        expect(norm(diffCells()[6].textContent)).toBe('Conciliada con extracto');
      });

      it('una línea sin banco ajustada pasa de "—" a su total', async () => {
        internals().onLineResolved({
          rowId: ROWS[2].id,
          type: 'ajuste',
          comment: 'Liquidación localizada',
          movements: [movement('RAP', 350)],
        });
        await settle();

        expect(norm(cells(bodyRows()[2])[4].textContent)).toBe(`${norm(money(350))} 1 movimiento · ajustado`);
      });

      it('al reabrir el detalle se ven los movimientos elegidos, la diferencia y la nota guardada', async () => {
        internals().onLineResolved(ADJUSTMENT);
        await settle();

        bodyRows()[1].click();
        await settle();

        const detail = lineDetail()!;
        const rowsText = Array.from(detail.querySelectorAll<HTMLElement>('.bank-card tbody tr')).map((tr) =>
          norm(tr.textContent),
        );
        expect(rowsText).toHaveLength(2);
        expect(rowsText[0]).toContain('MOV-X1');
        expect(rowsText[1]).toContain('MOV-X2');
        expect(norm(detail.querySelector('.bank-card__count')?.textContent)).toBe('2 movimientos');
        expect(norm(detail.querySelector('.bank-total__value')?.textContent)).toBe(norm(money(1234.5)));
        expect(norm(detail.querySelector('.line-difference__value')?.textContent)).toBe(norm(money(0)));
        expect(norm(detail.querySelector('#line-notes')?.textContent)).toBe(ADJUSTMENT.comment);
        expect(norm(detail.querySelector('.line-resolution')?.textContent)).toBe('Monto ajustado.');
      });
    });

    describe('descargar', () => {
      let createObjectURL: Mock<(obj: Blob | MediaSource) => string>;
      let revokeObjectURL: Mock<(url: string) => void>;
      let click: ReturnType<typeof vi.spyOn>;
      let original: { create: typeof URL.createObjectURL; revoke: typeof URL.revokeObjectURL };

      beforeEach(() => {
        original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
        createObjectURL = vi.fn((_obj: Blob | MediaSource) => 'blob:resultados');
        revokeObjectURL = vi.fn((_url: string) => undefined);
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = revokeObjectURL;
        click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      });

      afterEach(() => {
        URL.createObjectURL = original.create;
        URL.revokeObjectURL = original.revoke;
        click.mockRestore();
      });

      it('"Descargar" no existe en el paso 1 ni mientras se espera al back', async () => {
        await renderRun();
        await drop(xlsx());
        expect(footerButtons().map((b) => norm(b.textContent))).toEqual(['Siguiente']);

        nextButton().click();
        await settle();
        expect(footerButtons().map((b) => norm(b.textContent))).toEqual(['Confirmar conciliación']);
      });

      it('con resultado aparece "Descargar" antes de "Confirmar conciliación", con icono y label', async () => {
        await showResult();

        const buttons = footerButtons();
        expect(buttons.map((b) => norm(b.textContent))).toEqual(['Descargar', 'Confirmar conciliación']);
        expect(buttons[0].firstElementChild?.tagName.toLowerCase()).toBe('svg');
        expect(buttons[0].classList.contains('ant-btn-primary')).toBe(false);
        expect(buttons[1].classList.contains('ant-btn-primary')).toBe(true);
      });

      it('"Descargar" desaparece al pasar al paso 3, que solo tiene "Finalizar"', async () => {
        await showResult();
        await markAllRows();

        nextButton().click();
        await settle();

        expect(footerButtons().map((b) => norm(b.textContent))).toEqual(['Finalizar']);
      });

      it('genera conciliacion_<runId>_resultados.csv con BOM y todas las líneas', async () => {
        await showResult();

        footerButtons()[0].click();

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
        const link = click.mock.contexts[0] as HTMLAnchorElement;
        expect(link.download).toBe('conciliacion_CON-0007_resultados.csv');
        expect(link.href).toContain('blob:resultados');
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:resultados');

        const blob = createObjectURL.mock.calls[0][0] as Blob;
        expect(blob.type).toBe('text/csv;charset=utf-8;');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
        expect(text).toBe(
          [
            '﻿Fecha,Referencia,Medio de pago,POS,Banco,Movimientos banco,Estado,Notas',
            '2026-09-12,BBVA-0001,VISA,2000.00,2000.00,1,Coincide,',
            '2026-09-10,CORTE-0827-02,MASTERCARD,1234.50,1200.00,1,Diferencia,',
            '2026-09-08,RAP-0001,Bancolombia,350.00,,0,Sin coincidencia,',
            '2026-09-05,DIDI-0001,AMEX,,99.90,1,Sin coincidencia,',
          ].join('\n'),
        );
      });

      it('el CSV refleja el ajuste (suma y conteo de movimientos) y las notas, con escape de comas y comillas', async () => {
        await showResult();
        internals().onLineResolved({ ...ADJUSTMENT, comment: 'Ajuste "parcial", revisado con tesorería' });
        internals().onLineResolved({ rowId: ROWS[2].id, type: 'pendiente', comment: '' });
        await settle();

        footerButtons()[0].click();

        const blob = createObjectURL.mock.calls[0][0] as Blob;
        const lines = new TextDecoder().decode(await blob.arrayBuffer()).split('\n');
        expect(lines).toHaveLength(5);
        expect(lines[1]).toBe('2026-09-12,BBVA-0001,VISA,2000.00,2000.00,1,Coincide,');
        expect(lines[2]).toBe(
          '2026-09-10,CORTE-0827-02,MASTERCARD,1234.50,1234.50,2,Diferencia,"Ajuste ""parcial"", revisado con tesorería"',
        );
        expect(lines[3]).toBe('2026-09-08,RAP-0001,Bancolombia,350.00,,0,Sin coincidencia,');
        expect(lines[4]).toBe('2026-09-05,DIDI-0001,AMEX,,99.90,1,Sin coincidencia,');
      });

      it('una nota de otra acción (reconciliación) va al CSV sin cambiar los movimientos del back', async () => {
        await showResult();
        internals().onLineResolved({ rowId: ROWS[1].id, type: 'reconciliacion', comment: 'Conciliada con extracto' });
        await settle();

        footerButtons()[0].click();

        const blob = createObjectURL.mock.calls[0][0] as Blob;
        const lines = new TextDecoder().decode(await blob.arrayBuffer()).split('\n');
        expect(lines[2]).toBe('2026-09-10,CORTE-0827-02,MASTERCARD,1234.50,1200.00,1,Diferencia,Conciliada con extracto');
      });

      it('descarga todas las líneas aunque haya una selección parcial o más de una página', async () => {
        await showResult(manyItems(25));
        rowCheckbox(0).click();
        await settle();

        footerButtons()[0].click();

        const blob = createObjectURL.mock.calls[0][0] as Blob;
        const text = new TextDecoder().decode(await blob.arrayBuffer());
        expect(text.split('\n')).toHaveLength(26); // encabezado + 25 líneas
      });
    });

    describe('"Siguiente"', () => {
      beforeEach(() => showResult());

      it('queda deshabilitado tras la respuesta mientras falten líneas por marcar', async () => {
        expect(nextButton().disabled).toBe(true);
        expect(internals().allRowsChecked()).toBe(false);

        // Marcar solo las que coinciden no basta.
        headerCheckbox().click();
        await settle();
        expect(nextButton().disabled).toBe(true);

        nextButton().click();
        await settle();
        expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
      });

      it('con una línea sin acción sigue deshabilitado y con todas marcadas se habilita', async () => {
        for (const row of [ROWS[1], ROWS[2]]) internals().onLineResolved({ rowId: row.id, type: 'pendiente', comment: '' });
        headerCheckbox().click();
        await settle();
        expect(selectedCount()).toBe(3);
        expect(nextButton().disabled).toBe(true);

        internals().onLineResolved({ rowId: ROWS[3].id, type: 'pendiente', comment: '' });
        await settle();

        expect(internals().allRowsChecked()).toBe(true);
        expect(nextButton().disabled).toBe(false);
      });

      it('con todas marcadas avanza al paso 3 y muestra el resumen', async () => {
        await markAllRows();

        nextButton().click();
        await settle();

        expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
        expect(steps()[1].classList.contains('ant-steps-item-finish')).toBeTruthy();
        expect(el.querySelector('.result-kpis')).toBeNull();
        expect(el.querySelector('nz-table')).toBeNull();
        expect(el.querySelector('.completion')).not.toBeNull();
      });

      it('desmarcar una línea vuelve a deshabilitarlo', async () => {
        await markAllRows();
        expect(nextButton().disabled).toBe(false);

        rowCheckbox(0).click();
        await settle();

        expect(nextButton().disabled).toBe(true);
      });
    });

    describe('paso 3 · resumen', () => {
      const metrics = () =>
        Array.from(el.querySelectorAll<HTMLElement>('.completion__metrics .metric')).map((m) => ({
          label: norm(m.querySelector('dt')?.textContent),
          value: norm(m.querySelector('dd')?.textContent),
        }));
      const fmt = (value: number, digits?: string) => formatNumber(value, ACTIVE_COUNTRY.locale, digits);

      // Resuelve las líneas no coincidentes con las acciones dadas y pasa al paso 3.
      async function finishWith(types: LineResolution['type'][]): Promise<void> {
        const cmp = internals();
        const pending = cmp.result()!.rows.filter((r) => r.status !== 'coincide');
        pending.forEach((row, i) => cmp.onLineResolved({ rowId: row.id, type: types[i], comment: 'Motivo' }));
        cmp.onCheckAll(true);
        await settle();
        nextButton().click();
        await settle();
      }

      it('muestra el banner, el divisor y las 4 métricas en orden', async () => {
        await showResult();
        await finishWith(['ajuste', 'reconciliacion', 'pendiente']);

        const banner = el.querySelector<HTMLElement>('.completion')!;
        expect(norm(banner.querySelector('.completion__title')?.textContent)).toBe('¡Conciliación completada!');
        expect(norm(banner.querySelector('.completion__subtitle')?.textContent)).toBe(
          'Todos los movimientos han sido conciliados correctamente',
        );
        expect(banner.classList.contains('status-card-success')).toBe(true);
        expect(banner.querySelector('svg')).not.toBeNull();
        expect(el.querySelector('hr.completion__divider')).not.toBeNull();
        expect(metrics().map((m) => m.label)).toEqual([
          'Total POS',
          'Total banco',
          'Diferencias resueltas',
          'Conciliados',
        ]);
      });

      it('Total POS y Total banco salen de result.totals con `money`', async () => {
        await showResult();
        await finishWith(['ajuste', 'ajuste', 'ajuste']);

        expect(metrics()[0].value).toBe(norm(money(3584.5)));
        expect(metrics()[1].value).toBe(norm(money(3299.9)));
      });

      it('con acciones reales cuenta las resueltas y los conciliados con su porcentaje', async () => {
        await showResult();
        await finishWith(['ajuste', 'reconciliacion', 'pendiente']);

        // Resueltas: 2 (la pendiente no cuenta). Conciliados: 1 que coincide + 2 resueltas = 3 de 4.
        expect(metrics()[2].value).toBe('2');
        expect(metrics()[3].value).toBe(`3 (${fmt(75, '1.1-1')}%)`);
        expect(el.querySelector('.metric__percentage')).not.toBeNull();
      });

      it('las líneas marcadas como pendiente no cuentan como resueltas ni conciliadas', async () => {
        await showResult();
        await finishWith(['pendiente', 'pendiente', 'pendiente']);

        expect(metrics()[2].value).toBe('0');
        expect(metrics()[3].value).toBe(`1 (${fmt(25, '1.1-1')}%)`);
      });

      it('con todas las líneas coincidentes los conciliados son el 100%', async () => {
        await showResult(manyItems(3));
        await finishWith([]);

        expect(metrics()[2].value).toBe('0');
        expect(metrics()[3].value).toBe(`3 (${fmt(100, '1.1-1')}%)`);
      });

      it('el porcentaje se redondea a un decimal (1 de 3 = 33.3%)', async () => {
        await showResult(ITEMS.slice(0, 3));
        await finishWith(['pendiente', 'pendiente']);

        expect(metrics()[3].value).toBe(`1 (${fmt(33.3, '1.1-1')}%)`);
      });

      it('sin líneas el porcentaje es 0 y no se divide entre cero', async () => {
        await showResult([]);
        await finishWith([]);

        expect(metrics()[2].value).toBe('0');
        expect(metrics()[3].value).toBe(`0 (${fmt(0, '1.1-1')}%)`);
      });

      it('el pie solo tiene "Finalizar": sin "Descargar", sin hint y sin espacio reservado', async () => {
        await showResult();
        await finishWith(['ajuste', 'ajuste', 'ajuste']);

        expect(footerButtons().map((b) => norm(b.textContent))).toEqual(['Finalizar']);
        expect(el.querySelector('.process-footer__hint')).toBeNull();
        expect(el.querySelector('.process-pending')).toBeNull();
        expect(el.querySelector('.result-kpis')).toBeNull();
        expect(el.querySelector('nz-table')).toBeNull();
      });
    });
  });

  describe('paso 2 → 3 · confirmar conciliación', () => {
    const completionNote = () => norm(el.querySelector('.completion__note')?.textContent);

    beforeEach(async () => {
      await renderRun();
      await goToStep(1);
      await answer();
      await markAllRows();
    });

    it('el botón dice "Confirmar conciliación", con icono antes del label, y se habilita con todas las líneas marcadas', () => {
      expect(norm(nextButton().textContent)).toBe('Confirmar conciliación');
      expect(nextButton().firstElementChild?.tagName.toLowerCase()).toBe('svg');
      expect(nextButton().disabled).toBe(false);
      expect(bankReports.confirm).not.toHaveBeenCalled();
    });

    it('al pulsarlo confirma la conciliación por su id y pasa al paso 3', async () => {
      nextButton().click();
      await settle();

      expect(bankReports.confirm).toHaveBeenCalledExactlyOnceWith('CON-0007');
      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(el.querySelector('.completion')).not.toBeNull();
    });

    it('el paso 3 muestra el código y cómo quedaron las ventas según el back', async () => {
      nextButton().click();
      await settle();

      expect(completionNote()).toBe(
        'CON-0007 quedó confirmada. Ventas conciliadas: 40 · con diferencia: 3 · sin coincidencia: 2.',
      );
    });

    it('marca la conciliación como conciliada en el store', async () => {
      const store = TestBed.inject(ReconciliationRunsStore);
      expect(store.find('CON-0007')?.status).toBe('pendiente');

      nextButton().click();
      await settle();

      expect(store.find('CON-0007')).toMatchObject({ id: 'CON-0007', code: 'CON-0007', status: 'conciliado' });
    });

    it('mientras confirma el botón muestra carga, no avanza y no confirma dos veces', async () => {
      const pending = new Subject<ReconciliationConfirm>();
      bankReports.confirm.mockReturnValue(pending);

      nextButton().click();
      await settle();

      expect(nextButton().classList.contains('ant-btn-loading')).toBe(true);
      expect(nextButton().disabled).toBe(true);
      expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
      nextButton().click();
      await settle();
      expect(bankReports.confirm).toHaveBeenCalledTimes(1);

      pending.next(CONFIRMATION);
      pending.complete();
      await settle();

      expect(nextButton().classList.contains('ant-btn-loading')).toBe(false);
      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
    });

    it('si falla muestra el error del back y se queda en el paso 2 con el resultado', async () => {
      bankReports.confirm.mockReturnValue(throwError(() => httpError(409, 'La conciliación ya está confirmada.')));

      nextButton().click();
      await settle();

      expect(message.error).toHaveBeenCalledExactlyOnceWith('La conciliación ya está confirmada.', { nzDuration: 8000 });
      expect(steps()[1].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(el.querySelector('.result-kpis')).not.toBeNull();
      expect(el.querySelector('.completion')).toBeNull();
      expect(nextButton().classList.contains('ant-btn-loading')).toBe(false);
      expect(nextButton().disabled).toBe(false);
      expect(TestBed.inject(ReconciliationRunsStore).find('CON-0007')?.status).toBe('pendiente');
    });

    it('un error de conexión usa el mensaje de conexión', async () => {
      bankReports.confirm.mockReturnValue(throwError(() => httpError(0)));

      nextButton().click();
      await settle();

      expect(message.error).toHaveBeenCalledWith('No se pudo conectar con el servidor. Intenta de nuevo.', { nzDuration: 8000 });
    });

    it('tras un error se puede volver a confirmar', async () => {
      bankReports.confirm.mockReturnValueOnce(throwError(() => SERVER_ERROR));
      nextButton().click();
      await settle();

      nextButton().click();
      await settle();

      expect(bankReports.confirm).toHaveBeenCalledTimes(2);
      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
    });

    it('al destruir el componente se cancela la confirmación en curso', async () => {
      const pending = new Subject<ReconciliationConfirm>();
      bankReports.confirm.mockReturnValue(pending);
      nextButton().click();
      await settle();
      expect(pending.observed).toBe(true);

      fixture.destroy();

      expect(pending.observed).toBe(false);
    });
  });

  describe('confirmLeave (confirmación al salir)', () => {
    let confirm: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      await renderRun();
      // `NzModalModule` provee su propio `NzModalService` en el componente: se espía esa instancia.
      confirm = vi
        .spyOn(fixture.debugElement.injector.get(NzModalService), 'confirm')
        .mockImplementation(() => ({}) as never);
    });

    const leave = (url: string) => fixture.componentInstance.confirmLeave(url);
    interface ConfirmOptions {
      nzTitle: string;
      nzContent: string;
      nzOkText: string;
      nzCancelText: string;
      nzOnOk: () => void;
      nzOnCancel: () => void;
    }
    const options = (call = 0) => confirm.mock.calls[call][0] as unknown as ConfirmOptions;

    it('sin archivo cargado deja salir sin diálogo', () => {
      expect(leave('/conciliacion')).toBe(true);
      expect(leave('/dashboard')).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('con un archivo rechazado (.csv) tampoco hay nada que perder', async () => {
      await drop(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

      expect(leave('/conciliacion')).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('con archivo cargado abre el diálogo con título y botones Salir/Cancelar', async () => {
      await drop(xlsx());

      const result = leave('/conciliacion');

      expect(result).toBeInstanceOf(Promise);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(options().nzTitle).toBe('¿Salir de la conciliación?');
      expect(options().nzOkText).toBe('Salir');
      expect(options().nzCancelText).toBe('Cancelar');
    });

    it('aceptar resuelve true', async () => {
      await drop(xlsx());

      const result = leave('/conciliacion');
      options().nzOnOk();

      await expect(result).resolves.toBe(true);
    });

    it('cancelar o cerrar el diálogo resuelve false', async () => {
      await drop(xlsx());

      const result = leave('/conciliacion');
      options().nzOnCancel();

      await expect(result).resolves.toBe(false);
    });

    it.each([
      ['/conciliacion', 'regresas a la página de conciliación'],
      ['/conciliacion?x=1', 'regresas a la página de conciliación'],
      ['/conciliacion#top', 'regresas a la página de conciliación'],
      ['/dashboard', 'sales de esta pantalla'],
      ['/conciliacion/CON-0001/proceso', 'sales de esta pantalla'],
      ['/conciliacion-otra', 'sales de esta pantalla'],
    ])('mensaje para %s', async (nextUrl, fragment) => {
      await drop(xlsx());

      void leave(nextUrl);

      expect(options().nzContent).toBe(`Los cambios realizados se perderán si ${fragment}. ¿Deseas continuar?`);
    });

    it('un segundo intento con el diálogo abierto devuelve false sin abrir otro', async () => {
      await drop(xlsx());

      const first = leave('/conciliacion');
      expect(leave('/dashboard')).toBe(false);

      expect(confirm).toHaveBeenCalledTimes(1);
      options().nzOnOk();
      await expect(first).resolves.toBe(true);
    });

    it('tras resolver (aceptar o cancelar) el diálogo puede volver a abrirse', async () => {
      await drop(xlsx());

      const first = leave('/conciliacion');
      options(0).nzOnCancel();
      await expect(first).resolves.toBe(false);

      const second = leave('/conciliacion');
      expect(second).toBeInstanceOf(Promise);
      expect(confirm).toHaveBeenCalledTimes(2);
      options(1).nzOnOk();
      await expect(second).resolves.toBe(true);

      void leave('/dashboard');
      expect(confirm).toHaveBeenCalledTimes(3);
    });

    it('con "Finalizar" ya pulsado deja salir sin diálogo', async () => {
      await goToStep(2);

      nextButton().click(); // Finalizar

      expect(leave('/conciliacion')).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('en los pasos intermedios (archivo cargado, sin Finalizar) sigue pidiendo confirmación', async () => {
      await goToStep(1);

      void leave('/conciliacion');

      expect(confirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('utilidades de formato', () => {
    // `protected`: se accede vía `any` solo para probar la salida pura.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cmp: any;

    beforeEach(() => {
      cmp = fixture.componentInstance;
    });

    it('formatDate pasa de AAAA-MM-DD a DD/MM/AAAA', () => {
      expect(cmp.formatDate('2026-09-01')).toBe('01/09/2026');
      expect(cmp.formatDate('2026-12-31')).toBe('31/12/2026');
    });
  });
});
