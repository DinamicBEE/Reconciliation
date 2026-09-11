import {
  ReconciliationStatus,
  SaleTransaction,
  SettlementTransaction,
  TenderMedia,
  TransactionMatch,
} from '../../../shared/models/reconciliation-item.model';

/**
 * Fila de la tabla de "Conciliación": total vendido (POS) vs. total banco
 * agrupado por medio de pago + fecha — no por orden individual (ver
 * MASTER.md, "Patrón: conciliación por tender media y fecha"). Un banco
 * liquida en lote por día, no orden por orden; comparar totales diarios es
 * lo que de verdad se concilia contra el estado de cuenta.
 */
export interface TenderDaySummary {
  date: string; // ISO date
  tenderMedia: TenderMedia;
  soldAmount: number;
  soldCount: number; // # de ventas POS del día que entran en soldAmount
  settledAmount: number;
  settlements: SettlementTransaction[]; // transacciones bancarias del día — "Ver detalles"
  status: ReconciliationStatus;
  difference: number;
  // Una orden puntual sale_only/amount_mismatch (MatchStatus, a nivel de
  // orden — ver cross-match.util.ts) dentro de este grupo, para que
  // "Gestionar" apunte a una pantalla de resolución concreta (que sigue
  // siendo por orden, ver difference-management) — null cuando el grupo no
  // tiene ninguna orden así (ya está "conciliado", o es una anomalía
  // `settlement_only` pura sin venta que gestionar).
  actionableOrder: TransactionMatch | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// 3 estados, no 4 — "desconciliado" cubre tanto un monto distinto como una
// liquidación bancaria sin venta asociada (ver `ReconciliationStatus` en
// reconciliation-item.model.ts): a nivel de día+medio de pago ambas causas
// son "esto no cuadra", no ameritan su propio estado en esta tabla.
function statusFor(soldAmount: number, settledAmount: number): ReconciliationStatus {
  if (soldAmount > 0 && settledAmount === 0) return 'por_conciliar';
  if (soldAmount === settledAmount) return 'conciliado';
  return 'desconciliado';
}

interface Bucket {
  date: string;
  tenderMedia: TenderMedia;
  sold: SaleTransaction[];
  settlements: SettlementTransaction[];
}

/**
 * Agrupa ventas y liquidaciones (ya separadas por tender media, mismo shape
 * que `sales-settlements.mock-data.ts`) por `date + tenderMedia`. Función
 * pura — sin estado, testeable aislada, mismo criterio que
 * `cross-match.util.ts`. `orderMatches` es el cruce POR ORDEN ya calculado
 * (ver `crossMatchTransactions`) — se reutiliza solo para encontrar el
 * `actionableOrder` de cada grupo, no para el total (que sale directo de
 * sumar `sales`/`settlements`).
 */
export function groupByTenderDay(
  sales: Record<TenderMedia, SaleTransaction[]>,
  settlements: Record<TenderMedia, SettlementTransaction[]>,
  orderMatches: TransactionMatch[],
  tenderMediaList: TenderMedia[],
): TenderDaySummary[] {
  const buckets = new Map<string, Bucket>();

  function bucketFor(date: string, tenderMedia: TenderMedia): Bucket {
    const key = `${date}|${tenderMedia}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { date, tenderMedia, sold: [], settlements: [] };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const tenderMedia of tenderMediaList) {
    for (const sale of sales[tenderMedia]) bucketFor(sale.date, tenderMedia).sold.push(sale);
    for (const settlement of settlements[tenderMedia]) bucketFor(settlement.date, tenderMedia).settlements.push(settlement);
  }

  return [...buckets.values()]
    .map((bucket): TenderDaySummary => {
      const soldAmount = round2(bucket.sold.reduce((sum, s) => sum + s.amount, 0));
      const settledAmount = round2(bucket.settlements.reduce((sum, s) => sum + s.amount, 0));
      const actionableOrder =
        orderMatches.find(
          (m) =>
            m.date === bucket.date &&
            m.tenderMedia === bucket.tenderMedia &&
            (m.status === 'sale_only' || m.status === 'amount_mismatch'),
        ) ?? null;

      return {
        date: bucket.date,
        tenderMedia: bucket.tenderMedia,
        soldAmount,
        soldCount: bucket.sold.length,
        settledAmount,
        settlements: bucket.settlements,
        status: statusFor(soldAmount, settledAmount),
        difference: round2(soldAmount - settledAmount),
        actionableOrder,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.tenderMedia.localeCompare(b.tenderMedia));
}
