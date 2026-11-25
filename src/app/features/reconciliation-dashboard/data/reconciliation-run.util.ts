import { toIsoDate } from '../../../shared/utils/iso-date.util';
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

/** Día local de creación (`yyyy-MM-dd`); `createdAt` llega como instante ISO o ya como día. */
export function createdDay(run: ReconciliationRun): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(run.createdAt) ? run.createdAt : toIsoDate(new Date(run.createdAt));
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
  const header = ['Fecha de creación', 'Empresa', 'Restaurante', 'Periodo inicio', 'Periodo fin', 'Estatus', 'Ventas'];
  const row = [
    createdDay(run),
    run.companyName,
    run.storeName,
    run.periodStart,
    run.periodEnd,
    RECONCILIATION_RUN_STATUS_LABEL[run.status],
    String(run.salesCount),
  ];
  return [header, row].map((cells) => cells.map(escapeCsv).join(',')).join('\n');
}
