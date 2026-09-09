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
  // Una orden puede liquidarse en más de un depósito bancario (p. ej. un
  // abono parcial + un ajuste, ver `sales-settlements.mock-data.ts`) — se
  // agrupan TODAS las liquidaciones de la misma orden para sumar su monto
  // real, no solo tomar "la última" (lo que rompería `status`/`difference`
  // en cuanto una orden tuviera más de una fila). `settlement` sigue siendo
  // una sola fila representativa (la primera) para no romper a los
  // consumidores existentes que solo necesitan mostrar un folio/lote/
  // descripción — el monto ya no depende de cuál fila sea esa.
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
