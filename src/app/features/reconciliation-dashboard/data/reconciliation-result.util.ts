import { SettlementTransaction, TENDER_MEDIA_LABEL, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { ReconciliationBankMovement, ReconciliationResultRow, ReconciliationResultStatus } from './reconciliation-result.model';

/** Etiqueta visible de cada {@link ReconciliationResultStatus}. */
export const RECONCILIATION_RESULT_STATUS_LABEL: Record<ReconciliationResultStatus, string> = {
  coincide: 'Coincide',
  diferencia: 'Diferencia',
  sin_coincidencia: 'Sin coincidencia',
};

/** Suma de los movimientos del banco, a 2 decimales. */
export function bankTotal(movements: readonly ReconciliationBankMovement[]): number {
  return Math.round(movements.reduce((sum, movement) => sum + movement.amount, 0) * 100) / 100;
}

/** Convierte una liquidación candidata en el movimiento del banco que se le abona a la venta. */
export function movementFromSettlement(settlement: SettlementTransaction): ReconciliationBankMovement {
  return {
    id: settlement.id,
    date: settlement.date,
    reference: settlement.orderId,
    amount: settlement.amount,
    concept: settlement.description,
    paymentMethod: TENDER_MEDIA_LABEL[settlement.tenderMedia],
  };
}

/** Convierte un movimiento del banco en la liquidación candidata que lo representa al ajustar. */
export function settlementFromMovement(movement: ReconciliationBankMovement, tenderMedia: TenderMedia): SettlementTransaction {
  return {
    id: movement.id,
    date: movement.date,
    orderId: movement.reference,
    tenderMedia,
    amount: movement.amount,
    batchId: `LOTE-${movement.reference}`,
    description: movement.concept,
  };
}

/** Lo que el usuario cambió de una línea en la sesión: movimientos elegidos al ajustar y su nota. */
export interface ResultCsvAdjustment {
  movements: readonly ReconciliationBankMovement[] | null;
  note: string;
}

function escapeCsv(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Arma el CSV de "Descargar" de la tabla de resultados, una fila por línea en el orden mostrado.
 *
 * @remarks Montos sin formato de moneda (sumables en Excel); con `adjustments`, el banco y las notas reflejan lo ajustado.
 */
export function buildResultCsv(
  rows: readonly ReconciliationResultRow[],
  adjustments: ReadonlyMap<string, ResultCsvAdjustment> = new Map(),
): string {
  const header = ['Fecha', 'Referencia', 'Medio de pago', 'POS', 'Banco', 'Movimientos banco', 'Estado', 'Notas'];
  const body = rows.map((row) => {
    const adjustment = adjustments.get(row.id);
    const movements = adjustment?.movements ?? row.bank;
    return [
      row.date,
      row.reference,
      row.channel,
      row.pos ? row.pos.amount.toFixed(2) : '',
      movements.length > 0 ? bankTotal(movements).toFixed(2) : '',
      String(movements.length),
      RECONCILIATION_RESULT_STATUS_LABEL[row.status],
      adjustment?.note ?? '',
    ];
  });
  return [header, ...body].map((cells) => cells.map(escapeCsv).join(',')).join('\n');
}
