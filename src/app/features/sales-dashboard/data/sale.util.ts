import { Sale } from '../../../shared/models/sale.model';

export function saleSubtotal(sale: Sale): number {
  return sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function saleTotal(sale: Sale): number {
  return saleSubtotal(sale) - sale.discountAmount;
}
