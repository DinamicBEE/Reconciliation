import { Sale } from '../../../shared/models/sale.model';

// IVA estándar México — hasta que exista una tasa por producto/categoría,
// una sola tasa global es suficiente para la demo.
export const SALE_TAX_RATE = 0.16;

export function saleSubtotal(sale: Sale): number {
  return sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

// Base gravable: subtotal ya con el descuento aplicado.
export function saleTaxableBase(sale: Sale): number {
  return saleSubtotal(sale) - sale.discountAmount;
}

export function saleTaxAmount(sale: Sale): number {
  return saleTaxableBase(sale) * SALE_TAX_RATE;
}

// Total real cobrado al cliente: subtotal - descuento + impuestos + propina.
export function saleTotal(sale: Sale): number {
  return saleTaxableBase(sale) + saleTaxAmount(sale) + sale.tipAmount;
}
