import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SettlementTransaction, TenderMedia } from '../../../shared/models/reconciliation-item.model';
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
