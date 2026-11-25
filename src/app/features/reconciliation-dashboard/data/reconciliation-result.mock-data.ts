import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { MatchStatus, TENDER_MEDIA_LABEL, TenderMedia, TransactionMatch } from '../../../shared/models/reconciliation-item.model';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import { bankTotal } from './reconciliation-result.util';
import {
  ReconciliationBankMovement,
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

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function statusFor(pos: number | null, bank: number): ReconciliationResultStatus {
  if (pos === null || bank === 0) return 'sin_coincidencia';
  return pos === bank ? 'coincide' : 'diferencia';
}

function commentFor(status: ReconciliationResultStatus, hasPos: boolean, movements: number, difference: number): string {
  if (status === 'coincide') {
    return movements > 1
      ? `Coincide: ${movements} movimientos del banco suman el monto del POS.`
      : 'Coincide sin diferencias entre el POS y el banco.';
  }
  if (status === 'diferencia') {
    return `El banco abonó ${movements} movimiento(s) por un monto distinto al del POS (diferencia de ${difference.toFixed(2)}).`;
  }
  return hasPos ? 'Venta registrada en el POS sin movimiento en el banco.' : 'Movimiento del banco sin venta registrada en el POS.';
}

// Ventas que el banco abona en varios movimientos (1 a muchos): `shares` reparte lo abonado y
// `settled` es la fracción del POS que llega al banco (1 = completo, menos = falta, más = sobra).
interface SplitPlan {
  shares: number[];
  settled: number;
}

const ONE_TO_MANY: Record<string, SplitPlan> = {
  'CORTE-0827-01': { shares: [0.6, 0.4], settled: 1 },
  'CORTE-0827-02': { shares: [0.3, 0.25, 0.2, 0.15, 0.1], settled: 0.88 },
  'RAPPI-LIQ-901': { shares: [0.35, 0.25, 0.2, 0.12, 0.08], settled: 0.835 },
  SPEI0000129981: { shares: [0.5, 0.3, 0.2], settled: 1 },
  SPEI0000129990: { shares: [0.65, 0.35], settled: 1 },
  'CORTE-202608260': { shares: [0.5, 0.5], settled: 1 },
  'CORTE-202608264': { shares: [0.4, 0.3, 0.2, 0.1], settled: 1 },
  'DIDI-202608261': { shares: [0.55, 0.45], settled: 1 },
};

function splitMovements(match: TransactionMatch, plan: SplitPlan): ReconciliationBankMovement[] {
  const total = round(match.sale!.amount * plan.settled, 2);
  const method = TENDER_MEDIA_LABEL[match.tenderMedia];
  let assigned = 0;
  return plan.shares.map((share, index) => {
    const last = index === plan.shares.length - 1;
    const amount = last ? round(total - assigned, 2) : round(total * share, 2);
    assigned = round(assigned + amount, 2);
    return {
      id: `${match.orderId}-M${index + 1}`,
      date: addDays(match.date, index === 0 ? 0 : 1),
      reference: `${match.orderId}-${index + 1}`,
      amount,
      concept: `Abono ${index + 1} de ${plan.shares.length} — ${match.orderId}`,
      paymentMethod: method,
    };
  });
}

// Movimientos sin asignar que el back sugiere al ajustar una línea por gestionar: primero las
// liquidaciones sueltas del medio más cercanas al monto y, si faltan, depósitos sintéticos.
const CANDIDATES_PER_ROW = 5;
const COVERED_ORDER_IDS = new Set(
  TENDER_MEDIA.flatMap((media) => crossMatchTransactions(MOCK_SALES[media], MOCK_SETTLEMENTS[media]))
    .filter((match) => match.status === 'matched')
    .map((match) => match.orderId),
);

function suggestedMovements(match: TransactionMatch, assigned: ReconciliationBankMovement[]): ReconciliationBankMovement[] {
  const method = TENDER_MEDIA_LABEL[match.tenderMedia];
  const target = match.sale?.amount ?? match.settlement?.amount ?? 0;
  const taken = new Set(assigned.map((movement) => movement.id));
  const real = MOCK_SETTLEMENTS[match.tenderMedia]
    .filter((s) => s.orderId !== match.orderId && !COVERED_ORDER_IDS.has(s.orderId) && !taken.has(s.id))
    .sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target))
    .slice(0, CANDIDATES_PER_ROW)
    .map((s) => ({ id: s.id, date: s.date, reference: s.orderId, amount: s.amount, concept: s.description, paymentMethod: method }));
  const synthetic = Array.from({ length: CANDIDATES_PER_ROW - real.length }, (_, index) => ({
    id: `${match.orderId}-C${index + 1}`,
    date: addDays(match.date, index + 1),
    reference: `DEP-${match.orderId}-${index + 1}`,
    amount: round(target * (0.15 + index * 0.17), 2),
    concept: 'Depósito sin conciliar',
    paymentMethod: method,
  }));
  return [...real, ...synthetic];
}

function toRow(match: TransactionMatch): ReconciliationResultRow {
  const method = TENDER_MEDIA_LABEL[match.tenderMedia];
  const pos: ReconciliationLineSide | null = match.sale
    ? { reference: match.sale.orderId, amount: match.sale.amount, concept: `Venta ${match.sale.id}`, paymentMethod: method }
    : null;
  const plan = ONE_TO_MANY[match.orderId];
  // Monto liquidado total de la orden (puede venir en más de un depósito).
  const bank: ReconciliationBankMovement[] =
    plan && match.sale
      ? splitMovements(match, plan)
      : match.settlement
        ? [
            {
              id: match.settlement.id,
              date: match.settlement.date,
              reference: match.settlement.orderId,
              amount: round((match.sale?.amount ?? 0) - match.difference, 2),
              concept: match.settlement.description,
              paymentMethod: method,
            },
          ]
        : [];
  const bankAmount = bankTotal(bank);
  const status = plan ? statusFor(pos?.amount ?? null, bankAmount) : STATUS[match.status];
  const difference = round((pos?.amount ?? 0) - bankAmount, 2);
  return {
    id: `${match.tenderMedia}:${match.orderId}`,
    date: match.date,
    reference: match.orderId,
    tenderMedia: match.tenderMedia,
    channel: method,
    pos,
    bank,
    candidates: status === 'coincide' ? [] : suggestedMovements(match, bank),
    difference,
    comment: commentFor(status, pos !== null, bank.length, difference),
    status,
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
  totals: { pos: sum(ROWS.map((row) => row.pos?.amount ?? 0)), bank: sum(ROWS.map((row) => bankTotal(row.bank))) },
  kpis: {
    coincidencias: kpi(ROWS, 'coincide'),
    diferencias: kpi(ROWS, 'diferencia'),
    sinCoincidencias: kpi(ROWS, 'sin_coincidencia'),
  },
  rows: ROWS,
};
