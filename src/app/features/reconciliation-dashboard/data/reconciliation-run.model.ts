/**
 * Estado de una corrida completa; `pendiente` significa que aún no termina.
 *
 * @remarks No es `ReconciliationStatus` (por día + medio de pago) de `shared/models`.
 * @see docs/codigo/conciliacion.md#corridas
 */
export type ReconciliationRunStatus = 'conciliado' | 'pendiente' | 'desconciliado';

/** Conciliación (corrida) de una empresa, un restaurante y un periodo: POS contra banco. */
export interface ReconciliationRun {
  id: string; // 'CON-0001'
  createdAt: string; // 'yyyy-MM-dd' — "Fecha" de la tabla: cuándo se creó la conciliación
  companyName: string; // Empresa (subsidiaria)
  storeName: string; // Restaurante (tienda / ubicación)
  periodStart: string; // 'yyyy-MM-dd'
  periodEnd: string; // 'yyyy-MM-dd'
  status: ReconciliationRunStatus;
  comments: string; // Comentarios de la tabla ('' = sin comentarios)
}

/** Datos del modal "Nueva conciliación"; id, fecha y estado los pone el store. */
export interface NewReconciliationRunInput {
  companyName: string;
  storeName: string;
  periodStart: string;
  periodEnd: string;
}
