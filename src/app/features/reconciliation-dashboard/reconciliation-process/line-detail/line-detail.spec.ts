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
import { ReconciliationResultRow } from '../../data/reconciliation-result.model';
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
  new File(['contenido'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

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
  let message: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
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
        { provide: AccessControlService, useValue: { hasPermission: (key: PermissionKey) => permissions.includes(key) } },
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
  const diffCard = () => el.querySelector<HTMLElement>('.line-top__difference nz-card')!;
  const diffValue = () => norm(el.querySelector('.line-difference__value')?.textContent);
  const textarea = () => el.querySelector<HTMLTextAreaElement>('#line-notes')!;
  const noteError = () => el.querySelector<HTMLElement>('.line-notes__error');
  const actionButtons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.line-actions button'));
  const button = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => norm(b.textContent) === label);
  const footerButton = () => el.querySelector<HTMLButtonElement>('.line-footer button');
  const fileInput = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;
  const legend = () => el.querySelector<HTMLElement>('.status-legend');

  async function click(target: HTMLElement | null | undefined): Promise<void> {
    target!.click();
    await settle();
  }

  async function write(text: string): Promise<void> {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function blur(): Promise<void> {
    textarea().dispatchEvent(new Event('blur'));
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
    expect(SALE_ONLY.bank).toBeNull();
    expect(SETTLEMENT_ONLY.pos).toBeNull();
    expect(MATCHED.status).toBe('coincide');
  });

  describe('POS y banco', () => {
    it('pinta dos cards, POS y "Banco (Movimientos)", cada una con su icono de banco', async () => {
      await render(MISMATCH);

      expect(cards()).toHaveLength(2);
      expect(cards().map((c) => norm(c.querySelector('.process-source__title')?.textContent))).toEqual([
        'POS',
        'Banco (Movimientos)',
      ]);
      expect(el.querySelectorAll('.bank-badge svg')).toHaveLength(2);
      expect(el.querySelectorAll('dl.line-fields')).toHaveLength(2);
    });

    it('cada lado muestra referencia, monto con `money`, concepto y método de pago', async () => {
      await render(MISMATCH);
      const { pos, bank } = MISMATCH;

      expect(fields(cards()[0])).toEqual([
        ['Referencia', pos!.reference],
        ['Monto', money(pos!.amount)],
        ['Concepto', pos!.concept],
        ['Método de pago', pos!.paymentMethod],
      ]);
      expect(fields(cards()[1])).toEqual([
        ['Referencia', bank!.reference],
        ['Monto', money(bank!.amount)],
        ['Concepto', bank!.concept],
        ['Método de pago', bank!.paymentMethod],
      ]);
      expect(norm(cards()[0].querySelector('dd.font-mono')?.textContent)).toBe(pos!.reference);
    });

    it('sin movimiento en el banco muestra el texto vacío y conserva el POS', async () => {
      await render(SALE_ONLY);

      expect(fields(cards()[0])[0]).toEqual(['Referencia', SALE_ONLY.pos!.reference]);
      expect(cards()[1].querySelector('dl')).toBeNull();
      expect(norm(cards()[1].textContent)).toContain('No hay un movimiento en el banco para esta línea.');
      expect(cards()[0].textContent).not.toContain('No hay una venta');
    });

    it('sin venta en el POS muestra el texto vacío y conserva el banco', async () => {
      await render(SETTLEMENT_ONLY);

      expect(cards()[0].querySelector('dl')).toBeNull();
      expect(norm(cards()[0].textContent)).toContain('No hay una venta en el POS para esta línea.');
      expect(fields(cards()[1])[0]).toEqual(['Referencia', SETTLEMENT_ONLY.bank!.reference]);
    });
  });

  describe('layout: diferencia y notas', () => {
    beforeEach(() => render(MISMATCH));

    it('la diferencia y las notas comparten la fila .line-top', () => {
      const top = el.querySelector<HTMLElement>('.line-top')!;

      expect(top.querySelector('.line-top__difference')).not.toBeNull();
      expect(top.querySelector('.line-top__notes')).not.toBeNull();
      expect(top.querySelector('.line-top__difference nz-card')).not.toBeNull();
      expect(top.querySelector('textarea#line-notes')).not.toBeNull();
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

    it('el campo se llama "Notas" (ya no "Comentario") y está ligado al textarea', () => {
      const label = el.querySelector<HTMLLabelElement>('.line-notes__label')!;

      expect(norm(label.textContent)).toBe('Notas');
      expect(label.htmlFor).toBe('line-notes');
      expect(textarea().id).toBe('line-notes');
      expect(el.textContent).not.toContain('Comentario');
    });

    it('los botones de acción van debajo de la fila de diferencia y notas, no dentro', () => {
      const top = el.querySelector<HTMLElement>('.line-top')!;
      const actions = el.querySelector<HTMLElement>('.line-actions')!;

      expect(top.contains(actions)).toBe(false);
      expect(top.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('la fila va después de las cards POS y Banco', () => {
      const cardsSection = el.querySelector<HTMLElement>('.line-cards')!;
      const top = el.querySelector<HTMLElement>('.line-top')!;

      expect(cardsSection.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    it('si no coincide muestra el comentario del back', async () => {
      await render(MISMATCH);

      expect(norm(el.querySelector('.line-top__comment')?.textContent)).toBe(MISMATCH.comment);
    });

    it('si coincide no muestra el comentario junto al indicador', async () => {
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

    it('las notas están deshabilitadas, muestran el comentario del back y no validan', () => {
      expect(textarea().disabled).toBe(true);
      expect(textarea().value).toBe(MATCHED.comment);
      expect(noteError()).toBeNull();
    });
  });

  describe('línea con diferencia o sin coincidencia', () => {
    it.each([
      ['diferencia', MISMATCH],
      ['sin coincidencia', SALE_ONLY],
    ])('%s: ofrece Marcar pendiente, Ajustar monto y Reconciliar, con icono y label', async (_name, row) => {
      await render(row);

      expect(actionButtons().map((b) => norm(b.textContent))).toEqual(['Marcar pendiente', 'Ajustar monto', 'Reconciliar']);
      for (const b of actionButtons()) {
        expect(b.disabled).toBe(false);
        expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg');
      }
    });

    it('al inicio las notas están deshabilitadas con su indicación y no hay confirmación ni listas', async () => {
      await render(MISMATCH);

      expect(textarea().disabled).toBe(true);
      expect(textarea().value).toBe('');
      expect(textarea().placeholder).toBe('Elige Ajustar monto o Reconciliar para escribir el motivo.');
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

      expect(footerButton()!.disabled).toBe(true);
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

    it('muestra la lista de candidatos, activa las notas y resalta el botón', async () => {
      await click(button('Ajustar monto'));

      expect(el.querySelector('app-candidate-list')).not.toBeNull();
      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
      expect(textarea().disabled).toBe(false);
      expect(textarea().placeholder).toContain('Elige Ajustar monto o Reconciliar');
      expect(button('Ajustar monto')!.classList.contains('ant-btn-primary')).toBe(true);
      expect(button('Reconciliar')!.classList.contains('ant-btn-primary')).toBe(false);
      expect(norm(footerButton()?.textContent)).toBe('Confirmar ajuste');
    });

    it('"Confirmar ajuste" exige una nota válida', async () => {
      await click(button('Ajustar monto'));
      expect(service().selectedCount()).toBeGreaterThan(0); // el motor ya sugiere una liquidación
      expect(footerButton()!.disabled).toBe(true);

      await write('   ');
      expect(footerButton()!.disabled).toBe(true);

      await write('ok ok ok');
      expect(footerButton()!.disabled).toBe(true);

      await write(NOTE);
      expect(footerButton()!.disabled).toBe(false);
    });

    it('"Confirmar ajuste" exige al menos un candidato seleccionado', async () => {
      await click(button('Ajustar monto'));
      await write(NOTE);
      expect(footerButton()!.disabled).toBe(false);

      const [selected] = el.querySelectorAll<HTMLElement>('app-candidate-list .candidate-card--selected');
      await click(selected);
      expect(service().selectedCount()).toBe(0);
      expect(footerButton()!.disabled).toBe(true);

      await click(el.querySelector<HTMLElement>('app-candidate-list .candidate-card'));
      expect(footerButton()!.disabled).toBe(false);
    });

    it('al confirmar guarda la nota en el servicio, guarda el match y emite {ajuste, nota}', async () => {
      const setNote = vi.spyOn(service(), 'setNote');
      const save = vi.spyOn(service(), 'save');
      await click(button('Ajustar monto'));
      await write(`  ${NOTE}  `);

      await click(footerButton()!);

      expect(setNote).toHaveBeenCalledWith(NOTE);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveReturnedWith(expect.objectContaining({ orderId: 'CORTE-0827-02', note: NOTE }));
      expect(emitted).toEqual([{ rowId: MISMATCH.id, type: 'ajuste', comment: NOTE }]);
    });

    it('si el guardado no devuelve resultado no emite', async () => {
      vi.spyOn(service(), 'save').mockReturnValue(null);
      await click(button('Ajustar monto'));
      await write(NOTE);

      await click(footerButton()!);

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

  describe('Ajustar monto: Monto del banco y Diferencia según la selección', () => {
    const bankAmount = () => fields(cards()[1]).find(([label]) => label === 'Monto')![1];
    const pos = MISMATCH.pos!.amount;

    beforeEach(() => render(MISMATCH));

    it('antes de elegir "Ajustar monto" se ven los valores del back', () => {
      expect(bankAmount()).toBe(money(MISMATCH.bank!.amount));
      expect(diffValue()).toBe(money(MISMATCH.difference));
    });

    it('con la liquidación sugerida seleccionada, el monto y la diferencia salen de la suma', async () => {
      await click(button('Ajustar monto'));

      const sum = service().selectedSettledAmount();
      expect(service().selectedCount()).toBeGreaterThan(0);
      expect(bankAmount()).toBe(money(sum));
      expect(diffValue()).toBe(money(round2(pos - sum)));
    });

    it('conserva referencia, concepto y método de pago del banco al recalcular el monto', async () => {
      await click(button('Ajustar monto'));

      expect(fields(cards()[1]).filter(([label]) => label !== 'Monto')).toEqual([
        ['Referencia', MISMATCH.bank!.reference],
        ['Concepto', MISMATCH.bank!.concept],
        ['Método de pago', MISMATCH.bank!.paymentMethod],
      ]);
    });

    it('sumar un candidato más actualiza el monto del banco y la diferencia', async () => {
      await click(button('Ajustar monto'));
      const before = service().selectedSettledAmount();

      service().importSettlements([imported('EXTRA-1', 100)]);
      service().toggleCandidate('EXTRA-1');
      await settle();

      const sum = round2(before + 100);
      expect(service().selectedSettledAmount()).toBe(sum);
      expect(bankAmount()).toBe(money(sum));
      expect(diffValue()).toBe(money(round2(pos - sum)));
    });

    it('si la suma iguala al POS la diferencia es 0 y la card pasa a success', async () => {
      await click(button('Ajustar monto'));
      expect(diffCard().classList.contains('status-card-warning')).toBe(true);

      const [selected] = el.querySelectorAll<HTMLElement>('app-candidate-list .candidate-card--selected');
      await click(selected); // quita la sugerida
      service().importSettlements([imported('EXACT-1', pos)]);
      service().toggleCandidate('EXACT-1');
      await settle();

      expect(service().selectedSettledAmount()).toBe(pos);
      expect(bankAmount()).toBe(money(pos));
      expect(diffValue()).toBe(money(0));
      expect(diffCard().classList.contains('status-card-success')).toBe(true);
      expect(diffCard().classList.contains('status-card-warning')).toBe(false);
    });

    it('sin candidatos seleccionados vuelven los valores y el color del back', async () => {
      await click(button('Ajustar monto'));
      const [selected] = el.querySelectorAll<HTMLElement>('app-candidate-list .candidate-card--selected');

      await click(selected);

      expect(service().selectedCount()).toBe(0);
      expect(bankAmount()).toBe(money(MISMATCH.bank!.amount));
      expect(diffValue()).toBe(money(MISMATCH.difference));
      expect(diffCard().classList.contains('status-card-warning')).toBe(true);
    });

    it('en "Reconciliar" la selección de candidatos no altera los valores del back', async () => {
      await click(button('Reconciliar'));

      expect(bankAmount()).toBe(money(MISMATCH.bank!.amount));
      expect(diffValue()).toBe(money(MISMATCH.difference));
    });

    it('en una línea sin banco, elegir un candidato crea la card del banco con ese monto', async () => {
      TestBed.resetTestingModule();
      await render(SALE_ONLY);
      await click(button('Ajustar monto'));
      expect(cards()[1].querySelector('dl')).toBeNull();
      expect(diffValue()).toBe(money(SALE_ONLY.difference));

      service().importSettlements([imported('DIDI-IMP', 40)]);
      service().toggleCandidate('DIDI-IMP');
      await settle();

      expect(fields(cards()[1])).toEqual([
        ['Referencia', '—'],
        ['Monto', money(40)],
        ['Concepto', '—'],
        ['Método de pago', 'DiDi Food'],
      ]);
      expect(diffValue()).toBe(money(round2(SALE_ONLY.pos!.amount - 40)));

      service().toggleCandidate('DIDI-IMP');
      await settle();
      expect(cards()[1].querySelector('dl')).toBeNull();
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
      expect(footerButton()!.disabled).toBe(true);
    });

    it.each(['.', 'aaaaaaaaaa', 'Comision', 'ok ok ok'])('"%s" muestra el error y bloquea confirmar', async (text) => {
      await write(text);

      expect(norm(noteError()?.textContent)).toBe(WEAK_NOTE_ERROR);
      expect(footerButton()!.disabled).toBe(true);
    });

    it('solo espacios muestra el mensaje de nota vacía', async () => {
      await write('   ');

      expect(norm(noteError()?.textContent)).toBe(EMPTY_NOTE_ERROR);
    });

    it('con el campo sin escribir, el error aparece tras blur', async () => {
      await blur();

      expect(norm(noteError()?.textContent)).toBe(EMPTY_NOTE_ERROR);
      expect(footerButton()!.disabled).toBe(true);
    });

    it('una nota válida quita el error y habilita confirmar', async () => {
      await write('a');
      expect(noteError()).not.toBeNull();

      await write('Ajuste por comisión bancaria');

      expect(noteError()).toBeNull();
      expect(footerButton()!.disabled).toBe(false);
    });

    it('al borrar una nota ya escrita el error vuelve tras blur', async () => {
      await write(NOTE);
      await write('');
      await blur();

      expect(norm(noteError()?.textContent)).toBe(EMPTY_NOTE_ERROR);
      expect(footerButton()!.disabled).toBe(true);
    });

    it('con una acción ya registrada no se muestra error aunque la nota esté vacía', async () => {
      TestBed.resetTestingModule();
      await render(MISMATCH, { rowId: MISMATCH.id, type: 'pendiente', comment: '' });
      await blur();

      expect(noteError()).toBeNull();
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
      expect(textarea().disabled).toBe(false);
      expect(button('Reconciliar')!.classList.contains('ant-btn-primary')).toBe(true);
      expect(norm(footerButton()?.textContent)).toBe('Confirmar reconciliación');
      expect(footerButton()!.disabled).toBe(true);
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

    it('mientras se revisa muestra el spinner y "Confirmar reconciliación" sigue deshabilitado', async () => {
      const pending = deferred<BankStatementResult>();
      reader.read.mockReturnValue(pending.promise);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(el.querySelector('.statement-loading')).not.toBeNull();
      expect(legend()).toBeNull();
      expect(footerButton()!.disabled).toBe(true);

      pending.resolve(VALID);
      await settle();

      expect(el.querySelector('.statement-loading')).toBeNull();
      expect(footerButton()!.disabled).toBe(false);
    });

    it('archivo válido pero sin nota: confirmar sigue deshabilitado', async () => {
      await click(button('Reconciliar'));

      await pick(xlsx());

      expect(footerButton()!.disabled).toBe(true);
    });

    it('nota válida pero sin archivo: confirmar sigue deshabilitado', async () => {
      await click(button('Reconciliar'));

      await write(NOTE);

      expect(footerButton()!.disabled).toBe(true);
    });

    it('archivo válido y nota débil: confirmar deshabilitado y con error de nota', async () => {
      await click(button('Reconciliar'));
      await pick(xlsx());

      await write('ok ok ok');

      expect(footerButton()!.disabled).toBe(true);
      expect(norm(noteError()?.textContent)).toBe(WEAK_NOTE_ERROR);
    });

    it('archivo válido y nota válida habilitan confirmar', async () => {
      await click(button('Reconciliar'));
      await pick(xlsx());

      await write(NOTE);

      expect(footerButton()!.disabled).toBe(false);
    });

    it('archivo inválido (columnas faltantes): leyenda de error, lista de columnas y confirmar deshabilitado', async () => {
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
      expect(footerButton()!.disabled).toBe(true);
    });

    it('campos faltantes: leyenda de advertencia, filas y confirmar deshabilitado', async () => {
      reader.read.mockResolvedValue(MISSING_FIELDS);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(norm(legend()?.textContent)).toBe('Campos faltantes');
      expect(legend()!.classList.contains('status-legend-warning')).toBe(true);
      expect(norm(el.querySelector('ul.statement-list--warning li')?.textContent)).toBe('Fila 4: VALOR TOTAL');
      expect(footerButton()!.disabled).toBe(true);
    });

    it('error de lectura: leyenda de error y confirmar deshabilitado', async () => {
      reader.read.mockResolvedValue(ERROR);
      await click(button('Reconciliar'));
      await write(NOTE);

      await pick(xlsx());

      expect(norm(legend()?.textContent)).toBe('Error en el archivo');
      expect(footerButton()!.disabled).toBe(true);
    });

    it('cargar luego un archivo inválido vuelve a deshabilitar confirmar', async () => {
      await click(button('Reconciliar'));
      await write(NOTE);
      await pick(xlsx('bueno.xlsx'));
      expect(footerButton()!.disabled).toBe(false);

      reader.read.mockResolvedValue(INVALID);
      await pick(xlsx('malo.xlsx'));

      expect(footerButton()!.disabled).toBe(true);
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
      expect(footerButton()!.disabled).toBe(true);
      expect(norm(el.querySelector('.file-loaded__name')?.textContent)).toBe('segundo.xlsx');
    });

    it('al confirmar emite {reconciliacion, nota} sin guardar el match del ajuste', async () => {
      const save = vi.spyOn(service(), 'save');
      await click(button('Reconciliar'));
      await pick(xlsx());
      await write('  Reconciliada con el archivo del banco  ');

      await click(footerButton()!);

      expect(emitted).toEqual([
        { rowId: SALE_ONLY.id, type: 'reconciliacion', comment: 'Reconciliada con el archivo del banco' },
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

      expect(footerButton()!.disabled).toBe(true);
    });

    it('cambiar de Reconciliar a Ajustar monto cambia la lista y el botón de confirmación', async () => {
      await click(button('Reconciliar'));
      await click(button('Ajustar monto'));

      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
      expect(el.querySelector('app-candidate-list')).not.toBeNull();
      expect(norm(footerButton()?.textContent)).toBe('Confirmar ajuste');
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
        expect(textarea().disabled).toBe(true);
        expect(textarea().value).toBe(comment);
        expect(textarea().placeholder).toBe('');
      },
    );

    it('sigue mostrando la lectura del back junto al indicador', async () => {
      await render(MISMATCH, { rowId: MISMATCH.id, type: 'ajuste', comment: 'Motivo guardado' });

      expect(norm(el.querySelector('.line-top__comment')?.textContent)).toBe(MISMATCH.comment);
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

      expect(el.querySelector('.line-footer')).toBeNull();
      expect(el.querySelector('app-bank-file-dropzone')).toBeNull();
      expect(textarea().disabled).toBe(true);
      expect(textarea().value).toBe('Mi borrador de nota');
    });
  });
});
