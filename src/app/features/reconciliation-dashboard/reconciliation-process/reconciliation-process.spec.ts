import { formatNumber } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Subject } from 'rxjs';
import type { Mock } from 'vitest';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../../core/country/active-country';
import { MoneyPipe } from '../../../core/country/money.pipe';
import { BankStatementReader } from '../data/bank-statement-reader.service';
import { BankStatementResult } from '../data/bank-statement.util';
import { ReconciliationProcessApi, SubmitBankStatementResponse } from '../data/reconciliation-process-api.service';
import { ReconciliationLineSide, ReconciliationResult, ReconciliationResultRow } from '../data/reconciliation-result.model';
import { LINE_ACTION_LABEL, LineResolution } from './line-detail/line-detail';
import { ReconciliationProcess } from './reconciliation-process';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xlsx(name = 'bancolombia_Reporte_Conciliar_20260702_20260706.xlsx', content = 'contenido'): File {
  return new File([content], name, { type: XLSX_TYPE });
}

const VALID: BankStatementResult = {
  state: 'valid',
  summary: { totalRecords: 12345, totalAmount: 1234567.5, dateFrom: '2026-07-02', dateTo: '2026-07-06' },
  reason: null,
  missingColumns: [],
  invalidRows: [],
};

const INVALID: BankStatementResult = {
  state: 'invalid',
  summary: null,
  reason: 'No coincide con el formato del reporte de Bancolombia: faltan columnas.',
  missingColumns: ['NIT', 'VALOR TOTAL', 'FECHA DE CANJE'],
  invalidRows: [],
};

const MISSING_FIELDS: BankStatementResult = {
  state: 'missing_fields',
  summary: null,
  reason: '2 fila(s) con campos inválidos.',
  missingColumns: [],
  invalidRows: [
    { row: 3, fields: ['VALOR TOTAL'] },
    { row: 8, fields: ['VALOR TOTAL', 'FECHA DE CANJE'] },
  ],
};

const ERROR: BankStatementResult = {
  state: 'error',
  summary: null,
  reason: 'No se pudo leer el archivo.',
  missingColumns: [],
  invalidRows: [],
};

const side = (reference: string, amount: number): ReconciliationLineSide => ({
  reference,
  amount,
  concept: `Concepto ${reference}`,
  paymentMethod: 'Tarjeta',
});

// `efectivo`/`CORTE-0827-02` existe como `amount_mismatch` en el mock: el detalle tiene candidatos reales.
const ROWS: ReconciliationResultRow[] = [
  {
    id: 'bbva:BBVA-0001',
    date: '2026-09-12',
    reference: 'BBVA-0001',
    tenderMedia: 'bbva',
    pos: side('BBVA-0001', 2000),
    bank: side('BBVA-0001', 2000),
    difference: 0,
    comment: 'Coincide sin diferencias.',
    status: 'coincide',
  },
  {
    id: 'efectivo:CORTE-0827-02',
    date: '2026-09-10',
    reference: 'CORTE-0827-02',
    tenderMedia: 'efectivo',
    pos: side('CORTE-0827-02', 1234.5),
    bank: side('CORTE-0827-02', 1200),
    difference: 34.5,
    comment: 'El banco liquidó un monto distinto.',
    status: 'diferencia',
  },
  {
    id: 'rappi:RAP-0001',
    date: '2026-09-08',
    reference: 'RAP-0001',
    tenderMedia: 'rappi',
    pos: side('RAP-0001', 350),
    bank: null,
    difference: 350,
    comment: 'Venta sin movimiento en el banco.',
    status: 'sin_coincidencia',
  },
  {
    id: 'didi_food:DIDI-0001',
    date: '2026-09-05',
    reference: 'DIDI-0001',
    tenderMedia: 'didi_food',
    pos: null,
    bank: side('DIDI-0001', 99.9),
    difference: -99.9,
    comment: 'Movimiento sin venta en el POS.',
    status: 'sin_coincidencia',
  },
];

const RESULT: ReconciliationResult = {
  total: 1243,
  totals: { pos: 3584.5, bank: 3299.9 },
  kpis: {
    coincidencias: { count: 1120, percentage: 90.1 },
    diferencias: { count: 62, percentage: 5 },
    sinCoincidencias: { count: 61, percentage: 4.9 },
  },
  rows: ROWS,
};

// `n` líneas coincidentes (para probar la paginación a 10).
function manyRows(n: number): ReconciliationResultRow[] {
  return Array.from({ length: n }, (_, i) => {
    const reference = `R-${String(i + 1).padStart(2, '0')}`;
    return {
      id: `bbva:R-${i + 1}`,
      date: '2026-09-01',
      reference,
      tenderMedia: 'bbva' as const,
      pos: side(reference, 100 + i),
      bank: side(reference, 100 + i),
      difference: 0,
      comment: 'Coincide sin diferencias.',
      status: 'coincide' as const,
    };
  });
}

// Promesa que el test resuelve cuando quiere (para probar `reading()` y la carrera).
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('ReconciliationProcess', () => {
  let fixture: ComponentFixture<ReconciliationProcess>;
  let el: HTMLElement;
  let message: { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };
  let reader: { read: ReturnType<typeof vi.fn> };
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let api: { submitBankStatement: ReturnType<typeof vi.fn> };
  // Respuesta (simulada) del back al enviar el extracto: la dispara `answer()`.
  let submit$: Subject<SubmitBankStatementResponse>;

  beforeEach(async () => {
    // Fake timers: el paso 2 usa `interval` (1 s) y el avance es determinista.
    vi.useFakeTimers();
    submit$ = new Subject<SubmitBankStatementResponse>();
    api = { submitBankStatement: vi.fn(() => submit$) };
    message = { error: vi.fn(), success: vi.fn() };
    // Por defecto el extracto se lee como válido; cada test puede cambiarlo.
    reader = { read: vi.fn().mockResolvedValue(VALID) };

    await TestBed.configureTestingModule({
      imports: [ReconciliationProcess],
      providers: [
        provideRouter([]),
        provideCountry(ACTIVE_COUNTRY),
        { provide: NzMessageService, useValue: message },
        { provide: BankStatementReader, useValue: reader },
        { provide: ReconciliationProcessApi, useValue: api },
        // El detalle de la línea (real) exige el permiso de gestión.
        { provide: AccessControlService, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();

    // Sin navegación real (onBack / routerLink).
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

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

  async function renderRun(): Promise<void> {
    await render('CON-0007');
  }

  const steps = () => Array.from(el.querySelectorAll<HTMLElement>('nz-step'));
  // "Siguiente"/"Finalizar" es el botón primario del pie (en el paso 2 con
  // resultado, "Descargar" va antes).
  const nextButton = () => el.querySelector<HTMLButtonElement>('.process-footer button.ant-btn-primary')!;
  const footerButtons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.process-footer button'));
  const dropzoneRow = () => el.querySelector<HTMLElement>('.import-dropzone-row')!;
  const fileInput = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;
  const loadedBox = () => el.querySelector<HTMLElement>('.file-loaded');
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

  // El back responde al extracto enviado al entrar al paso 2.
  async function answer(result: ReconciliationResult = RESULT): Promise<void> {
    submit$.next({ runId: 'CON-0007', accepted: true, result });
    submit$.complete();
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

  // Avanza hasta el paso `index` (base 0); responde el envío y marca las líneas si hay que pasar el paso 2.
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
  const progress = () => internals().validationProgress();

  describe('conciliación inexistente', () => {
    it('con un runId desconocido muestra el aviso y no pinta los steps', async () => {
      await render('CON-9999');

      expect(el.textContent).toContain('Esta conciliación no existe.');
      expect(el.querySelector('nz-steps')).toBeNull();
      expect(steps()).toHaveLength(0);
      expect(el.querySelector('nz-page-header')).toBeNull();
    });

    it('sin runId muestra el aviso y no pinta los steps', async () => {
      await render();

      expect(el.textContent).toContain('Esta conciliación no existe.');
      expect(el.querySelector('nz-steps')).toBeNull();
    });
  });

  describe('conciliación existente', () => {
    beforeEach(renderRun);

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

    it('muestra en la cabecera id, restaurante y periodo', () => {
      const header = el.querySelector('nz-page-header')!;
      expect(header.textContent).toContain('Nueva conciliación');
      const subtitle = header.querySelector('nz-page-header-content')!.textContent!.replace(/\s+/g, ' ').trim();
      expect(subtitle).toBe('CON-0007 · Cóctel del Mar Chapinero · 01/09/2026 – 15/09/2026');
    });

    it('la flecha de volver navega a /conciliacion', () => {
      el.querySelector<HTMLElement>('.ant-page-header-back-button')!.click();
      expect(navigateByUrl).toHaveBeenCalledWith('/conciliacion');
    });
  });

  describe('paso 1 · archivo bancario', () => {
    beforeEach(renderRun);

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
      it('soltar un .xlsx lo lee con el lector y muestra nombre, tamaño e indicador', async () => {
        const file = xlsx('banco-julio.xlsx', 'x'.repeat(2048));
        await drop(file);

        expect(reader.read).toHaveBeenCalledTimes(1);
        expect(reader.read).toHaveBeenCalledWith(file);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('banco-julio.xlsx');
        expect(loadedBox()!.textContent).toContain('Archivo cargado correctamente');
        expect(loadedBox()!.textContent).toContain('2.0 KB');
        expect(message.error).not.toHaveBeenCalled();
      });

      it('elegir un .xlsx con el selector también lo lee', async () => {
        const file = xlsx('elegido.xlsx');
        await pick(file);

        expect(reader.read).toHaveBeenCalledWith(file);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('elegido.xlsx');
        expect(nextButton().disabled).toBe(false);
      });

      it('la extensión .XLSX en mayúsculas también se acepta', async () => {
        await drop(xlsx('EXTRACTO.XLSX'));

        expect(reader.read).toHaveBeenCalledTimes(1);
        expect(message.error).not.toHaveBeenCalled();
      });

      it('soltar un .csv lo rechaza con aviso y no lo lee', async () => {
        await drop(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

        expect(message.error).toHaveBeenCalledTimes(1);
        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(reader.read).not.toHaveBeenCalled();
        expect(loadedBox()).toBeNull();
        expect(el.textContent).not.toContain('extracto.csv');
        expect(nextButton().disabled).toBe(true);
      });

      it('elegir un .csv con el selector también se rechaza', async () => {
        await pick(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(reader.read).not.toHaveBeenCalled();
        expect(loadedBox()).toBeNull();
        expect(nextButton().disabled).toBe(true);
      });

      it('soltar un .txt, un .xls o una imagen se rechaza', async () => {
        await drop(new File(['x'], 'extracto.txt', { type: 'text/plain' }));
        await drop(new File(['x'], 'extracto.xls', { type: 'application/vnd.ms-excel' }));
        await drop(new File(['x'], 'foto.png', { type: 'image/png' }));

        expect(message.error).toHaveBeenCalledTimes(3);
        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(reader.read).not.toHaveBeenCalled();
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
        expect(reader.read).toHaveBeenCalledTimes(1);
        expect(nextButton().disabled).toBe(false);
      });

      it('soltar sin archivos no cambia nada', async () => {
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { files: [] } });
        dropzoneRow().dispatchEvent(event);
        fixture.detectChanges();

        expect(loadedBox()).toBeNull();
        expect(reader.read).not.toHaveBeenCalled();
        expect(message.error).not.toHaveBeenCalled();
      });
    });

    describe('card "Banco (extracto bancario)"', () => {
      it('antes de cargar solo muestra el encabezado y el texto inicial', () => {
        expect(bankCard().textContent).toContain('Banco (extracto bancario)');
        expect(bankCard().textContent).toContain('Carga el extracto bancario para ver su resumen.');
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
        expect(el.textContent).not.toContain('Carga el extracto bancario para ver su resumen.');
        expect(loading()).toBeNull();
        expect(nextButton().disabled).toBe(false);
      });

      it('archivo inválido: leyenda de error con el motivo y TODAS las columnas faltantes, sin filas', async () => {
        reader.read.mockResolvedValue(INVALID);
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(legend()!.classList.contains('status-legend-error')).toBe(true);
        expect(legend()!.classList.contains('status-legend-warning')).toBe(false);
        expect(legend()!.classList.contains('status-legend-success')).toBe(false);
        expect(reason()!.textContent!.trim()).toBe(INVALID.reason);
        expect(Array.from(el.querySelectorAll('ul.statement-list--error li')).map((li) => li.textContent!.trim())).toEqual([
          'NIT',
          'VALOR TOTAL',
          'FECHA DE CANJE',
        ]);
        expect(el.querySelector('ul.statement-list--warning')).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(el.textContent).not.toContain('Carga el extracto bancario para ver su resumen.');
        expect(nextButton().disabled).toBe(true);
        // El archivo sí se cargó (se ve su nombre); lo que falla es la revisión.
        expect(loadedBox()).not.toBeNull();
      });

      it('campos faltantes: leyenda de advertencia con el motivo y "Fila N: CAMPO, CAMPO" por fila', async () => {
        reader.read.mockResolvedValue(MISSING_FIELDS);
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Campos faltantes');
        expect(legend()!.classList.contains('status-legend-warning')).toBe(true);
        expect(legend()!.classList.contains('status-legend-error')).toBe(false);
        expect(legend()!.classList.contains('status-legend-success')).toBe(false);
        expect(reason()!.textContent!.trim()).toBe('2 fila(s) con campos inválidos.');
        expect(Array.from(el.querySelectorAll('ul.statement-list--warning li')).map((li) => li.textContent!.trim())).toEqual([
          'Fila 3: VALOR TOTAL',
          'Fila 8: VALOR TOTAL, FECHA DE CANJE',
        ]);
        expect(el.querySelector('ul.statement-list--error')).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(nextButton().disabled).toBe(true);
      });

      it('error al leer: leyenda de error con el motivo y "Siguiente" deshabilitado', async () => {
        reader.read.mockResolvedValue(ERROR);
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Error en el archivo');
        expect(legend()!.classList.contains('status-legend-error')).toBe(true);
        expect(legend()!.classList.contains('status-legend-success')).toBe(false);
        expect(reason()!.textContent!.trim()).toBe('No se pudo leer el archivo.');
        expect(el.querySelector('.statement-list')).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(nextButton().disabled).toBe(true);
      });

      it('un resultado sin motivo no pinta el texto del motivo', async () => {
        reader.read.mockResolvedValue({
          state: 'invalid',
          summary: null,
          reason: null,
          missingColumns: [],
          invalidRows: [],
        } satisfies BankStatementResult);
        await drop(xlsx());

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(reason()).toBeNull();
      });

      it('mientras se lee muestra el spinner y oculta resumen, leyenda y texto inicial', async () => {
        const pending = deferred<BankStatementResult>();
        reader.read.mockReturnValue(pending.promise);

        await drop(xlsx());

        expect(loading()).not.toBeNull();
        expect(loading()!.querySelector('nz-spin')).not.toBeNull();
        expect(loading()!.textContent).toContain('Revisando el archivo');
        expect(legend()).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(el.textContent).not.toContain('Carga el extracto bancario para ver su resumen.');
        expect(nextButton().disabled).toBe(true);
        // El archivo ya se ve cargado mientras se revisa.
        expect(loadedBox()).not.toBeNull();

        pending.resolve(VALID);
        await settle();

        expect(loading()).toBeNull();
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(statementRows()).toHaveLength(3);
        expect(nextButton().disabled).toBe(false);
      });

      it('si la lectura termina en inválido, el spinner desaparece y se ve la leyenda', async () => {
        const pending = deferred<BankStatementResult>();
        reader.read.mockReturnValue(pending.promise);
        await pick(xlsx());
        expect(loading()).not.toBeNull();

        pending.resolve(INVALID);
        await settle();

        expect(loading()).toBeNull();
        expect(legend()!.classList.contains('status-legend-error')).toBe(true);
      });

      it('cargar otro archivo descarta el resultado anterior y vuelve a mostrar el spinner', async () => {
        await drop(xlsx('primero.xlsx'));
        expect(nextButton().disabled).toBe(false);

        const pending = deferred<BankStatementResult>();
        reader.read.mockReturnValue(pending.promise);
        await drop(xlsx('segundo.xlsx'));

        expect(loading()).not.toBeNull();
        expect(legend()).toBeNull();
        expect(statementRows()).toHaveLength(0);
        expect(nextButton().disabled).toBe(true);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('segundo.xlsx');

        pending.resolve(INVALID);
        await settle();

        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(nextButton().disabled).toBe(true);
      });

      it('carrera: si la primera lectura termina después, gana la última carga', async () => {
        const first = deferred<BankStatementResult>();
        const second = deferred<BankStatementResult>();
        reader.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        await drop(xlsx('primero.xlsx'));
        await drop(xlsx('segundo.xlsx'));

        second.resolve(VALID);
        await settle();
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(loading()).toBeNull();

        first.resolve(INVALID); // llega tarde: no debe pisar al resultado vigente
        await settle();

        expect(reader.read).toHaveBeenCalledTimes(2);
        expect(legend()!.textContent!.trim()).toBe('Archivo válido');
        expect(legend()!.classList.contains('status-legend-success')).toBe(true);
        expect(statementRows()).toHaveLength(3);
        expect(loadedBox()!.querySelector('.file-loaded__name')?.textContent?.trim()).toBe('segundo.xlsx');
        expect(nextButton().disabled).toBe(false);
      });

      it('carrera: si la primera lectura termina antes, se ignora y sigue el spinner hasta la última', async () => {
        const first = deferred<BankStatementResult>();
        const second = deferred<BankStatementResult>();
        reader.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        await drop(xlsx('primero.xlsx'));
        await drop(xlsx('segundo.xlsx'));

        first.resolve(VALID); // obsoleta: no debe pintarse ni habilitar "Siguiente"
        await settle();

        expect(loading()).not.toBeNull();
        expect(legend()).toBeNull();
        expect(nextButton().disabled).toBe(true);

        second.resolve(INVALID);
        await settle();

        expect(loading()).toBeNull();
        expect(legend()!.textContent!.trim()).toBe('Archivo inválido');
        expect(nextButton().disabled).toBe(true);
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
    beforeEach(renderRun);

    it('"Siguiente" no avanza sin archivo en el paso 1', () => {
      nextButton().click();
      fixture.detectChanges();

      expect(el.querySelector('.import-dropzone')).not.toBeNull();
      expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
    });

    it('"Siguiente" no avanza con un extracto inválido, con campos faltantes o con error', async () => {
      for (const result of [INVALID, MISSING_FIELDS, ERROR]) {
        reader.read.mockResolvedValue(result);
        await drop(xlsx());

        nextButton().click();
        await settle();

        expect(el.querySelector('.import-dropzone')).not.toBeNull();
        expect(steps()[0].classList.contains('ant-steps-item-process')).toBeTruthy();
      }
    });

    it('"Siguiente" no avanza mientras se revisa el archivo', async () => {
      reader.read.mockReturnValue(deferred<BankStatementResult>().promise);
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
      expect(nextButton().textContent).toContain('Siguiente');

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

    it('al entrar envía el extracto al back con (runId, nombre del archivo, resumen)', () => {
      expect(api.submitBankStatement).toHaveBeenCalledTimes(1);
      expect(api.submitBankStatement).toHaveBeenCalledWith(
        'CON-0007',
        'bancolombia_Reporte_Conciliar_20260702_20260706.xlsx',
        VALID.summary,
      );
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
      expect(footerButtons()[0].textContent).toContain('Siguiente');
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

    it('"Siguiente" con todas las líneas marcadas avanza al paso 3 y no vuelve a enviar', async () => {
      await answer();
      await markAllRows();

      nextButton().click();
      await settle();

      expect(steps()[2].classList.contains('ant-steps-item-process')).toBeTruthy();
      expect(el.querySelector('.validation')).toBeNull();
      expect(el.querySelector('nz-table')).toBeNull();
      expect(el.querySelector('.result-kpis')).toBeNull();
      expect(el.querySelector('.process-footer__hint')).toBeNull();
      expect(api.submitBankStatement).toHaveBeenCalledTimes(1);
    });

    it('al destruir el componente se cancela el envío y el temporizador', async () => {
      await tick(2000);
      expect(submit$.observed).toBe(true);
      expect(progress()).toBe(20);

      fixture.destroy();
      await vi.advanceTimersByTimeAsync(5000);

      expect(submit$.observed).toBe(false);
      expect(progress()).toBe(20);
    });
  });

  describe('paso 2 · resultado', () => {
    const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
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
    const MIXED: ReconciliationResult = { ...RESULT, rows: [...manyRows(2), ROWS[1]] };

    async function showResult(result: ReconciliationResult = RESULT): Promise<void> {
      await renderRun();
      await goToStep(1);
      await answer(result);
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

    describe('KPI "Por gestionar" sin líneas por resolver', () => {
      it('es 0 si todas las líneas coinciden', async () => {
        await showResult({ ...RESULT, rows: manyRows(3) });

        expect(kpiValue(kpiCards()[3])).toBe(pendingText(0, 3));
        expect(kpiValue(kpiCards()[3])).toMatch(/^0 \(0[.,]0%\)$/);
      });

      it('es `0 (0.0%)` también sin ninguna línea', async () => {
        await showResult({ ...RESULT, total: 0, rows: [] });

        expect(kpiValue(kpiCards()[3])).toMatch(/^0 \(0[.,]0%\)$/);
      });
    });

    describe('tabla', () => {
      beforeEach(() => showResult());

      it('tiene las columnas checkbox, Fecha, Referencias, POS, Banco y Estado', () => {
        expect(headers()).toEqual(['', 'Fecha', 'Referencias', 'POS', 'Banco', 'Estado']);
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

      it('Referencias: referencia como título y el medio de pago como subtítulo', () => {
        expect(
          bodyRows().map((row) => [
            norm(row.querySelector('.cell-title')?.textContent),
            norm(row.querySelector('.cell-subtitle')?.textContent),
          ]),
        ).toEqual([
          ['BBVA-0001', 'BBVA'],
          ['CORTE-0827-02', 'Efectivo'],
          ['RAP-0001', 'Rappi'],
          ['DIDI-0001', 'DiDi Food'],
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
      beforeEach(() => showResult({ ...RESULT, rows: manyRows(25) }));

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

        expect([...internals().selectedIds()]).toEqual(['bbva:BBVA-0001']);
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

        expect([...internals().selectedIds()].sort()).toEqual(['bbva:BBVA-0001', 'efectivo:CORTE-0827-02']);
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
      beforeEach(() => showResult({ ...RESULT, rows: manyRows(25) }));

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

      const diffRow = () => bodyRows()[1]; // efectivo / CORTE-0827-02
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
        expect(managing()).toBe(ROWS[1]);
        const detail = lineDetail()!;
        expect(detail).not.toBeNull();
        expect(norm(detail.textContent)).toContain('Banco (Movimientos)');
        expect(norm(detail.textContent)).toContain('El banco liquidó un monto distinto.');
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
        expect(footerButtons().map((b) => norm(b.textContent))).toEqual(['Siguiente']);
      });

      it('con resultado aparece "Descargar" antes de "Siguiente", con icono y label', async () => {
        await showResult();

        const buttons = footerButtons();
        expect(buttons.map((b) => norm(b.textContent))).toEqual(['Descargar', 'Siguiente']);
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
            '﻿Fecha,Referencia,Medio de pago,POS,Banco,Estado',
            '2026-09-12,BBVA-0001,BBVA,2000.00,2000.00,Coincide',
            '2026-09-10,CORTE-0827-02,Efectivo,1234.50,1200.00,Diferencia',
            '2026-09-08,RAP-0001,Rappi,350.00,,Sin coincidencia',
            '2026-09-05,DIDI-0001,DiDi Food,,99.90,Sin coincidencia',
          ].join('\n'),
        );
      });

      it('descarga todas las líneas aunque haya una selección parcial o más de una página', async () => {
        await showResult({ ...RESULT, rows: manyRows(25) });
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
        await showResult({ ...RESULT, rows: manyRows(3) });
        await finishWith([]);

        expect(metrics()[2].value).toBe('0');
        expect(metrics()[3].value).toBe(`3 (${fmt(100, '1.1-1')}%)`);
      });

      it('el porcentaje se redondea a un decimal (1 de 3 = 33.3%)', async () => {
        await showResult({ ...RESULT, rows: ROWS.slice(0, 3) });
        await finishWith(['pendiente', 'pendiente']);

        expect(metrics()[3].value).toBe(`1 (${fmt(33.3, '1.1-1')}%)`);
      });

      it('sin líneas el porcentaje es 0 y no se divide entre cero', async () => {
        await showResult({ ...RESULT, rows: [], totals: { pos: 0, bank: 0 } });
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
