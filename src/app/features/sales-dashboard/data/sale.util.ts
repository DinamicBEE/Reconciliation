import { ACTIVE_COUNTRY } from '../../../core/country/active-country';
import { SalesTaxDef } from '../../../core/country/country.model';
import { ReconciliationStatus } from '../../../shared/models/reconciliation-item.model';
import { Sale } from '../../../shared/models/sale.model';

// Impuestos trasladados del país activo (`environment.country`): IVA 16 %
// en México, IVA 19 % en Colombia — hasta que exista una tasa por
// producto/categoría, se aplican sobre la base gravable de toda la venta.
export interface SaleTaxLine extends SalesTaxDef {
  amount: number;
}

export function saleSubtotal(sale: Sale): number {
  return sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

// Base gravable: subtotal ya con el descuento aplicado.
export function saleTaxableBase(sale: Sale): number {
  return saleSubtotal(sale) - sale.discountAmount;
}

export function saleTaxLines(sale: Sale, taxes: readonly SalesTaxDef[] = ACTIVE_COUNTRY.salesTaxes): SaleTaxLine[] {
  const base = saleTaxableBase(sale);
  return taxes.map((tax) => ({ ...tax, amount: base * tax.rate }));
}

export function saleTaxAmount(sale: Sale, taxes: readonly SalesTaxDef[] = ACTIVE_COUNTRY.salesTaxes): number {
  return saleTaxLines(sale, taxes).reduce((sum, line) => sum + line.amount, 0);
}

// Total real cobrado al cliente: subtotal - descuento + impuestos + propina.
export function saleTotal(sale: Sale): number {
  return saleTaxableBase(sale) + saleTaxAmount(sale) + sale.tipAmount;
}

// Traduce el MatchStatus de la venta (4 estados, a nivel de orden) al mismo
// vocabulario de 3 estados que usa la columna "Estado" de la tabla de
// Conciliación (`ReconciliationStatus`) — para que la columna "Estado" de
// "Resumen de venta" hable el mismo idioma en toda la app, en vez de mezclar
// "Cruzado"/"Por liquidar" (MatchStatus) con "Conciliado"/"Por conciliar"
// (ReconciliationStatus) según la pantalla. Mismo criterio de mapeo que
// `statusFor()` en `group-by-tender-day.util.ts` (soldAmount vs.
// settledAmount), aplicado aquí a una sola orden en vez de un grupo:
// coincide → conciliado; aún no hay liquidación → por conciliar; cualquier
// otra discrepancia (monto distinto, o una liquidación sin venta) →
// desconciliado.
export function saleReconciliationStatus(sale: Sale): ReconciliationStatus {
  switch (sale.reconciliationStatus) {
    case 'matched':
      return 'conciliado';
    case 'sale_only':
      return 'por_conciliar';
    default:
      return 'desconciliado';
  }
}
