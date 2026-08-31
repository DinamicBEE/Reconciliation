import { SaleTransaction, SettlementTransaction, TransactionMatch } from '../models/reconciliation-item.model';

/**
 * Cruza ventas y liquidaciones por número de orden/referencia. Función pura
 * (sin estado) para poder probarla aislada del servicio. Promovida desde
 * tender-detail/data al aparecer un segundo consumidor
 * (features/difference-management) — ver MASTER.md.
 */
export function crossMatchTransactions(
  sales: SaleTransaction[],
  settlements: SettlementTransaction[],
): TransactionMatch[] {
  const settlementByOrder = new Map(settlements.map((s) => [s.orderId, s]));
  const matchedOrderIds = new Set<string>();
  const results: TransactionMatch[] = [];

  for (const sale of sales) {
    const settlement = settlementByOrder.get(sale.orderId) ?? null;
    matchedOrderIds.add(sale.orderId);

    results.push({
      orderId: sale.orderId,
      tenderMedia: sale.tenderMedia,
      date: sale.date,
      sale,
      settlement,
      status: !settlement ? 'sale_only' : settlement.amount === sale.amount ? 'matched' : 'amount_mismatch',
      difference: sale.amount - (settlement?.amount ?? 0),
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
