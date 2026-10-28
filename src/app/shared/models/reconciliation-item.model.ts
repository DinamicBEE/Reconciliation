/** Medio de pago (tender media) que se concilia. */
export type TenderMedia = 'rappi' | 'didi_food' | 'efectivo' | 'bbva';

/** Etiqueta visible de cada {@link TenderMedia}. */
export const TENDER_MEDIA_LABEL: Record<TenderMedia, string> = {
  rappi: 'Rappi',
  didi_food: 'DiDi Food',
  efectivo: 'Efectivo',
  bbva: 'BBVA',
};

/** Salud de la conciliación de un medio de pago: al día o con atraso. */
export type TenderMediaHealth = 'up_to_date' | 'delayed';

/** Estado de conciliación de un medio de pago (fecha de la última y días de atraso). */
export interface TenderMediaStatus {
  tenderMedia: TenderMedia;
  health: TenderMediaHealth;
  lastReconciledAt: string; // ISO datetime
  daysBehind: number; // 0 si está al día
}

/** Punto de una serie diaria (sparkline de KPI). */
export interface TrendPoint {
  date: string; // ISO date
  value: number;
}

// --- Cruce transacción a transacción ---

/**
 * Venta registrada en el POS; se cruza con {@link SettlementTransaction} por `orderId`.
 *
 * @see docs/codigo/conciliacion.md#cruce-de-transacciones
 */
export interface SaleTransaction {
  id: string;
  date: string; // ISO date
  orderId: string; // referencia de cruce
  tenderMedia: TenderMedia;
  amount: number;
}

/** Liquidación (lo que reportó o pagó el banco o el medio de pago) de una orden. */
export interface SettlementTransaction {
  id: string;
  date: string; // ISO date
  orderId: string; // referencia de cruce — debe matchear con SaleTransaction.orderId
  tenderMedia: TenderMedia;
  amount: number;
  batchId: string; // lote de liquidación del proveedor
  description: string; // texto libre del banco/proveedor — usado en "Gestión de diferencias"
}

/**
 * Estado de cruce de una orden: `matched` (montos iguales), `amount_mismatch` (montos distintos),
 * `sale_only` (aún sin liquidar) o `settlement_only` (liquidación sin venta, anomalía).
 *
 * @see docs/codigo/conciliacion.md#cruce-de-transacciones
 */
export type MatchStatus = 'matched' | 'amount_mismatch' | 'sale_only' | 'settlement_only';

/** Resultado del cruce de una orden; lo produce {@link crossMatchTransactions}. */
export interface TransactionMatch {
  orderId: string;
  tenderMedia: TenderMedia;
  date: string; // ISO date — la del lado que sí exista, prioriza venta
  sale: SaleTransaction | null;
  settlement: SettlementTransaction | null;
  status: MatchStatus;
  difference: number; // (sale?.amount ?? 0) - (settlement?.amount ?? 0)
}

/**
 * Estado de un grupo medio de pago + día en la tabla de "Conciliación": `conciliado` (cuadra),
 * `desconciliado` (no cuadra o hay liquidación sin venta) o `por_conciliar` (aún sin liquidar).
 *
 * @remarks Es una vista de 3 estados distinta de {@link MatchStatus}, que es por orden.
 * @see docs/codigo/conciliacion.md#cruce-de-transacciones
 */
export type ReconciliationStatus = 'conciliado' | 'desconciliado' | 'por_conciliar';
