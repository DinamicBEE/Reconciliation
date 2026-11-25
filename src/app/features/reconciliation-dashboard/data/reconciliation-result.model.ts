import { TenderMedia } from '../../../shared/models/reconciliation-item.model';

/**
 * Estado de una línea del resultado: `coincide` (mismo monto), `diferencia` (monto distinto)
 * o `sin_coincidencia` (solo existe en el POS o solo en el banco).
 */
export type ReconciliationResultStatus = 'coincide' | 'diferencia' | 'sin_coincidencia';

/** Un lado (POS o banco) de una línea: lo que muestra el detalle. */
export interface ReconciliationLineSide {
  reference: string;
  amount: number;
  concept: string;
  paymentMethod: string;
}

/** Un movimiento del banco abonado a una venta; una venta puede tener varios (1 a muchos). */
export interface ReconciliationBankMovement {
  id: string;
  date: string; // 'yyyy-MM-dd'
  reference: string;
  amount: number;
  concept: string;
  paymentMethod: string;
}

/** Línea del resultado POS contra banco, tal como la calcula el backend. */
export interface ReconciliationResultRow {
  id: string;
  date: string; // 'yyyy-MM-dd'
  reference: string; // referencia de cruce (folio del POS / del banco)
  tenderMedia: TenderMedia | null; // null en el cruce del banco: el back no lo distingue
  channel: string; // subtítulo de la referencia: medio de pago o descripción del banco
  pos: ReconciliationLineSide | null; // null: la línea no existe en el POS
  bank: ReconciliationBankMovement[]; // vacío: la línea no existe en el banco
  candidates: ReconciliationBankMovement[]; // movimientos sin asignar que el back sugiere al ajustar
  difference: number; // POS menos la suma de `bank`
  comment: string; // lectura del backend sobre la línea
  status: ReconciliationResultStatus;
}

/** Conteo de líneas de un estado y su porcentaje sobre el total. */
export interface ReconciliationResultKpi {
  count: number;
  percentage: number; // 0–100, un decimal, respecto al total de líneas
}

/**
 * Resultado de comparar el POS contra el banco de una conciliación (paso "Validación").
 *
 * @remarks El front solo lo muestra: conteos, porcentajes y estados vienen calculados.
 * @see docs/codigo/conciliacion.md#envio-y-resultado
 */
export interface ReconciliationResult {
  total: number;
  /** Suma de los montos de cada lado. */
  totals: { pos: number; bank: number };
  kpis: {
    coincidencias: ReconciliationResultKpi;
    diferencias: ReconciliationResultKpi;
    sinCoincidencias: ReconciliationResultKpi;
  };
  rows: ReconciliationResultRow[];
}
