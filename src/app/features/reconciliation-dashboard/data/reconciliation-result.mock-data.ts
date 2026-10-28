import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { MatchStatus, TENDER_MEDIA_LABEL, TenderMedia, TransactionMatch } from '../../../shared/models/reconciliation-item.model';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import {
  ReconciliationLineSide,
  ReconciliationResult,
  ReconciliationResultKpi,
  ReconciliationResultRow,
  ReconciliationResultStatus,
} from './reconciliation-result.model';

// Respuesta simulada del backend, armada con las mismas ventas y liquidaciones mock de la app.
// Ver docs/codigo/conciliacion.md#envio-y-resultado

const TENDER_MEDIA: TenderMedia[] = ['bbva', 'rappi', 'efectivo', 'didi_food'];

const STATUS: Record<MatchStatus, ReconciliationResultStatus> = {
  matched: 'coincide',
  amount_mismatch: 'diferencia',
  sale_only: 'sin_coincidencia',
  settlement_only: 'sin_coincidencia',
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sum(values: number[]): number {
  return round(values.reduce((acc, value) => acc + value, 0), 2);
}

function comment(match: TransactionMatch): string {
  switch (match.status) {
    case 'matched':
      return 'Coincide sin diferencias entre el POS y el banco.';
    case 'amount_mismatch':
      return `El banco liquidó un monto distinto al del POS (diferencia de ${round(match.difference, 2).toFixed(2)}).`;
    case 'sale_only':
      return 'Venta registrada en el POS sin movimiento en el banco.';
    default:
      return 'Movimiento del banco sin venta registrada en el POS.';
  }
}

function toRow(match: TransactionMatch): ReconciliationResultRow {
  const method = TENDER_MEDIA_LABEL[match.tenderMedia];
  const pos: ReconciliationLineSide | null = match.sale
    ? { reference: match.sale.orderId, amount: match.sale.amount, concept: `Venta ${match.sale.id}`, paymentMethod: method }
    : null;
  // Monto liquidado total de la orden (puede venir en más de un depósito).
  const bank: ReconciliationLineSide | null = match.settlement
    ? {
        reference: match.settlement.orderId,
        amount: round((match.sale?.amount ?? 0) - match.difference, 2),
        concept: match.settlement.description,
        paymentMethod: method,
      }
    : null;
  return {
    id: `${match.tenderMedia}:${match.orderId}`,
    date: match.date,
    reference: match.orderId,
    tenderMedia: match.tenderMedia,
    pos,
    bank,
    difference: round(match.difference, 2),
    comment: comment(match),
    status: STATUS[match.status],
  };
}

function kpi(rows: ReconciliationResultRow[], status: ReconciliationResultStatus): ReconciliationResultKpi {
  const count = rows.filter((row) => row.status === status).length;
  return { count, percentage: rows.length === 0 ? 0 : round((count / rows.length) * 100, 1) };
}

// Las 10 líneas por gestionar que devuelve el back; las demás diferencias del mock se descartan.
const TO_MANAGE = new Set([
  'CORTE-0827-02',
  'DIDI-041',
  'RAPPI-LIQ-901',
  'RAPPI-LIQ-902',
  'RAPPI-LIQ-202608263',
  'RAPPI-LIQ-202608254',
  'RAPPI-LIQ-202608245',
  'DIDI-099',
  'RAPPI-LIQ-950',
  'RAPPI-LIQ-951',
]);

const ROWS: ReconciliationResultRow[] = TENDER_MEDIA.flatMap((tenderMedia) =>
  crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]),
)
  .map(toRow)
  .filter((row) => row.status === 'coincide' || TO_MANAGE.has(row.reference))
  .sort((a, b) => b.date.localeCompare(a.date) || a.reference.localeCompare(b.reference));

/**
 * Resultado simulado: el cruce por orden de los 4 medios, de la fecha más reciente a la más antigua.
 *
 * @see docs/codigo/conciliacion.md#envio-y-resultado
 */
export const MOCK_RECONCILIATION_RESULT: ReconciliationResult = {
  total: ROWS.length,
  totals: { pos: sum(ROWS.map((row) => row.pos?.amount ?? 0)), bank: sum(ROWS.map((row) => row.bank?.amount ?? 0)) },
  kpis: {
    coincidencias: kpi(ROWS, 'coincide'),
    diferencias: kpi(ROWS, 'diferencia'),
    sinCoincidencias: kpi(ROWS, 'sin_coincidencia'),
  },
  rows: ROWS,
};
