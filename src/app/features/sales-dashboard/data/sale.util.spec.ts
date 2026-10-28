import { ACTIVE_COUNTRY } from '../../../core/country/active-country';
import { SalesTaxDef } from '../../../core/country/country.model';
import { MatchStatus } from '../../../shared/models/reconciliation-item.model';
import { Sale } from '../../../shared/models/sale.model';
import {
  saleReconciliationStatus,
  saleSubtotal,
  saleTaxAmount,
  saleTaxLines,
  saleTaxableBase,
  saleTotal,
} from './sale.util';

// Solo los campos que leen las funciones; el resto del modelo no interviene.
function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    items: [
      { id: 'i1', productName: 'Ceviche', quantity: 2, unitPrice: 150 },
      { id: 'i2', productName: 'Agua', quantity: 3, unitPrice: 25.5 },
    ],
    discountAmount: 0,
    tipAmount: 0,
    reconciliationStatus: 'matched',
    ...overrides,
  } as Sale;
}

const IVA_16: SalesTaxDef[] = [{ code: '002', name: 'IVA', rate: 0.16 }];

describe('sale.util', () => {
  describe('saleSubtotal', () => {
    it('suma cantidad × precio unitario de cada partida', () => {
      expect(saleSubtotal(sale())).toBeCloseTo(376.5, 10);
    });

    it('es 0 sin partidas', () => {
      expect(saleSubtotal(sale({ items: [] }))).toBe(0);
    });
  });

  describe('saleTaxableBase', () => {
    it('resta el descuento al subtotal', () => {
      expect(saleTaxableBase(sale({ discountAmount: 76.5 }))).toBeCloseTo(300, 10);
    });
  });

  describe('saleTaxLines', () => {
    it('aplica cada impuesto sobre la base gravable y conserva su definición', () => {
      const lines = saleTaxLines(sale({ discountAmount: 76.5 }), IVA_16);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ code: '002', name: 'IVA', rate: 0.16 });
      expect(lines[0].amount).toBeCloseTo(48, 10);
    });

    it('genera una línea por impuesto definido', () => {
      const taxes: SalesTaxDef[] = [...IVA_16, { code: 'X', name: 'Otro', rate: 0.05 }];
      const lines = saleTaxLines(sale({ items: [{ id: 'i', productName: 'p', quantity: 1, unitPrice: 100 }] }), taxes);
      expect(lines.map((l) => [l.code, l.amount])).toEqual([
        ['002', 16],
        ['X', 5],
      ]);
    });

    it('sin impuestos devuelve una lista vacía', () => {
      expect(saleTaxLines(sale(), [])).toEqual([]);
    });

    it('por defecto usa los impuestos del país activo', () => {
      const lines = saleTaxLines(sale());
      expect(lines.map((l) => l.code)).toEqual(ACTIVE_COUNTRY.salesTaxes.map((t) => t.code));
    });
  });

  describe('saleTaxAmount', () => {
    it('suma todas las líneas de impuesto', () => {
      const taxes: SalesTaxDef[] = [...IVA_16, { code: 'X', name: 'Otro', rate: 0.04 }];
      const s = sale({ items: [{ id: 'i', productName: 'p', quantity: 1, unitPrice: 200 }] });
      expect(saleTaxAmount(s, taxes)).toBeCloseTo(40, 10);
    });

    it('por defecto aplica la tasa del país activo', () => {
      const s = sale({ items: [{ id: 'i', productName: 'p', quantity: 1, unitPrice: 100 }] });
      const rate = ACTIVE_COUNTRY.salesTaxes.reduce((sum, t) => sum + t.rate, 0);
      expect(saleTaxAmount(s)).toBeCloseTo(100 * rate, 10);
    });
  });

  describe('saleTotal', () => {
    it('es base gravable + impuestos del país activo + propina', () => {
      const s = sale({
        items: [{ id: 'i', productName: 'p', quantity: 2, unitPrice: 100 }],
        discountAmount: 50,
        tipAmount: 20,
      });
      const rate = ACTIVE_COUNTRY.salesTaxes.reduce((sum, t) => sum + t.rate, 0);
      expect(saleTotal(s)).toBeCloseTo(150 + 150 * rate + 20, 10);
    });
  });

  describe('saleReconciliationStatus', () => {
    it.each<[MatchStatus, string]>([
      ['matched', 'conciliado'],
      ['sale_only', 'por_conciliar'],
      ['amount_mismatch', 'desconciliado'],
      ['settlement_only', 'desconciliado'],
    ])('%s → %s', (status, expected) => {
      expect(saleReconciliationStatus(sale({ reconciliationStatus: status }))).toBe(expected);
    });
  });
});
