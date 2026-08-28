export type ReconciliationStatus = 'matched' | 'pending' | 'discrepancy';

export type TenderMedia = 'rappi' | 'didi_food' | 'efectivo' | 'bbva';

export const TENDER_MEDIA_LABEL: Record<TenderMedia, string> = {
  rappi: 'Rappi',
  didi_food: 'DiDi Food',
  efectivo: 'Efectivo',
  bbva: 'BBVA',
};

export interface ReconciliationItem {
  id: string;
  date: string; // ISO date
  description: string;
  account: string;
  reference: string;
  tenderMedia: TenderMedia;
  bankAmount: number;
  bookAmount: number;
  status: ReconciliationStatus;
}

export interface ReconciliationSummary {
  totalMovements: number;
  matchedCount: number;
  pendingCount: number;
  discrepancyCount: number;
  totalDiscrepancyAmount: number;
  lastSyncedAt: string; // ISO datetime
}

export type TenderMediaHealth = 'up_to_date' | 'delayed';

export interface TenderMediaStatus {
  tenderMedia: TenderMedia;
  health: TenderMediaHealth;
  lastReconciledAt: string; // ISO datetime
  daysBehind: number; // 0 si está al día
}

export interface TrendPoint {
  date: string; // ISO date
  value: number;
}

// --- Cruce transacción a transacción (módulo "Detalle por tender media") ---
// Dos fuentes independientes que se emparejan por número de orden/referencia:
// lo VENDIDO (registrado en el sistema interno) vs lo LIQUIDADO (lo que
// efectivamente pagó/liquidó el medio de pago).

export interface SaleTransaction {
  id: string;
  date: string; // ISO date
  orderId: string; // referencia de cruce
  tenderMedia: TenderMedia;
  amount: number;
}

export interface SettlementTransaction {
  id: string;
  date: string; // ISO date
  orderId: string; // referencia de cruce — debe matchear con SaleTransaction.orderId
  tenderMedia: TenderMedia;
  amount: number;
  batchId: string; // lote de liquidación del proveedor
}

// matched: existe en ambos lados y el monto coincide.
// amount_mismatch: existe en ambos lados pero el monto difiere.
// sale_only: hay venta registrada pero el proveedor aún no la liquida.
// settlement_only: el proveedor liquidó algo que no tiene venta registrada
//   (anomalía — posible duplicado o venta no capturada).
export type MatchStatus = 'matched' | 'amount_mismatch' | 'sale_only' | 'settlement_only';

export interface TransactionMatch {
  orderId: string;
  tenderMedia: TenderMedia;
  date: string; // ISO date — la del lado que sí exista, prioriza venta
  sale: SaleTransaction | null;
  settlement: SettlementTransaction | null;
  status: MatchStatus;
  difference: number; // (sale?.amount ?? 0) - (settlement?.amount ?? 0)
}
