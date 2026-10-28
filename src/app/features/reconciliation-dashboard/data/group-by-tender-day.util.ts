import {
  ReconciliationStatus,
  SaleTransaction,
  SettlementTransaction,
  TenderMedia,
  TransactionMatch,
} from '../../../shared/models/reconciliation-item.model';

/**
 * Total vendido (POS) contra total liquidado de un medio de pago en un día.
 *
 * @remarks Se agrupa por día porque el banco liquida en lote por día, no orden por orden.
 * @see design-system/conciliation/MASTER.md "Patrón: conciliación por tender media y fecha"
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
  // Primera orden `sale_only`/`amount_mismatch` del grupo, destino de "Gestionar";
  // `null` si no hay ninguna. Ver docs/codigo/conciliacion.md#agrupacion-por-tender-y-dia
  actionableOrder: TransactionMatch | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// "desconciliado" cubre monto distinto y liquidación sin venta (ver `ReconciliationStatus`).
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
 * Agrupa ventas y liquidaciones por día + medio de pago (función pura).
 *
 * @param orderMatches - Cruce por orden ya calculado ({@link crossMatchTransactions}); solo da el `actionableOrder`, no los totales.
 * @returns Un {@link TenderDaySummary} por grupo, ordenados por fecha y medio de pago.
 * @see docs/codigo/conciliacion.md#agrupacion-por-tender-y-dia
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
