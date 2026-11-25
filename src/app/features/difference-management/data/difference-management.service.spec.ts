import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SettlementTransaction, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { ResolvedMatchesStore } from '../../../shared/data/resolved-matches.store';
import { MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { DifferenceManagementService } from './difference-management.service';

const imported = (n: number): SettlementTransaction => ({
  id: `IMP-${n}`,
  date: '2026-09-10',
  orderId: `IMP-REF-${n}`,
  tenderMedia: 'efectivo',
  amount: 100 * n,
  batchId: 'CSV-IMPORTADO',
  description: 'Importada',
});

describe('DifferenceManagementService (importación y errores)', () => {
  let service: DifferenceManagementService;
  let orderId: ReturnType<typeof signal<string | null>>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DifferenceManagementService] });
    service = TestBed.inject(DifferenceManagementService);
    orderId = signal<string | null>('CORTE-0827-02');
    service.bindOrder(signal<TenderMedia | null>('efectivo'), orderId);
  });

  it('sin importar nada: 0 importadas y sin errores', () => {
    expect(service.importedCount()).toBe(0);
    expect(service.importErrors()).toEqual([]);
  });

  it('importSettlements acumula las filas y suma al contador y a los candidatos', () => {
    const before = service.candidates().length;

    service.importSettlements([imported(1), imported(2)]);
    service.importSettlements([imported(3)]);

    expect(service.importedCount()).toBe(3);
    expect(service.candidates().length).toBe(before + 3);
  });

  it('setImportErrors reemplaza los errores de la última importación', () => {
    service.setImportErrors(['Línea 2: falta la referencia.']);
    expect(service.importErrors()).toEqual(['Línea 2: falta la referencia.']);

    service.setImportErrors([]);
    expect(service.importErrors()).toEqual([]);
  });

  it('al cambiar de orden se reinician importadas y errores', () => {
    service.importSettlements([imported(1)]);
    service.setImportErrors(['Error']);

    orderId.set('CORTE-0816-099');
    expect(service.importedCount()).toBe(0);
    expect(service.importErrors()).toEqual([]);
  });

  it('importErrors es de solo lectura (sin set directo)', () => {
    expect((service.importErrors as unknown as { set?: unknown }).set).toBeUndefined();
  });
});

describe('DifferenceManagementService (con semilla: bindSeed)', () => {
  const seeded = (id: string, amount: number): SettlementTransaction => ({
    id,
    date: '2026-09-10',
    orderId: `REF-${id}`,
    tenderMedia: 'efectivo',
    amount,
    batchId: `LOTE-REF-${id}`,
    description: `Movimiento ${id}`,
  });
  const SELECTED = [seeded('B1', 300), seeded('B2', 200)];
  const SUGGESTED = [seeded('C1', 50), seeded('C2', 25.5), seeded('C3', 10)];
  const poolIds = new Set(MOCK_SETTLEMENTS['efectivo'].map((s) => s.id));

  let service: DifferenceManagementService;
  let orderId: ReturnType<typeof signal<string | null>>;
  let selected: ReturnType<typeof signal<SettlementTransaction[]>>;
  let suggested: ReturnType<typeof signal<SettlementTransaction[]>>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DifferenceManagementService] });
    service = TestBed.inject(DifferenceManagementService);
    orderId = signal<string | null>('CORTE-0827-02');
    selected = signal(SELECTED);
    suggested = signal(SUGGESTED);
    service.bindOrder(signal<TenderMedia | null>('efectivo'), orderId);
    service.bindSeed(selected, suggested);
  });

  it('la lista son las elegidas (del back) seguidas de las sugeridas (no del back)', () => {
    expect(service.candidates().map((c) => [c.settlement.id, c.suggestedByBackend])).toEqual([
      ['B1', true],
      ['B2', true],
      ['C1', false],
      ['C2', false],
      ['C3', false],
    ]);
  });

  it('no usa el pool de liquidaciones: solo aparecen las sembradas', () => {
    expect(service.candidates().every((c) => !poolIds.has(c.settlement.id))).toBe(true);
    expect(service.candidates()).toHaveLength(5);
  });

  it('no exige una venta: con una orden inexistente la lista sembrada igual aparece', () => {
    orderId.set('NO-EXISTE');

    expect(service.order()).toBeNull();
    expect(service.candidates()).toHaveLength(5);
  });

  it('las elegidas arrancan seleccionadas con origen "backend" y las sugeridas sin seleccionar', () => {
    expect(service.selectedCount()).toBe(2);
    for (const id of ['B1', 'B2']) {
      expect(service.isSelected(id), id).toBe(true);
      expect(service.originOf(id), id).toBe('backend');
    }
    for (const id of ['C1', 'C2', 'C3']) {
      expect(service.isSelected(id), id).toBe(false);
      expect(service.originOf(id), id).toBeNull();
    }
  });

  it('selectedSettledAmount es la suma de las seleccionadas y selectedDifference parte del monto de la venta', () => {
    const sale = service.order()!.sale!.amount;

    expect(service.selectedSettledAmount()).toBe(500);
    expect(service.selectedDifference()).toBe(Math.round((sale - 500) * 100) / 100);
  });

  it('agregar una sugerida la selecciona como "manual" y suma su monto', () => {
    service.toggleCandidate('C2');

    expect(service.isSelected('C2')).toBe(true);
    expect(service.originOf('C2')).toBe('manual');
    expect(service.selectedCount()).toBe(3);
    expect(service.selectedSettledAmount()).toBe(525.5);
  });

  it('quitar una elegida la deselecciona y resta su monto; volver a marcarla queda como "manual"', () => {
    service.toggleCandidate('B1');

    expect(service.isSelected('B1')).toBe(false);
    expect(service.selectedCount()).toBe(1);
    expect(service.selectedSettledAmount()).toBe(200);
    expect(service.candidates()).toHaveLength(5);

    service.toggleCandidate('B1');
    expect(service.originOf('B1')).toBe('manual');
    expect(service.selectedSettledAmount()).toBe(500);
  });

  it('quitar todas deja la selección en 0 y canSave en falso aunque haya nota', () => {
    service.setNote('Pago parcial verificado');
    expect(service.canSave()).toBe(true);

    service.toggleCandidate('B1');
    service.toggleCandidate('B2');

    expect(service.selectedCount()).toBe(0);
    expect(service.selectedSettledAmount()).toBe(0);
    expect(service.canSave()).toBe(false);
  });

  it('una sugerida repetida en las elegidas aparece una sola vez, como del back', () => {
    suggested.set([SELECTED[0], SUGGESTED[0]]);

    expect(service.candidates().map((c) => [c.settlement.id, c.suggestedByBackend])).toEqual([
      ['B1', true],
      ['B2', true],
      ['C1', false],
    ]);
  });

  it('al cambiar de orden la selección vuelve a la semilla y la nota se limpia', () => {
    service.toggleCandidate('B1');
    service.toggleCandidate('C1');
    service.setNote('Nota de la orden anterior');

    orderId.set('CORTE-0816-099');

    expect(service.selectedCount()).toBe(2);
    expect(service.isSelected('B1')).toBe(true);
    expect(service.isSelected('C1')).toBe(false);
    expect(service.originOf('B1')).toBe('backend');
    expect(service.note()).toBe('');
  });

  it('al cambiar los ids sembrados la selección se reinicia y la lista se actualiza', () => {
    service.toggleCandidate('C1');

    selected.set([seeded('N1', 70)]);

    expect(service.candidates().map((c) => c.settlement.id)).toEqual(['N1', 'C1', 'C2', 'C3']);
    expect(['N1', 'C1'].map((id) => service.isSelected(id))).toEqual([true, false]);
    expect(service.selectedCount()).toBe(1);
    expect(service.selectedSettledAmount()).toBe(70);
  });

  it('una semilla nueva con los mismos ids no reinicia lo que el usuario cambió', () => {
    service.toggleCandidate('C1');

    selected.set(SELECTED.map((s) => ({ ...s })));

    expect(service.isSelected('C1')).toBe(true);
    expect(service.selectedCount()).toBe(3);
  });

  it('cambiar solo las sugeridas conserva la selección', () => {
    service.toggleCandidate('C1');

    suggested.set([SUGGESTED[0], seeded('C9', 5)]);

    expect(service.candidates().map((c) => c.settlement.id)).toEqual(['B1', 'B2', 'C1', 'C9']);
    expect(service.isSelected('C1')).toBe(true);
    expect(service.selectedSettledAmount()).toBe(550);
  });

  it('save devuelve las ids seleccionadas y la suma, y registra el match', () => {
    const store = TestBed.inject(ResolvedMatchesStore);
    service.toggleCandidate('C1');
    service.setNote('  Pago parcial verificado  ');

    const result = service.save();

    expect(result).toEqual({
      orderId: 'CORTE-0827-02',
      matchedSettlementIds: ['B1', 'B2', 'C1'],
      settledAmount: 550,
      note: 'Pago parcial verificado',
    });
    expect(store.get('efectivo', 'CORTE-0827-02')?.matchedSettlementIds).toEqual(['B1', 'B2', 'C1']);
  });

  it('con semilla sin elegidas la lista son solo las sugeridas y arrancan sin seleccionar', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [DifferenceManagementService] });
    const bare = TestBed.inject(DifferenceManagementService);
    bare.bindOrder(signal<TenderMedia | null>('didi_food'), signal<string | null>('DIDI-041'));
    bare.bindSeed(signal([]), signal(SUGGESTED));

    expect(bare.candidates().map((c) => [c.settlement.id, c.suggestedByBackend])).toEqual([
      ['C1', false],
      ['C2', false],
      ['C3', false],
    ]);
    expect(bare.selectedCount()).toBe(0);
    expect(bare.selectedSettledAmount()).toBe(0);
  });

  it('la importación por CSV no agrega candidatos mientras haya semilla', () => {
    service.importSettlements([imported(1)]);

    expect(service.importedCount()).toBe(1);
    expect(service.candidates()).toHaveLength(5);
  });
});
