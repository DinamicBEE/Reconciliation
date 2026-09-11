export type TenderMedia = 'rappi' | 'didi_food' | 'efectivo' | 'bbva';

export const TENDER_MEDIA_LABEL: Record<TenderMedia, string> = {
  rappi: 'Rappi',
  didi_food: 'DiDi Food',
  efectivo: 'Efectivo',
  bbva: 'BBVA',
};

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

// --- Cruce transacción a transacción (módulo "Conciliación") ---
// Dos fuentes independientes que se emparejan por número de orden/referencia:
// lo VENDIDO en el POS vs lo LIQUIDADO (lo que efectivamente reportó/pagó el
// banco o medio de pago).

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
  description: string; // texto libre del banco/proveedor — usado en "Gestión de diferencias"
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

// --- Estado simplificado de la tabla de "Conciliación" (totales por tender
// media + fecha) ---
// Vista de 3 estados, distinta de `MatchStatus` (4 estados, a nivel de
// ORDEN — sigue usándola `difference-management`/`sales-dashboard`, ver
// MASTER.md "Patrón: conciliación por tender media y fecha"). Un grupo
// "desconciliado" cubre DOS causas a nivel de orden (monto distinto, o una
// liquidación bancaria sin venta) — a nivel de día+medio de pago ambas son
// "esto no cuadra, hay que revisarlo", no ameritan distinguirse en la tabla
// agrupada.
//
// conciliado: lo vendido y lo liquidado ese día, para ese medio, coinciden.
// desconciliado: no coinciden (o el banco liquidó algo sin venta asociada).
// por_conciliar: hay venta pero el proveedor aún no liquida nada ese día.
export type ReconciliationStatus = 'conciliado' | 'desconciliado' | 'por_conciliar';
