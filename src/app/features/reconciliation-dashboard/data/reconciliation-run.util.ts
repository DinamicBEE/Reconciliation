import { ReconciliationRun, ReconciliationRunStatus } from './reconciliation-run.model';

/** Etiqueta visible de cada {@link ReconciliationRunStatus}. */
export const RECONCILIATION_RUN_STATUS_LABEL: Record<ReconciliationRunStatus, string> = {
  conciliado: 'Conciliado',
  pendiente: 'Pendiente',
  desconciliado: 'Desconciliado',
};

/** Indica si la fila ofrece "Desconciliar": solo una corrida `conciliado`. */
export function canDesconciliar(run: ReconciliationRun): boolean {
  return run.status === 'conciliado';
}

/** Indica si la fila ofrece "Descargar": la corrida terminó, haya cuadrado o no. */
export function canDownload(run: ReconciliationRun): boolean {
  return run.status !== 'pendiente';
}

function escapeCsv(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Arma el CSV de "Descargar" de una corrida: encabezado y una fila con sus datos generales.
 *
 * @see docs/codigo/conciliacion.md#corridas
 */
export function buildRunCsv(run: ReconciliationRun): string {
  const header = ['Fecha de creación', 'Empresa', 'Restaurante', 'Periodo inicio', 'Periodo fin', 'Estatus'];
  const row = [
    run.createdAt,
    run.companyName,
    run.storeName,
    run.periodStart,
    run.periodEnd,
    RECONCILIATION_RUN_STATUS_LABEL[run.status],
  ];
  return [header, row].map((cells) => cells.map(escapeCsv).join(',')).join('\n');
}
