import { TENDER_MEDIA_LABEL } from '../../../shared/models/reconciliation-item.model';
import { ReconciliationResultRow, ReconciliationResultStatus } from './reconciliation-result.model';

/** Etiqueta visible de cada {@link ReconciliationResultStatus}. */
export const RECONCILIATION_RESULT_STATUS_LABEL: Record<ReconciliationResultStatus, string> = {
  coincide: 'Coincide',
  diferencia: 'Diferencia',
  sin_coincidencia: 'Sin coincidencia',
};

function escapeCsv(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Arma el CSV de "Descargar" de la tabla de resultados, una fila por línea en el orden mostrado.
 *
 * @remarks Montos sin formato de moneda (sumables en Excel); vacío si la línea no existe de ese lado.
 */
export function buildResultCsv(rows: readonly ReconciliationResultRow[]): string {
  const header = ['Fecha', 'Referencia', 'Medio de pago', 'POS', 'Banco', 'Estado'];
  const body = rows.map((row) => [
    row.date,
    row.reference,
    TENDER_MEDIA_LABEL[row.tenderMedia],
    row.pos ? row.pos.amount.toFixed(2) : '',
    row.bank ? row.bank.amount.toFixed(2) : '',
    RECONCILIATION_RESULT_STATUS_LABEL[row.status],
  ]);
  return [header, ...body].map((cells) => cells.map(escapeCsv).join(',')).join('\n');
}
