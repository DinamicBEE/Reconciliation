import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AccessControlService } from '../../../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../../../core/country/active-country';
import { MoneyPipe } from '../../../../core/country/money.pipe';
import { PermissionKey } from '../../../../shared/models/access.model';
import { SettlementTransaction } from '../../../../shared/models/reconciliation-item.model';
import { DifferenceManagementService } from '../../../difference-management/data/difference-management.service';
import { BankStatementReader } from '../../data/bank-statement-reader.service';
import { BankStatementResult } from '../../data/bank-statement.util';
import { MOCK_RECONCILIATION_RESULT } from '../../data/reconciliation-result.mock-data';
import { ReconciliationBankMovement, ReconciliationResultRow } from '../../data/reconciliation-result.model';
import { bankTotal, movementFromSettlement } from '../../data/reconciliation-result.util';
import { LINE_ACTION_LABEL, LineDetail, LineResolution } from './line-detail';

const rows = MOCK_RECONCILIATION_RESULT.rows;
// `amount_mismatch` de efectivo (con candidatos y una liquidación sugerida), `sale_only` de DiDi y más casos del mock.
const MISMATCH = rows.find((r) => r.tenderMedia === 'efectivo' && r.reference === 'CORTE-0827-02')!;
const SALE_ONLY = rows.find((r) => r.tenderMedia === 'didi_food' && r.reference === 'DIDI-041')!;
const SETTLEMENT_ONLY = rows.find((r) => r.status === 'sin_coincidencia' && r.pos === null)!;
const MATCHED = rows.find((r) => r.status === 'coincide')!;

const NOTE = 'Pago parcial verificado';
const EMPTY_NOTE_ERROR = 'Escribe el motivo de la acción.';
const WEAK_NOTE_ERROR = 'Describe el motivo con palabras completas (mínimo 10 caracteres y dos palabras).';

const VALID: BankStatementResult = {
  state: 'valid',
  summary: { totalRecords: 10, totalAmount: 5000, dateFrom: '2026-07-02', dateTo: '2026-07-06' },
  reason: null,
  missingColumns: [],
  invalidRows: [],
};
const INVALID: BankStatementResult = {
  state: 'invalid',
  summary: null,
  reason: 'No coincide con el formato del reporte de Bancolombia: faltan columnas.',
  missingColumns: ['NIT', 'VALOR TOTAL'],
  invalidRows: [],
};
const MISSING_FIELDS: BankStatementResult = {
  state: 'missing_fields',
  summary: null,
  reason: '1 fila(s) con campos inválidos.',
  missingColumns: [],
  invalidRows: [{ row: 4, fields: ['VALOR TOTAL'] }],
};
const ERROR: BankStatementResult = {
  state: 'error',
  summary: null,
  reason: 'No se pudo leer el archivo.',
  missingColumns: [],
  invalidRows: [],
};

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const round2 = (value: number) => Math.round(value * 100) / 100;
const xlsx = (name = 'extracto.xlsx') =>
  new File(['contenido'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

function imported(id: string, amount: number): SettlementTransaction {
  return {
    id,
    date: '2026-09-10',
    orderId: `REF-${id}`,
    tenderMedia: 'efectivo',
    amount,
    batchId: 'CSV-IMPORTADO',
    description: 'Importada',
  };
}

const movement = (id: string, amount: number, date = '2026-09-10'): ReconciliationBankMovement => ({
  id,
  date,
  reference: `MOV-${id}`,
  amount,
  concept: `Abono ${id}`,
  paymentMethod: 'Efectivo',
});

// Línea de efectivo (mismo medio y referencia que MISMATCH), con monto, movimientos y candidatos propios.
const customRow = (
  posAmount: number,
  bank: ReconciliationBankMovement[],
  candidates: ReconciliationBankMovement[] = MISMATCH.candidates,
): ReconciliationResultRow => ({
  ...MISMATCH,
  pos: { ...MISMATCH.pos!, amount: posAmount },
  bank,
  candidates,
  difference: round2(posAmount - bankTotal(bank)),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('LineDetail', () => {
  let fixture: ComponentFixture<LineDetail>;
  let el: HTMLElement;
  let permissions: PermissionKey[];
  let emitted: LineResolution[];
  let message: {
    success: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let reader: { read: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    permissions = ['manage_differences'];
    emitted = [];
    message = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
    reader = { read: vi.fn().mockResolvedValue(VALID) };
  });

  async function render(row: ReconciliationResultRow, resolution: LineResolution | null = null): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LineDetail],
      providers: [
        provideCountry(ACTIVE_COUNTRY),
        { provide: NzMessageService, useValue: message },
        { provide: BankStatementReader, useValue: reader },
        {
          provide: AccessControlService,
          useValue: { hasPermission: (key: PermissionKey) => permissions.includes(key) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LineDetail);
    el = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('row', row);
    fixture.componentRef.setInput('resolution', resolution);
    fixture.componentInstance.resolved.subscribe((r) => emitted.push(r));
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const money = (value: number) => norm(TestBed.runInInjectionContext(() => new MoneyPipe().transform(value)));
  const service = () => fixture.debugElement.injector.get(DifferenceManagementService);
  const cards = () => Array.from(el.querySelectorAll<HTMLElement>('.line-cards nz-card'));
  const fields = (card: HTMLElement) =>
    Array.from(card.querySelectorAll<HTMLElement>('.line-field')).map((f) => [
      norm(f.querySelector('dt')?.textContent),
      norm(f.querySelector('dd')?.textContent),
    ]);
  const bankCard = () => el.querySelector<HTMLElement>('.bank-card')!;
  const bankRows = () =>
    Array.from(bankCard().querySelectorAll<HTMLTableRowElement>('tbody tr')).filter(
      (tr) => !tr.classList.contains('ant-table-placeholder') && !tr.classList.contains('ant-table-measure-row'),
    );
  const bankRowTexts = () =>
    bankRows().map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => norm(td.textContent)));
  const bankCount = () => norm(el.querySelector('.bank-card__count')?.textContent);
  const bankTotalText = () => norm(el.querySelector('.bank-total__value')?.textContent);
  const coverageText = () => norm(el.querySelector('.coverage__text')?.textContent);
  const coverageFill = () => el.querySelector<HTMLElement>('.coverage__fill');
  const dateText = (iso: string) => iso.split('-').reverse().join('/');
  const movementRow = (m: ReconciliationBankMovement) => [
    dateText(m.date),
    norm(`${m.reference}${m.concept}`),
    money(m.amount),
  ];
  const selectedMovements = () =>
    service()
      .candidates()
      .filter((c) => service().isSelected(c.settlement.id))
      .map((c) => movementFromSettlement(c.settlement));
  const diffCard = () => el.querySelector<HTMLElement>('.line-top__difference nz-card')!;
  const diffValue = () => norm(el.querySelector('.line-difference__value')?.textContent);
  // `#line-notes` es un span de solo lectura o, al elegir una acción, el input.
  const noteField = () => el.querySelector<HTMLElement>('#line-notes')!;
  const noteInput = () => el.querySelector<HTMLInputElement>('input#line-notes');
  const noteText = () => norm(el.querySelector('span#line-notes')?.textContent);
  const noteError = () => el.querySelector<HTMLElement>('.info-field__error');
  const candidateCards = () => Array.from(el.querySelectorAll<HTMLElement>('app-candidate-list .candidate-card'));
  const selectedCards = () => candidateCards().filter((c) => c.classList.contains('candidate-card--selected'));
  const unselectedCards = () => candidateCards().filter((c) => !c.classList.contains('candidate-card--selected'));
  const cardRef = (card: HTMLElement) =>
    norm(card.querySelector('.candidate-card__field--ref .candidate-card__value')?.textContent);
  const actionButtons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.line-actions button'));
  const button = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => norm(b.textContent) === label);
  const adjustButton = () => el.querySelector<HTMLButtonElement>('.line-actions__confirm');
  const reconcileButton = () => el.querySelector<HTMLButtonElement>('.line-import__footer button');
  const fileInput = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;
  const legend = () => el.querySelector<HTMLElement>('.status-legend');
  const progressText = () => norm(el.querySelector('.line-import .ant-progress-text')?.textContent);
  const RECONCILE_MS = 5000;
  const FAKE_INTERVAL = { toFake: ['setInterval' as const, 'clearInterval' as const] };

  afterEach(() => vi.useRealTimers());

  async function advance(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await settle();
  }

  async function click(target: HTMLElement | null | undefined): Promise<void> {
    target!.click();
    await settle();
  }

  async function write(text: string): Promise<void> {
    noteInput()!.value = text;
    noteInput()!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function blur(): Promise<void> {
    noteInput()!.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function pick(file: File): Promise<void> {
    Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
    fileInput().dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  it('los datos de prueba existen en el mock (efectivo con diferencia, DiDi solo POS, solo banco, coincidente)', () => {
    expect(MISMATCH.status).toBe('diferencia');
    expect(SALE_ONLY.status).toBe('sin_coincidencia');
    expect(SALE_ONLY.bank).toEqual([]);
    expect(SETTLEMENT_ONLY.pos).toBeNull();
    expect(MATCHED.status).toBe('coincide');
  });

  describe('POS y banco', () => {
    it('pinta dos cards, POS (1/3) y "Banco (Movimientos)" (2/3), cada una con su icono de banco', async () => {
      await render(MISMATCH);

      expect(cards()).toHaveLength(2);
      expect(cards().map((c) => norm(c.querySelector('.process-source__title')?.textContent))).toEqual([
        'POS',
        'Banco (Movimientos)',
      ]);
      expect(cards()[1].classList.contains('bank-card')).toBe(true);
      expect(el.querySelectorAll('.bank-badge svg')).toHaveLength(2);
      expect(el.querySelectorAll('dl.line-fields')).toHaveLength(1);
    });

    it('el POS muestra referencia, monto con `money`, concepto y método de pago', async () => {
      await render(MISMATCH);
      const { pos } = MISMATCH;

      expect(fields(cards()[0])).toEqual([
        ['Referencia', pos!.reference],
        ['Monto', money(pos!.amount)],
        ['Concepto', pos!.concept],
        ['Método de pago', pos!.paymentMethod],
      ]);
      expect(norm(cards()[0].querySelector('dd.font-mono')?.textContent)).toBe(pos!.reference);
    });

    it('el banco es una tabla con Fecha, Referencia y Monto', async () => {
      await render(MISMATCH);

      expect(Array.from(bankCard().querySelectorAll('thead th')).map((th) => norm(th.textContent))).toEqual([
        'Fecha',
        'Referencia',
        'Monto',
      ]);
    });

    it('lista un renglón por movimiento con fecha, referencia, concepto como subtítulo y monto', async () => {
      await render(MISMATCH);

      expect(MISMATCH.bank).toHaveLength(5);
      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
      expect(bankRows()[0].querySelector('.cell-title')?.textContent?.trim()).toBe(MISMATCH.bank[0].reference);
      expect(bankRows()[0].querySelector('.cell-subtitle')?.textContent?.trim()).toBe(MISMATCH.bank[0].concept);
    });

    it('el contador usa plural con varios movimientos y singular con uno', async () => {
      await render(MISMATCH);
      expect(bankCount()).toBe('5 movimientos');

      TestBed.resetTestingModule();
      await render(customRow(100, [movement('U1', 100)]));
      expect(bankCount()).toBe('1 movimiento');
      expect(bankRows()).toHaveLength(1);
    });

    it('sin movimiento en el banco muestra el texto vacío, contador y total en 0, y conserva el POS', async () => {
      await render(SALE_ONLY);

      expect(fields(cards()[0])[0]).toEqual(['Referencia', SALE_ONLY.pos!.reference]);
      expect(bankRows()).toHaveLength(0);
      expect(norm(cards()[1].textContent)).toContain('No hay un movimiento en el banco para esta línea.');
      expect(bankCount()).toBe('0 movimientos');
      expect(bankTotalText()).toBe(money(0));
      expect(coverageText()).toBe('Cubre el 0% del monto del POS');
      expect(cards()[0].textContent).not.toContain('No hay una venta');
    });

    it('sin venta en el POS muestra el texto vacío, conserva el banco y no pinta la cobertura', async () => {
      await render(SETTLEMENT_ONLY);

      expect(cards()[0].querySelector('dl')).toBeNull();
      expect(norm(cards()[0].textContent)).toContain('No hay una venta en el POS para esta línea.');
      expect(bankRowTexts()).toEqual(SETTLEMENT_ONLY.bank.map(movementRow));
      expect(el.querySelector('.coverage')).toBeNull();
    });
  });

  describe('tabla del banco con varios movimientos', () => {
    it('renderiza los 5 movimientos dentro de .bank-card__scroll, con un solo encabezado', async () => {
      await render(MISMATCH);
      const scroll = bankCard().querySelector<HTMLElement>('.bank-card__scroll')!;

      expect(scroll).not.toBeNull();
      expect(scroll.querySelectorAll('nz-table')).toHaveLength(1);
      expect(scroll.querySelectorAll('thead tr')).toHaveLength(1);
      expect(
        Array.from(scroll.querySelectorAll('tbody tr')).filter((tr) => !tr.classList.contains('ant-table-measure-row')),
      ).toHaveLength(5);
      expect(bankRows().every((tr) => scroll.contains(tr))).toBe(true);
      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
    });

    it('el total, la cobertura y el contador salen de los 5 movimientos', async () => {
      await render(MISMATCH);

      expect(bankCount()).toBe('5 movimientos');
      expect(bankTotalText()).toBe(money(bankTotal(MISMATCH.bank)));
      expect(diffValue()).toBe(money(MISMATCH.difference));
    });

    it('el total y la cobertura quedan fuera del área con scroll', async () => {
      await render(MISMATCH);
      const scroll = bankCard().querySelector<HTMLElement>('.bank-card__scroll')!;

      expect(scroll.contains(el.querySelector('.bank-total'))).toBe(false);
      expect(scroll.contains(el.querySelector('.coverage'))).toBe(false);
    });

    it('con un solo movimiento también va dentro de .bank-card__scroll', async () => {
      await render(customRow(100, [movement('U1', 100)]));

      expect(bankCard().querySelectorAll('.bank-card__scroll tbody tr:not(.ant-table-measure-row)')).toHaveLength(1);
    });
  });

  describe('total y cobertura del banco', () => {
    it('el total es la suma de los movimientos con `money`', async () => {
      await render(MISMATCH);

      expect(bankTotalText()).toBe(money(bankTotal(MISMATCH.bank)));
      expect(norm(el.querySelector('.bank-total__label')?.textContent)).toBe('Total banco');
    });

    it('muestra "Cubre el X% del monto del POS" con un decimal y la barra al mismo ancho', async () => {
      await render(customRow(300, [movement('A', 100), movement('B', 100)]));

      expect(coverageText()).toBe('Cubre el 66.7% del monto del POS');
      expect(coverageFill()!.style.width).toBe('66.7%');
      expect(el.querySelector('.coverage__bar')!.getAttribute('aria-valuenow')).toBe('66.7');
    });

    it('con el POS cubierto al 100% la barra se llena y usa la variante success', async () => {
      await render(customRow(100, [movement('A', 60), movement('B', 40)]));

      expect(coverageText()).toBe('Cubre el 100% del monto del POS');
      expect(coverageFill()!.style.width).toBe('100%');
      expect(coverageFill()!.classList.contains('coverage__fill--success')).toBe(true);
    });

    it('con más del 100% el texto conserva el porcentaje real y la barra se topa a 100', async () => {
      await render(customRow(100, [movement('A', 80), movement('B', 70)]));

      expect(coverageText()).toBe('Cubre el 150% del monto del POS');
      expect(coverageFill()!.style.width).toBe('100%');
      expect(diffValue()).toBe(money(-50));
    });

    it('la barra toma la variante de la línea cuando hay diferencia', async () => {
      await render(MISMATCH);

      expect(coverageFill()!.classList.contains('coverage__fill--warning')).toBe(true);
    });
  });

  describe('layout: diferencia y notas', () => {
    beforeEach(() => render(MISMATCH));

    it('la diferencia y las notas comparten la fila .line-top', () => {
      const top = el.querySelector<HTMLElement>('.line-top')!;

      expect(top.querySelector('.line-top__difference')).not.toBeNull();
      expect(top.querySelector('.line-top__notes')).not.toBeNull();
      expect(top.querySelector('.line-top__difference nz-card')).not.toBeNull();
      expect(top.querySelector('.info-field #line-notes')).not.toBeNull();
    });

    it('la diferencia es una nz-card.status-card con el valor grande y la etiqueta "Diferencia" debajo', () => {
      const card = diffCard();
      const value = card.querySelector<HTMLElement>('.line-difference__value')!;
      const label = card.querySelector<HTMLElement>('.line-difference__label')!;

      expect(card.classList.contains('status-card')).toBe(true);
      expect(value.classList.contains('font-mono')).toBe(true);
      expect(norm(value.textContent)).toBe(money(MISMATCH.difference));
      expect(norm(label.textContent)).toBe('Diferencia');
      expect(value.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(el.querySelector('.line-summary')).toBeNull();
    });

    it('el campo se llama "Notas" (ya no "Comentario") y su label apunta al campo #line-notes', () => {
      const label = el.querySelector<HTMLLabelElement>('.info-field__label')!;

      expect(norm(label.textContent)).toBe('Notas');
      expect(label.tagName).toBe('LABEL');
      expect(label.htmlFor).toBe('line-notes');
      expect(noteField().id).toBe('line-notes');
      expect(el.textContent).not.toContain('Comentario');
    });

    it('los botones de acción van al fondo de la columna de notas, después del campo', () => {
      const notes = el.querySelector<HTMLElement>('.line-top__notes')!;
      const actions = el.querySelector<HTMLElement>('.line-actions')!;

      expect(notes.contains(actions)).toBe(true);
      expect(noteField().compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('la fila va después de las cards POS y Banco', () => {
      const cardsSection = el.querySelector<HTMLElement>('.line-cards')!;
      const top = el.querySelector<HTMLElement>('.line-top')!;

      expect(cardsSection.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('notas (patrón .info-field)', () => {
    const head = () => el.querySelector<HTMLElement>('.line-top__notes .info-field__head')!;

    it('sin acción: fila 1 con icono + label "Notas" y fila 2 con un span de solo lectura', async () => {
      await render(MISMATCH);

      expect(head().querySelector('svg.info-field__icon')).not.toBeNull();
      expect(head().firstElementChild?.tagName.toLowerCase()).toBe('svg');
      expect(norm(head().querySelector('label.info-field__label')?.textContent)).toBe('Notas');
      expect(head().querySelector('label')!.htmlFor).toBe('line-notes');
      const value = el.querySelector<HTMLElement>('span#line-notes')!;
      expect(value.classList.contains('info-field__value')).toBe(true);
      expect(value.classList.contains('line-notes__value')).toBe(true);
      expect(noteInput()).toBeNull();
      expect(el.querySelector('textarea')).toBeNull();
    });

    it('con una línea que coincide es el mismo span con el comentario del back, sin input', async () => {
      await render(MATCHED);

      expect(head().querySelector('svg')).not.toBeNull();
      expect(noteText()).toBe(norm(MATCHED.comment));
      expect(noteInput()).toBeNull();
    });

    it('con una línea que coincide, el span no se vuelve input', async () => {
      await render(MATCHED);

      expect(el.querySelectorAll('input')).toHaveLength(0);
    });

    it.each(['Ajustar monto', 'Reconciliar'])('al elegir "%s" el span se reemplaza por un input', async (label) => {
      await render(MISMATCH);

      await click(button(label));

      const input = noteInput()!;
      expect(input).not.toBeNull();
      expect(input.tagName).toBe('INPUT');
      expect(input.classList.contains('info-field__input')).toBe(true);
      expect(input.hasAttribute('nz-input')).toBe(true);
      expect(input.value).toBe('');
      expect(el.querySelector('textarea')).toBeNull();
      expect(el.querySelector('span#line-notes')).toBeNull();
      expect(head().querySelector('svg.info-field__icon')).not.toBeNull();
      expect(norm(head().querySelector('label')?.textContent)).toBe('Notas');
    });

    it('el label sigue ligado por for="line-notes" al input', async () => {
      await render(MISMATCH);
      await click(button('Ajustar monto'));

      expect(head().querySelector('label')!.htmlFor).toBe(noteInput()!.id);
    });

    it('la nota que se escribe se conserva al cambiar de Ajustar monto a Reconciliar', async () => {
      await render(MISMATCH);
      await click(button('Ajustar monto'));
      await write(NOTE);

      await click(button('Reconciliar'));

      expect(noteInput()!.value).toBe(NOTE);
    });

    it('con una acción registrada vuelve a ser un span con el texto guardado y sin error', async () => {
      await render(MISMATCH, { rowId: MISMATCH.id, type: 'reconciliacion', comment: NOTE });

      expect(noteText()).toBe(NOTE);
      expect(noteField().classList.contains('text-muted')).toBe(false);
      expect(noteInput()).toBeNull();
      expect(noteError()).toBeNull();
    });
  });

  describe('indicador de diferencia', () => {
    it.each([
      ['coincide', MATCHED, 'success'],
      ['diferencia', MISMATCH, 'warning'],
      ['sin_coincidencia', SALE_ONLY, 'error'],
    ] as const)('con %s usa la variante %s y muestra la diferencia', async (_status, row, variant) => {
      await render(row);

      expect(diffCard().classList.contains(`status-card-${variant}`)).toBe(true);
      expect(diffValue()).toBe(money(row.difference));
      for (const other of ['success', 'warning', 'error'].filter((v) => v !== variant)) {
        expect(diffCard().classList.contains(`status-card-${other}`)).toBe(false);
      }
    });

    it('si no coincide no renderiza el comentario del back junto al indicador', async () => {
      await render(MISMATCH);

      expect(el.querySelector('.line-top__comment')).toBeNull();
      expect(norm(el.querySelector('.line-top__difference')?.textContent)).not.toContain(MISMATCH.comment);
    });

    it('si coincide tampoco muestra el comentario junto al indicador', async () => {
      await render(MATCHED);

      expect(el.querySelector('.line-top__comment')).toBeNull();
    });
  });

  describe('línea que coincide', () => {
    beforeEach(() => render(MATCHED));

    it('no tiene botones de acción ni de confirmación', () => {
      expect(el.querySelector('.line-actions')).toBeNull();
      expect(el.querySelector('.line-footer')).toBeNull();
      expect(el.querySelectorAll('button')).toHaveLength(0);
      expect(el.querySelector('app-candidate-list')).toBeNull();
      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
    });

    it('las notas son un texto de solo lectura con el comentario del back y no validan', () => {
      expect(noteInput()).toBeNull();
      expect(noteText()).toBe(norm(MATCHED.comment));
      expect(noteField().classList.contains('text-muted')).toBe(false);
      expect(noteError()).toBeNull();
    });
  });

  describe('línea con diferencia o sin coincidencia', () => {
    it.each([
      ['diferencia', MISMATCH],
      ['sin coincidencia', SALE_ONLY],
    ])('%s: ofrece Marcar pendiente, Ajustar monto y Reconciliar, con icono y label', async (_name, row) => {
      await render(row);

      expect(actionButtons().map((b) => norm(b.textContent))).toEqual([
        'Marcar pendiente',
        'Ajustar monto',
        'Reconciliar',
      ]);
      for (const b of actionButtons()) {
        expect(b.disabled).toBe(false);
        expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg');
      }
    });

    it('al inicio las notas son un texto con su indicación y no hay confirmación ni listas', async () => {
      await render(MISMATCH);

      expect(noteInput()).toBeNull();
      expect(noteText()).toBe('Elige Ajustar monto o Reconciliar para escribir el motivo.');
      expect(noteField().classList.contains('text-muted')).toBe(true);
      expect(noteError()).toBeNull();
      expect(el.querySelector('.line-footer')).toBeNull();
      expect(el.querySelector('app-candidate-list')).toBeNull();
      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
    });

    it('sin el permiso manage_differences los tres botones están deshabilitados', async () => {
      permissions = [];
      await render(MISMATCH);

      expect(actionButtons()).toHaveLength(3);
      expect(actionButtons().every((b) => b.disabled)).toBe(true);
    });

    it('sin permiso, ni los clics ni markPending abren acciones o emiten', async () => {
      permissions = [];
      await render(MISMATCH);

      await click(button('Marcar pendiente'));
      await click(button('Ajustar monto'));
      (fixture.componentInstance as unknown as { markPending(): void }).markPending();

      expect(emitted).toHaveLength(0);
      expect(el.querySelector('app-candidate-list')).toBeNull();
    });

    it('se enlaza a la orden de la línea (medio de pago y referencia)', async () => {
      await render(MISMATCH);

      expect(service().order()?.orderId).toBe('CORTE-0827-02');
      expect(service().order()?.tenderMedia).toBe('efectivo');
    });

    it('provee su propio servicio: no comparte el de otro detalle', async () => {
      await render(MISMATCH);
      const other = TestBed.createComponent(LineDetail);
      other.componentRef.setInput('row', SALE_ONLY);
      other.detectChanges();

      expect(other.debugElement.injector.get(DifferenceManagementService)).not.toBe(service());
      expect(other.debugElement.injector.get(DifferenceManagementService).order()?.orderId).toBe('DIDI-041');
    });

    it('sin permiso "Confirmar ajuste" no se habilita aunque haya candidato y nota válida', async () => {
      permissions = [];
      await render(MISMATCH);
      // Los botones de acción están deshabilitados: se entra al modo por el método protegido.
      (fixture.componentInstance as unknown as { choose(mode: string): void }).choose('ajuste');
      await settle();
      await write(NOTE);

      expect(adjustButton()!.disabled).toBe(true);
    });
  });

  describe('línea del cruce del banco (sin medio de pago)', () => {
    // Fila como la arma `toResultRow`: sin `tenderMedia`, con movimientos del banco y candidatos del back.
    const BANK_ROW: ReconciliationResultRow = {
      ...MISMATCH,
      id: '2',
      tenderMedia: null,
      channel: 'MASTERCARD',
      reference: 'AUT-0002',
      pos: { reference: 'AUT-0002', amount: 1234.5, concept: 'MASTERCARD', paymentMethod: 'MASTERCARD' },
      bank: [movement('B1', 1200)],
      candidates: [movement('C1', 34.5)],
      difference: 34.5,
    };

    it('pinta POS y banco con los movimientos de la fila', async () => {
      await render(BANK_ROW);

      expect(fields(cards()[0])[0]).toEqual(['Referencia', 'AUT-0002']);
      expect(bankRowTexts()).toEqual(BANK_ROW.bank.map(movementRow));
      expect(bankCount()).toBe('1 movimiento');
      expect(diffValue()).toBe(money(34.5));
    });

    it('no se enlaza a ninguna orden simulada ni siembra liquidaciones', async () => {
      await render(BANK_ROW);

      expect(service().order()).toBeNull();
      expect(service().candidates()).toEqual([]);
      expect(service().selectedCount()).toBe(0);
    });

    it('"Ajustar monto" no ofrece candidatos: la lista queda vacía y el banco en 0', async () => {
      await render(BANK_ROW);
      await click(button('Ajustar monto'));

      expect(candidateCards()).toHaveLength(0);
      expect(bankCount()).toBe('0 movimientos');
      expect(bankTotalText()).toBe(money(0));
      expect(diffValue()).toBe(money(1234.5));
    });

    it('"Marcar pendiente" sigue disponible y emite la acción con el id de la fila', async () => {
      await render(BANK_ROW);
      await click(button('Marcar pendiente'));

      expect(emitted).toEqual([{ rowId: '2', type: 'pendiente', comment: '' }]);
    });
  });

  describe('Marcar pendiente', () => {
    it('emite resolved con tipo pendiente y comentario vacío al instante', async () => {
      await render(MISMATCH);

      await click(button('Marcar pendiente'));

      expect(emitted).toEqual([{ rowId: MISMATCH.id, type: 'pendiente', comment: '' }]);
    });

    it('funciona también en una línea sin coincidencia', async () => {
      await render(SALE_ONLY);

      await click(button('Marcar pendiente'));

      expect(emitted).toEqual([{ rowId: SALE_ONLY.id, type: 'pendiente', comment: '' }]);
    });

    it('no exige nota', async () => {
      await render(MISMATCH);

      await click(button('Marcar pendiente'));

      expect(noteError()).toBeNull();
      expect(emitted).toHaveLength(1);
    });
  });

  describe('Ajustar monto', () => {
    beforeEach(() => render(MISMATCH));

    it('muestra la lista de candidatos, cambia las notas a un input y resalta el botón', async () => {
      await click(button('Ajustar monto'));

      expect(el.querySelector('app-candidate-list')).not.toBeNull();
      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
      expect(noteInput()).not.toBeNull();
      expect(noteInput()!.disabled).toBe(false);
      expect(noteInput()!.placeholder).toBe('Escribe el motivo');
      expect(el.querySelector('span#line-notes')).toBeNull();
      expect(button('Ajustar monto')!.classList.contains('ant-btn-primary')).toBe(true);
      expect(button('Reconciliar')!.classList.contains('ant-btn-primary')).toBe(false);
      expect(norm(adjustButton()?.textContent)).toBe('Confirmar ajuste');
    });

    it('"Confirmar ajuste" exige una nota válida (los movimientos del banco ya vienen seleccionados)', async () => {
      await click(button('Ajustar monto'));
      expect(service().selectedCount()).toBe(5);
      expect(adjustButton()!.disabled).toBe(true);

      await write('   ');
      expect(adjustButton()!.disabled).toBe(true);

      await write('ok ok ok');
      expect(adjustButton()!.disabled).toBe(true);

      await write(NOTE);
      expect(adjustButton()!.disabled).toBe(false);
    });

    it('con una nota válida basta con la preselección para confirmar, sin tocar la lista', async () => {
      await click(button('Ajustar monto'));

      await write(NOTE);

      expect(adjustButton()!.disabled).toBe(false);
    });

    it('"Confirmar ajuste" exige al menos un candidato seleccionado', async () => {
      await click(button('Ajustar monto'));
      await write(NOTE);
      expect(adjustButton()!.disabled).toBe(false);

      for (const card of selectedCards()) await click(card);
      expect(service().selectedCount()).toBe(0);
      expect(adjustButton()!.disabled).toBe(true);

      await click(candidateCards()[0]);
      expect(adjustButton()!.disabled).toBe(false);
    });

    it('al confirmar guarda la nota en el servicio, guarda el match y emite {ajuste, nota, movimientos}', async () => {
      const setNote = vi.spyOn(service(), 'setNote');
      const save = vi.spyOn(service(), 'save');
      await click(button('Ajustar monto'));
      await write(`  ${NOTE}  `);

      await click(adjustButton()!);

      expect(setNote).toHaveBeenCalledWith(NOTE);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveReturnedWith(expect.objectContaining({ orderId: 'CORTE-0827-02', note: NOTE }));
      expect(emitted).toEqual([{ rowId: MISMATCH.id, type: 'ajuste', comment: NOTE, movements: MISMATCH.bank }]);
    });

    it('al confirmar emite exactamente los movimientos seleccionados: los del banco y los candidatos que se sumaron', async () => {
      await click(button('Ajustar monto'));
      const [first, second] = unselectedCards();
      await click(first);
      await click(second);
      await write(NOTE);

      await click(adjustButton()!);

      const { movements } = emitted[0];
      expect(movements).toEqual([...MISMATCH.bank, MISMATCH.candidates[0], MISMATCH.candidates[1]]);
      expect(movements).toEqual(selectedMovements());
      expect(bankTotal(movements!)).toBe(service().selectedSettledAmount());
    });

    it('al confirmar sin los movimientos que se quitaron, no los incluye', async () => {
      await click(button('Ajustar monto'));
      await click(selectedCards()[0]);
      await click(selectedCards()[0]);
      await write(NOTE);

      await click(adjustButton()!);

      expect(emitted[0].movements).toEqual(MISMATCH.bank.slice(2));
      expect(emitted[0].movements).toHaveLength(3);
    });

    it('si el guardado no devuelve resultado no emite', async () => {
      vi.spyOn(service(), 'save').mockReturnValue(null);
      await click(button('Ajustar monto'));
      await write(NOTE);

      await click(adjustButton()!);

      expect(emitted).toHaveLength(0);
    });

    it('con una nota inválida confirm() no emite aunque se invoque directo', async () => {
      const save = vi.spyOn(service(), 'save');
      await click(button('Ajustar monto'));
      await write('ok ok ok');

      (fixture.componentInstance as unknown as { confirm(): void }).confirm();

      expect(emitted).toHaveLength(0);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('Ajustar monto: lista de candidatos (CORTE-0827-02)', () => {
    beforeEach(async () => {
      await render(MISMATCH);
      await click(button('Ajustar monto'));
    });

    it('muestra 10 tarjetas: los 5 movimientos del banco seleccionados y las 5 candidatas sin seleccionar', () => {
      expect(MISMATCH.bank).toHaveLength(5);
      expect(MISMATCH.candidates).toHaveLength(5);
      expect(candidateCards()).toHaveLength(10);
      expect(selectedCards()).toHaveLength(5);
      expect(unselectedCards()).toHaveLength(5);
      expect(service().selectedCount()).toBe(5);
    });

    it('primero van los del banco (seleccionados) y después las candidatas, en el orden del back', () => {
      expect(candidateCards().map(cardRef)).toEqual([...MISMATCH.bank, ...MISMATCH.candidates].map((m) => m.reference));
      expect(
        candidateCards()
          .slice(0, 5)
          .every((c) => c.classList.contains('candidate-card--selected')),
      ).toBe(true);
      expect(
        candidateCards()
          .slice(5)
          .some((c) => c.classList.contains('candidate-card--selected')),
      ).toBe(false);
    });

    it('las seleccionadas muestran el origen "Motor de cálculo" y las otras no muestran origen', () => {
      expect(selectedCards().map((c) => norm(c.querySelector('nz-tag')?.textContent))).toEqual(
        Array(5).fill('Motor de cálculo'),
      );
      for (const card of unselectedCards()) expect(card.querySelector('nz-tag')).toBeNull();
    });

    it('cada tarjeta marca aria-checked según su selección', () => {
      expect(selectedCards().every((c) => c.getAttribute('aria-checked') === 'true')).toBe(true);
      expect(unselectedCards().every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
    });

    it('la lista trae el título "Transacciones bancarias candidatas"', () => {
      expect(norm(el.querySelector('.candidates-section__title')?.textContent)).toBe(
        'Transacciones bancarias candidatas',
      );
    });

    it('al elegir una candidata queda como "Match manual" y el contador sube a 6', async () => {
      await click(unselectedCards()[0]);

      expect(selectedCards()).toHaveLength(6);
      expect(service().originOf(MISMATCH.candidates[0].id)).toBe('manual');
      expect(norm(selectedCards()[5].querySelector('nz-tag')?.textContent)).toBe('Match manual');
      expect(bankCount()).toBe('6 movimientos');
    });
  });

  describe('Ajustar monto: movimientos del banco y Diferencia según la selección', () => {
    const pos = MISMATCH.pos!.amount;

    beforeEach(() => render(MISMATCH));

    it('antes de elegir "Ajustar monto" se ven los movimientos y la diferencia del back', () => {
      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
      expect(bankTotalText()).toBe(money(bankTotal(MISMATCH.bank)));
      expect(diffValue()).toBe(money(MISMATCH.difference));
    });

    it('al elegir "Ajustar monto" parte de los movimientos del banco: la tabla y la diferencia no cambian', async () => {
      await click(button('Ajustar monto'));

      expect(selectedMovements()).toEqual(MISMATCH.bank);
      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
      expect(bankCount()).toBe('5 movimientos');
      expect(bankTotalText()).toBe(money(service().selectedSettledAmount()));
      expect(service().selectedSettledAmount()).toBe(bankTotal(MISMATCH.bank));
      expect(diffValue()).toBe(money(MISMATCH.difference));
      expect(diffCard().classList.contains('status-card-warning')).toBe(true);
    });

    it('sumar una candidata agrega su renglón y actualiza el total y la diferencia', async () => {
      await click(button('Ajustar monto'));
      const before = service().selectedSettledAmount();
      const added = MISMATCH.candidates[0];

      await click(unselectedCards()[0]);

      const sum = round2(before + added.amount);
      expect(service().selectedSettledAmount()).toBe(sum);
      expect(bankRows()).toHaveLength(6);
      expect(bankRowTexts()[5]).toEqual(movementRow(added));
      expect(bankCount()).toBe('6 movimientos');
      expect(bankTotalText()).toBe(money(sum));
      expect(diffValue()).toBe(money(round2(pos - sum)));
      expect(coverageText()).toBe(`Cubre el ${Math.round((sum / pos) * 1000) / 10}% del monto del POS`);
    });

    it('quitar un movimiento del banco lo saca de la tabla y recalcula el total y la diferencia', async () => {
      await click(button('Ajustar monto'));
      const removed = MISMATCH.bank[0];
      const sum = round2(bankTotal(MISMATCH.bank) - removed.amount);

      await click(selectedCards()[0]);

      expect(bankRows()).toHaveLength(4);
      expect(bankRowTexts()).toEqual(MISMATCH.bank.slice(1).map(movementRow));
      expect(bankCount()).toBe('4 movimientos');
      expect(bankTotalText()).toBe(money(sum));
      expect(diffValue()).toBe(money(round2(pos - sum)));
    });

    it('volver a marcar lo quitado restituye el total y la diferencia', async () => {
      await click(button('Ajustar monto'));
      await click(selectedCards()[0]);

      await click(unselectedCards()[0]); // la primera sin seleccionar es la que se quitó

      expect(service().selectedCount()).toBe(5);
      expect(bankTotalText()).toBe(money(bankTotal(MISMATCH.bank)));
      expect(diffValue()).toBe(money(MISMATCH.difference));
    });

    it('si la suma iguala al POS la diferencia es 0 y la card pasa a success', async () => {
      TestBed.resetTestingModule();
      const target = customRow(100, [movement('A', 60)], [movement('X', 40), movement('Y', 10)]);
      await render(target);
      await click(button('Ajustar monto'));
      expect(diffValue()).toBe(money(40));
      expect(diffCard().classList.contains('status-card-warning')).toBe(true);

      await click(unselectedCards()[0]); // X: 60 + 40

      expect(service().selectedSettledAmount()).toBe(100);
      expect(bankRows()).toHaveLength(2);
      expect(bankTotalText()).toBe(money(100));
      expect(diffValue()).toBe(money(0));
      expect(coverageText()).toBe('Cubre el 100% del monto del POS');
      expect(diffCard().classList.contains('status-card-success')).toBe(true);
      expect(diffCard().classList.contains('status-card-warning')).toBe(false);
    });

    it('con más de lo que vende el POS la diferencia queda negativa', async () => {
      TestBed.resetTestingModule();
      await render(customRow(100, [movement('A', 80)], [movement('X', 50)]));
      await click(button('Ajustar monto'));

      await click(unselectedCards()[0]);

      expect(diffValue()).toBe(money(-30));
    });

    it('sin candidatos seleccionados la tabla queda vacía y la diferencia es el monto del POS', async () => {
      await click(button('Ajustar monto'));
      for (const card of selectedCards()) await click(card);

      expect(service().selectedCount()).toBe(0);
      expect(bankRowTexts()).toEqual([]);
      expect(bankTotalText()).toBe(money(0));
      expect(diffValue()).toBe(money(MISMATCH.pos!.amount));
      expect(diffCard().classList.contains('status-card-warning')).toBe(true);
    });

    it('en "Reconciliar" la selección de candidatos no altera los movimientos ni la diferencia del back', async () => {
      await click(button('Reconciliar'));

      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
      expect(diffValue()).toBe(money(MISMATCH.difference));
      expect(el.querySelector('app-candidate-list')).toBeNull();
    });

    it('en una línea sin banco las candidatas arrancan sin seleccionar y elegir una llena la tabla', async () => {
      TestBed.resetTestingModule();
      await render(SALE_ONLY);
      await click(button('Ajustar monto'));
      expect(SALE_ONLY.candidates).toHaveLength(5);
      expect(candidateCards()).toHaveLength(5);
      expect(selectedCards()).toHaveLength(0);
      expect(bankRows()).toHaveLength(0);
      expect(diffValue()).toBe(money(SALE_ONLY.difference));
      expect(adjustButton()!.disabled).toBe(true);

      const chosen = SALE_ONLY.candidates[0];
      await click(candidateCards()[0]);

      expect(bankRowTexts()).toEqual([movementRow(chosen)]);
      expect(bankCount()).toBe('1 movimiento');
      expect(diffValue()).toBe(money(round2(SALE_ONLY.pos!.amount - chosen.amount)));

      await click(candidateCards()[0]);
      expect(bankRows()).toHaveLength(0);
      expect(diffValue()).toBe(money(SALE_ONLY.difference));
    });
  });

  describe('validación de notas', () => {
    beforeEach(async () => {
      await render(MISMATCH);
      await click(button('Ajustar monto'));
    });

    it('al abrir la acción no hay error ni se tocó el campo', () => {
      expect(noteError()).toBeNull();
    });

    it('al escribir una nota débil muestra el error de palabras completas', async () => {
      await write('a');

      expect(norm(noteError()?.textContent)).toBe(WEAK_NOTE_ERROR);
      expect(adjustButton()!.disabled).toBe(true);
    });

    it.each(['.', 'aaaaaaaaaa', 'Comision', 'ok ok ok'])('"%s" muestra el error y bloquea confirmar', async (text) => {
      await write(text);

      expect(norm(noteError()?.textContent)).toBe(WEAK_NOTE_ERROR);
      expect(adjustButton()!.disabled).toBe(true);
    });

    it('solo espacios muestra el mensaje de nota vacía', async () => {
      await write('   ');

      expect(norm(noteError()?.textContent)).toBe(EMPTY_NOTE_ERROR);
    });

    it('con el campo sin escribir, el error aparece tras blur', async () => {
      await blur();

      expect(norm(noteError()?.textContent)).toBe(EMPTY_NOTE_ERROR);
      expect(adjustButton()!.disabled).toBe(true);
    });

    it('una nota válida quita el error y habilita confirmar', async () => {
      await write('a');
      expect(noteError()).not.toBeNull();

      await write('Ajuste por comisión bancaria');

      expect(noteError()).toBeNull();
      expect(adjustButton()!.disabled).toBe(false);
    });

    it('al borrar una nota ya escrita el error vuelve tras blur', async () => {
      await write(NOTE);
      await write('');
      await blur();

      expect(norm(noteError()?.textContent)).toBe(EMPTY_NOTE_ERROR);
      expect(adjustButton()!.disabled).toBe(true);
    });

    it('con una acción ya registrada no se muestra error aunque la nota esté vacía', async () => {
      TestBed.resetTestingModule();
      await render(MISMATCH, { rowId: MISMATCH.id, type: 'pendiente', comment: '' });

      expect(noteInput()).toBeNull();
      expect(noteError()).toBeNull();
    });

    it('el error de validación se pinta en .info-field__error, dentro del campo de notas, en el encabezado sobre el input', async () => {
      await write('a');

      const error = noteError()!;
      expect(error.closest('.info-field')).toBe(el.querySelector('.line-top__notes'));
      expect(norm(error.textContent)).toBe(WEAK_NOTE_ERROR);
      expect(error.compareDocumentPosition(noteInput()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('el input conserva el texto escrito entre validaciones', async () => {
      await write('Pago');
      await write('Pago parcial verificado');

      expect(noteInput()!.value).toBe('Pago parcial verificado');
    });
  });

  describe('Reconciliar', () => {
    beforeEach(() => render(SALE_ONLY));

    it('muestra el selector de archivo y el resultado, activa las notas y oculta los candidatos', async () => {
      await click(button('Reconciliar'));

      expect(el.querySelector('.line-import app-bank-file-dropzone')).not.toBeNull();
      expect(el.querySelector('.line-import app-statement-result')).not.toBeNull();
      expect(el.querySelector('app-settlements-import')).toBeNull();
      expect(el.querySelector('app-candidate-list')).toBeNull();
      expect(el.querySelector('button.import-dropzone')).not.toBeNull();
      expect(el.querySelector('.file-loaded')).toBeNull();
      expect(legend()).toBeNull();
      expect(noteInput()).not.toBeNull();
      expect(noteInput()!.disabled).toBe(false);
      expect(button('Reconciliar')!.classList.contains('ant-btn-primary')).toBe(true);
      expect(reconcileButton()).toBeNull();
    });

    it('solo acepta .xlsx: otro tipo avisa y no se lee', async () => {
      await click(button('Reconciliar'));

      expect(fileInput().accept).toContain('.xlsx');
      await pick(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

      expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
      expect(reader.read).not.toHaveBeenCalled();
      expect(el.querySelector('.file-loaded')).toBeNull();
    });

    it('al elegir un .xlsx lo revisa con BankStatementReader y muestra nombre y resultado', async () => {
      await click(button('Reconciliar'));
      const file = xlsx('banco-julio.xlsx');

      await pick(file);

      expect(reader.read).toHaveBeenCalledWith(file);
      expect(norm(el.querySelector('.file-loaded__name')?.textContent)).toBe('banco-julio.xlsx');
      expect(norm(legend()?.textContent)).toBe('Archivo válido');
      expect(legend()!.classList.contains('status-legend-success')).toBe(true);
    });

    it('mientras se revisa muestra el spinner y "Confirmar reconciliación" no aparece', async () => {
      const pending = deferred<BankStatementResult>();
      reader.read.mockReturnValue(pending.promise);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(el.querySelector('.statement-loading')).not.toBeNull();
      expect(legend()).toBeNull();
      expect(reconcileButton()).toBeNull();

      pending.resolve(VALID);
      await settle();

      expect(el.querySelector('.statement-loading')).toBeNull();
      expect(reconcileButton()!.disabled).toBe(false);
    });

    it('archivo válido pero sin nota: confirmar sigue deshabilitado', async () => {
      await click(button('Reconciliar'));

      await pick(xlsx());

      expect(reconcileButton()!.disabled).toBe(true);
    });

    it('nota válida pero sin archivo: no hay botón de confirmar', async () => {
      await click(button('Reconciliar'));

      await write(NOTE);

      expect(reconcileButton()).toBeNull();
    });

    it('archivo válido y nota débil: confirmar deshabilitado y con error de nota', async () => {
      await click(button('Reconciliar'));
      await pick(xlsx());

      await write('ok ok ok');

      expect(reconcileButton()!.disabled).toBe(true);
      expect(norm(noteError()?.textContent)).toBe(WEAK_NOTE_ERROR);
    });

    it('archivo válido y nota válida habilitan confirmar', async () => {
      await click(button('Reconciliar'));
      await pick(xlsx());

      await write(NOTE);

      expect(reconcileButton()!.disabled).toBe(false);
    });

    it('archivo inválido (columnas faltantes): leyenda de error, lista de columnas y sin botón de confirmar', async () => {
      reader.read.mockResolvedValue(INVALID);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(norm(legend()?.textContent)).toBe('Archivo inválido');
      expect(legend()!.classList.contains('status-legend-error')).toBe(true);
      expect(Array.from(el.querySelectorAll('ul.statement-list--error li')).map((li) => norm(li.textContent))).toEqual([
        'NIT',
        'VALOR TOTAL',
      ]);
      expect(reconcileButton()).toBeNull();
    });

    it('campos faltantes: leyenda de advertencia, filas y sin botón de confirmar', async () => {
      reader.read.mockResolvedValue(MISSING_FIELDS);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(norm(legend()?.textContent)).toBe('Campos faltantes');
      expect(legend()!.classList.contains('status-legend-warning')).toBe(true);
      expect(norm(el.querySelector('ul.statement-list--warning li')?.textContent)).toBe('Fila 4: VALOR TOTAL');
      expect(reconcileButton()).toBeNull();
    });

    it('error de lectura: leyenda de error y sin botón de confirmar', async () => {
      reader.read.mockResolvedValue(ERROR);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(norm(legend()?.textContent)).toBe('Error en el archivo');
      expect(reconcileButton()).toBeNull();
    });

    it('cargar luego un archivo inválido quita el botón de confirmar', async () => {
      await click(button('Reconciliar'));
      await write(NOTE);
      await pick(xlsx('bueno.xlsx'));
      expect(reconcileButton()!.disabled).toBe(false);

      reader.read.mockResolvedValue(INVALID);
      await pick(xlsx('malo.xlsx'));

      expect(reconcileButton()).toBeNull();
    });

    it('carrera: si la primera lectura termina después, gana la última carga', async () => {
      const first = deferred<BankStatementResult>();
      const second = deferred<BankStatementResult>();
      reader.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      await click(button('Reconciliar'));
      await write(NOTE);
      await pick(xlsx('primero.xlsx'));
      await pick(xlsx('segundo.xlsx'));

      second.resolve(INVALID);
      await settle();
      first.resolve(VALID); // llega tarde: no debe pisar el resultado vigente
      await settle();

      expect(norm(legend()?.textContent)).toBe('Archivo inválido');
      expect(reconcileButton()).toBeNull();
      expect(norm(el.querySelector('.file-loaded__name')?.textContent)).toBe('segundo.xlsx');
    });

    it('al confirmar emite {reconciliacion, nota} al terminar la espera, sin guardar el match del ajuste', async () => {
      const save = vi.spyOn(service(), 'save');
      await click(button('Reconciliar'));
      await pick(xlsx());
      await write('  Reconciliada con el archivo del banco  ');
      vi.useFakeTimers(FAKE_INTERVAL);

      await click(reconcileButton()!);
      expect(emitted).toHaveLength(0);
      await advance(RECONCILE_MS);

      expect(emitted).toEqual([
        {
          rowId: SALE_ONLY.id,
          type: 'reconciliacion',
          comment: 'Reconciliada con el archivo del banco',
        },
      ]);
      expect(save).not.toHaveBeenCalled();
    });

    it('con un archivo no válido confirm() no emite aunque se invoque directo', async () => {
      reader.read.mockResolvedValue(INVALID);
      await click(button('Reconciliar'));
      await pick(xlsx());
      await write(NOTE);

      (fixture.componentInstance as unknown as { confirm(): void }).confirm();

      expect(emitted).toHaveLength(0);
    });

    it('sin permiso manage_differences no se puede confirmar', async () => {
      TestBed.resetTestingModule();
      permissions = [];
      await render(SALE_ONLY);
      (fixture.componentInstance as unknown as { choose(mode: string): void }).choose('reconciliacion');
      await settle();
      await pick(xlsx());
      await write(NOTE);

      expect(reconcileButton()!.disabled).toBe(true);
    });

    it('cambiar de Reconciliar a Ajustar monto cambia la lista y el botón de confirmación', async () => {
      await click(button('Reconciliar'));
      await click(button('Ajustar monto'));

      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
      expect(el.querySelector('app-candidate-list')).not.toBeNull();
      expect(norm(adjustButton()?.textContent)).toBe('Confirmar ajuste');
    });
  });

  describe('Reconciliar: confirmación y espera', () => {
    const indicator = () => el.querySelector<HTMLElement>('.line-import app-processing-indicator');
    const confirmDirect = () => (fixture.componentInstance as unknown as { confirm(): void }).confirm();

    async function readyToConfirm(): Promise<void> {
      await render(SALE_ONLY);
      await click(button('Reconciliar'));
      await pick(xlsx());
      await write(NOTE);
    }

    async function startWaiting(): Promise<void> {
      await readyToConfirm();
      vi.useFakeTimers(FAKE_INTERVAL);
      await click(reconcileButton());
    }

    it('con un archivo válido aparece "Confirmar reconciliación" a la derecha, después del resultado, dentro de .line-import', async () => {
      await readyToConfirm();
      const footer = el.querySelector<HTMLElement>('.line-import > .line-import__footer')!;
      const result = el.querySelector<HTMLElement>('.line-import > app-statement-result')!;

      expect(norm(reconcileButton()?.textContent)).toBe('Confirmar reconciliación');
      expect(reconcileButton()!.firstElementChild?.tagName.toLowerCase()).toBe('svg');
      expect(footer.contains(reconcileButton())).toBe(true);
      expect(result.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(el.querySelector('.line-actions')!.textContent).not.toContain('Confirmar reconciliación');
      expect(el.querySelector('.line-footer')).toBeNull();
    });

    it('no existe sin archivo ni con un archivo inválido', async () => {
      reader.read.mockResolvedValue(INVALID);
      await render(SALE_ONLY);
      await click(button('Reconciliar'));
      await write(NOTE);
      expect(reconcileButton()).toBeNull();

      await pick(xlsx());

      expect(reconcileButton()).toBeNull();
    });

    it('con archivo válido y nota válida está habilitado y lleva status-card-success', async () => {
      await readyToConfirm();

      expect(reconcileButton()!.disabled).toBe(false);
      expect(reconcileButton()!.classList.contains('status-card-success')).toBe(true);
    });

    it.each([
      ['sin nota', ''],
      ['con una nota débil', 'ok ok ok'],
    ])('%s está deshabilitado y sin status-card-success', async (_name, text) => {
      await render(SALE_ONLY);
      await click(button('Reconciliar'));
      await pick(xlsx());
      if (text) await write(text);

      expect(reconcileButton()!.disabled).toBe(true);
      expect(reconcileButton()!.classList.contains('status-card-success')).toBe(false);
    });

    it('sin permiso queda deshabilitado aunque haya archivo válido y nota', async () => {
      permissions = [];
      await render(SALE_ONLY);
      (fixture.componentInstance as unknown as { choose(mode: string): void }).choose('reconciliacion');
      await settle();
      await pick(xlsx());
      await write(NOTE);

      expect(reconcileButton()!.disabled).toBe(true);
      expect(reconcileButton()!.classList.contains('status-card-success')).toBe(false);
    });

    it('al confirmar reemplaza el resumen y el botón por el indicador "Reconciliando..."', async () => {
      await startWaiting();

      expect(el.querySelector('app-statement-result')).toBeNull();
      expect(reconcileButton()).toBeNull();
      expect(el.querySelector('.line-import > nz-card')).not.toBeNull();
      expect(indicator()).not.toBeNull();
      expect(norm(indicator()!.querySelector('.validation__title')?.textContent)).toBe('Reconciliando...');
      expect(Array.from(indicator()!.querySelectorAll('.validation__subtitle')).map((s) => norm(s.textContent))).toEqual([
        'Estamos aplicando el extracto bancario a esta línea.',
        'Esto puede tomar unos segundos.',
      ]);
      expect(indicator()!.querySelector('.gears')).not.toBeNull();
      expect(el.querySelector('app-bank-file-dropzone')).not.toBeNull();
    });

    it('el porcentaje sube 10% cada 500 ms', async () => {
      await startWaiting();
      expect(progressText()).toBe('0%');

      await advance(500);
      expect(progressText()).toBe('10%');

      await advance(1500);
      expect(progressText()).toBe('40%');

      await advance(2000);
      expect(progressText()).toBe('80%');
    });

    it('la nota queda de solo lectura mientras reconcilia', async () => {
      await startWaiting();

      expect(noteInput()).toBeNull();
      expect(noteText()).toBe(NOTE);
    });

    it('no emite antes de terminar: a los 4,5 s sigue esperando y a los 5 s emite con el comentario', async () => {
      await startWaiting();

      await advance(RECONCILE_MS - 500);
      expect(emitted).toHaveLength(0);
      expect(indicator()).not.toBeNull();

      await advance(500);
      expect(emitted).toEqual([{ rowId: SALE_ONLY.id, type: 'reconciliacion', comment: NOTE }]);
    });

    it('al terminar sale el indicador y vuelven el resumen y la nota editable', async () => {
      await startWaiting();

      await advance(RECONCILE_MS);

      expect(indicator()).toBeNull();
      expect(el.querySelector('app-statement-result')).not.toBeNull();
      expect(noteInput()).not.toBeNull();
    });

    it('un segundo clic o confirm() durante la espera no reinicia ni emite dos veces', async () => {
      await startWaiting();
      await advance(1000);

      confirmDirect();
      await settle();
      expect(progressText()).toBe('20%');

      await advance(RECONCILE_MS);
      await advance(RECONCILE_MS);

      expect(emitted).toHaveLength(1);
    });

    it('destruir el componente cancela la espera: no emite', async () => {
      await startWaiting();
      await advance(1000);

      fixture.destroy();
      vi.advanceTimersByTime(RECONCILE_MS * 2);

      expect(emitted).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('durante la espera los tres botones de acción están deshabilitados', async () => {
      await startWaiting();

      expect(actionButtons().map((b) => norm(b.textContent))).toEqual(['Marcar pendiente', 'Ajustar monto', 'Reconciliar']);
      expect(actionButtons().every((b) => b.disabled)).toBe(true);
      expect(button('Marcar pendiente')!.classList.contains('status-card-warning')).toBe(false);
    });

    it('durante la espera choose() no cambia el modo', async () => {
      await startWaiting();

      (fixture.componentInstance as unknown as { choose(mode: string): void }).choose('ajuste');
      await settle();

      expect(el.querySelector('app-candidate-list')).toBeNull();
      expect(indicator()).not.toBeNull();
      expect(adjustButton()).toBeNull();
    });

    it('al terminar los botones de acción vuelven a habilitarse', async () => {
      await startWaiting();

      await advance(RECONCILE_MS);

      expect(actionButtons().every((b) => !b.disabled)).toBe(true);
      expect(button('Marcar pendiente')!.classList.contains('status-card-warning')).toBe(true);
    });

    it('registrada la reconciliación no queda un botón de confirmar activo', async () => {
      await startWaiting();
      await advance(RECONCILE_MS);

      fixture.componentRef.setInput('resolution', emitted[0]);
      await settle();

      expect(reconcileButton()).toBeNull();
    });
  });

  describe('clases de estado y "Confirmar ajuste"', () => {
    it('"Marcar pendiente" lleva status-card-warning con permiso y sin espera', async () => {
      await render(MISMATCH);

      expect(button('Marcar pendiente')!.classList.contains('status-card-warning')).toBe(true);
    });

    it('"Marcar pendiente" no lleva status-card-warning sin permiso', async () => {
      permissions = [];
      await render(MISMATCH);

      expect(button('Marcar pendiente')!.classList.contains('status-card-warning')).toBe(false);
    });

    it('"Confirmar ajuste" solo existe en modo ajuste, en .line-actions y como último elemento (a la derecha)', async () => {
      await render(MISMATCH);
      expect(adjustButton()).toBeNull();

      await click(button('Reconciliar'));
      expect(adjustButton()).toBeNull();

      await click(button('Ajustar monto'));
      const actions = el.querySelector<HTMLElement>('.line-actions')!;

      expect(norm(adjustButton()!.textContent)).toBe('Confirmar ajuste');
      expect(adjustButton()!.parentElement).toBe(actions);
      expect(actions.lastElementChild).toBe(adjustButton());
      expect(adjustButton()!.classList.contains('line-actions__confirm')).toBe(true);
      expect(actions.textContent).not.toContain('Confirmar reconciliación');
    });

    it('"Confirmar ajuste" lleva status-card-success solo cuando se puede confirmar', async () => {
      await render(MISMATCH);
      await click(button('Ajustar monto'));
      expect(adjustButton()!.disabled).toBe(true);
      expect(adjustButton()!.classList.contains('status-card-success')).toBe(false);

      await write(NOTE);
      expect(adjustButton()!.disabled).toBe(false);
      expect(adjustButton()!.classList.contains('status-card-success')).toBe(true);

      await write('ok ok ok');
      expect(adjustButton()!.classList.contains('status-card-success')).toBe(false);
    });

    it('"Confirmar ajuste" emite al instante, sin espera', async () => {
      await render(MISMATCH);
      await click(button('Ajustar monto'));
      await write(NOTE);

      await click(adjustButton());

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('ajuste');
    });
  });

  describe('con una acción ya registrada', () => {
    it.each(['pendiente', 'ajuste', 'reconciliacion'] as const)(
      '%s: muestra "<etiqueta>." y el motivo guardado de solo lectura, sin botones',
      async (type) => {
        const comment = type === 'pendiente' ? '' : 'Motivo guardado';
        await render(MISMATCH, { rowId: MISMATCH.id, type, comment });

        expect(norm(el.querySelector('.line-resolution')?.textContent)).toBe(`${LINE_ACTION_LABEL[type]}.`);
        expect(el.querySelector('.line-actions')).toBeNull();
        expect(el.querySelector('.line-footer')).toBeNull();
        expect(el.querySelectorAll('button')).toHaveLength(0);
        expect(el.querySelector('app-candidate-list')).toBeNull();
        expect(noteInput()).toBeNull();
        expect(noteField().tagName).toBe('SPAN');
        expect(noteText()).toBe(comment || '—');
        expect(noteField().classList.contains('text-muted')).toBe(comment === '');
      },
    );

    it('tampoco renderiza el comentario del back junto al indicador', async () => {
      await render(MISMATCH, { rowId: MISMATCH.id, type: 'ajuste', comment: 'Motivo guardado' });

      expect(el.querySelector('.line-top__comment')).toBeNull();
    });

    it('con un ajuste guardado muestra los movimientos elegidos, el total, la diferencia y la nota de solo lectura', async () => {
      const chosen = [movement('S1', 600), movement('S2', 400)];
      const pos = MISMATCH.pos!.amount;
      await render(MISMATCH, {
        rowId: MISMATCH.id,
        type: 'ajuste',
        comment: NOTE,
        movements: chosen,
      });

      expect(bankRowTexts()).toEqual(chosen.map(movementRow));
      expect(bankCount()).toBe('2 movimientos');
      expect(bankTotalText()).toBe(money(1000));
      expect(diffValue()).toBe(money(round2(pos - 1000)));
      expect(noteText()).toBe(NOTE);
      expect(noteInput()).toBeNull();
      expect(norm(el.querySelector('.line-resolution')?.textContent)).toBe('Monto ajustado.');
      expect(el.querySelector('app-candidate-list')).toBeNull();
    });

    it('el ajuste guardado manda sobre los movimientos del back', async () => {
      await render(MISMATCH, {
        rowId: MISMATCH.id,
        type: 'ajuste',
        comment: NOTE,
        movements: [movement('S1', 50)],
      });

      expect(bankRows()).toHaveLength(1);
      expect(bankRowTexts()[0]).not.toEqual(movementRow(MISMATCH.bank[0]));
      expect(bankCount()).toBe('1 movimiento');
    });

    it('un ajuste guardado sin movimientos conserva los del back', async () => {
      await render(MISMATCH, { rowId: MISMATCH.id, type: 'ajuste', comment: NOTE });

      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
      expect(diffValue()).toBe(money(MISMATCH.difference));
    });

    it('una resolución que no es ajuste (pendiente) muestra los movimientos del back', async () => {
      await render(MISMATCH, {
        rowId: MISMATCH.id,
        type: 'pendiente',
        comment: '',
        movements: [movement('S1', 50)],
      });

      expect(bankRowTexts()).toEqual(MISMATCH.bank.map(movementRow));
    });

    it('registrar la acción mientras se edita deja el detalle de solo lectura', async () => {
      await render(SALE_ONLY);
      await click(button('Reconciliar'));
      await write('Mi borrador de nota');

      fixture.componentRef.setInput('resolution', {
        rowId: SALE_ONLY.id,
        type: 'reconciliacion',
        comment: 'Mi borrador de nota',
      });
      await settle();

      expect(el.querySelector('.line-actions')).toBeNull();
      expect(noteInput()).toBeNull();
      expect(noteText()).toBe('Mi borrador de nota');
    });

    it('registrar la acción oculta el selector de archivo y la lista de candidatos', async () => {
      await render(SALE_ONLY);
      await click(button('Reconciliar'));

      fixture.componentRef.setInput('resolution', { rowId: SALE_ONLY.id, type: 'reconciliacion', comment: NOTE });
      await settle();

      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
    });
  });
});
