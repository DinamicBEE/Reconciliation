/**
 * Estado de una corrida completa; `pendiente` significa que aún no termina (`por_conciliar` en el backend).
 *
 * @remarks No es `ReconciliationStatus` (por día + medio de pago) de `shared/models`.
 * @see docs/codigo/conciliacion.md#corridas
 */
export type ReconciliationRunStatus = 'conciliado' | 'pendiente' | 'desconciliado';

/** Conciliación (corrida) de una empresa, un restaurante y un periodo: POS contra banco. */
export interface ReconciliationRun {
  id: string; // id del backend en texto: va en la URL (/conciliacion/:runId)
  code: string; // código que muestra el portal: 'CON-0011'
  createdAt: string; // ISO con hora (o 'yyyy-MM-dd') — "Fecha" de la tabla: cuándo se creó la conciliación
  companyName: string; // Empresa (subsidiaria)
  storeName: string; // Restaurante (tienda / ubicación)
  periodStart: string; // 'yyyy-MM-dd'
  periodEnd: string; // 'yyyy-MM-dd'
  status: ReconciliationRunStatus;
  comments: string; // Comentarios de la tabla ('' = sin comentarios)
  salesCount: number; // ventas que abarca la conciliación
}

/** Datos del modal "Nueva conciliación" (`POST /reconciliations`); la empresa la deduce el backend de la tienda. */
export interface NewReconciliationRunInput {
  storeId: number;
  periodStart: string; // 'yyyy-MM-dd'
  periodEnd: string; // 'yyyy-MM-dd'
}
