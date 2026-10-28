import { ACTIVE_COUNTRY } from '../../../core/country/active-country';
import { SalesTaxDef } from '../../../core/country/country.model';
import { ReconciliationStatus } from '../../../shared/models/reconciliation-item.model';
import { Sale } from '../../../shared/models/sale.model';

/**
 * Impuesto trasladado del país activo con su monto calculado.
 *
 * @remarks Sin tasa por producto, cada impuesto se aplica a la base gravable de toda la venta.
 */
export interface SaleTaxLine extends SalesTaxDef {
  amount: number;
}

/** Suma de cantidad × precio unitario de las líneas, sin descuento. */
export function saleSubtotal(sale: Sale): number {
  return sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/** Base gravable: subtotal menos el descuento. */
export function saleTaxableBase(sale: Sale): number {
  return saleSubtotal(sale) - sale.discountAmount;
}

/** Desglose de impuestos sobre la base gravable (por defecto, los del país activo). */
export function saleTaxLines(sale: Sale, taxes: readonly SalesTaxDef[] = ACTIVE_COUNTRY.salesTaxes): SaleTaxLine[] {
  const base = saleTaxableBase(sale);
  return taxes.map((tax) => ({ ...tax, amount: base * tax.rate }));
}

/** Suma de {@link saleTaxLines}. */
export function saleTaxAmount(sale: Sale, taxes: readonly SalesTaxDef[] = ACTIVE_COUNTRY.salesTaxes): number {
  return saleTaxLines(sale, taxes).reduce((sum, line) => sum + line.amount, 0);
}

/** Total cobrado: subtotal − descuento + impuestos + propina. */
export function saleTotal(sale: Sale): number {
  return saleTaxableBase(sale) + saleTaxAmount(sale) + sale.tipAmount;
}

/**
 * Traduce el `MatchStatus` de la orden (4 estados) al {@link ReconciliationStatus} de 3 estados.
 *
 * @remarks Mismo criterio que `statusFor()` de `group-by-tender-day.util.ts`, aplicado a una orden.
 * @see docs/codigo/ventas.md#estado-de-conciliacion-de-venta
 */
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
