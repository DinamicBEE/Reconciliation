import { SaleTransaction, SettlementTransaction, TransactionMatch } from '../models/reconciliation-item.model';

/**
 * Cruza ventas y liquidaciones por número de orden (función pura).
 *
 * @remarks Suma todas las liquidaciones de una orden; `settlement` es solo la primera, como fila representativa.
 * @returns Un {@link TransactionMatch} por orden, ordenados por fecha; las liquidaciones sin venta quedan como `settlement_only`.
 * @see docs/codigo/conciliacion.md#cruce-de-transacciones
 */
export function crossMatchTransactions(
  sales: SaleTransaction[],
  settlements: SettlementTransaction[],
): TransactionMatch[] {
  // Una orden puede liquidarse en varios depósitos: se agrupan para sumar el monto real.
  const settlementsByOrder = new Map<string, SettlementTransaction[]>();
  for (const settlement of settlements) {
    const list = settlementsByOrder.get(settlement.orderId);
    if (list) {
      list.push(settlement);
    } else {
      settlementsByOrder.set(settlement.orderId, [settlement]);
    }
  }

  const matchedOrderIds = new Set<string>();
  const results: TransactionMatch[] = [];

  for (const sale of sales) {
    const orderSettlements = settlementsByOrder.get(sale.orderId) ?? [];
    const settledAmount = orderSettlements.reduce((sum, s) => sum + s.amount, 0);
    matchedOrderIds.add(sale.orderId);

    results.push({
      orderId: sale.orderId,
      tenderMedia: sale.tenderMedia,
      date: sale.date,
      sale,
      settlement: orderSettlements[0] ?? null,
      status: orderSettlements.length === 0 ? 'sale_only' : settledAmount === sale.amount ? 'matched' : 'amount_mismatch',
      difference: sale.amount - settledAmount,
    });
  }

  for (const settlement of settlements) {
    if (matchedOrderIds.has(settlement.orderId)) continue;

    results.push({
      orderId: settlement.orderId,
      tenderMedia: settlement.tenderMedia,
      date: settlement.date,
      sale: null,
      settlement,
      status: 'settlement_only',
      difference: -settlement.amount,
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}
