import { SaleTransaction, SettlementTransaction, TenderMedia } from '../models/reconciliation-item.model';
import { Sale } from '../models/sale.model';
// Excepción documentada a "shared no importa de features": la fuente es el mock del POS.
// Ver docs/codigo/ventas.md#liquidaciones-mock.
import { MOCK_SALES as POS_SALES } from '../../features/sales-dashboard/data/sales-mock.data';
import { saleTotal } from '../../features/sales-dashboard/data/sale.util';

// Ventas y liquidaciones mock por medio de pago; el cruce por `orderId` lo hace
// `shared/utils/cross-match.util.ts`.

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupByTenderMedia<T extends { tenderMedia: TenderMedia }>(rows: T[]): Record<TenderMedia, T[]> {
  const groups: Record<TenderMedia, T[]> = { bbva: [], rappi: [], efectivo: [], didi_food: [] };
  for (const row of rows) groups[row.tenderMedia].push(row);
  return groups;
}

// `orderId` = `sale.reference`, la referencia visible en "Resumen de venta" (trazabilidad).
function toSaleTransaction(sale: Sale): SaleTransaction {
  return {
    id: sale.id,
    date: sale.date,
    orderId: sale.reference,
    tenderMedia: sale.tenderMedia,
    amount: round2(saleTotal(sale)),
  };
}

/**
 * Lado venta del cruce: las ventas mock de "Resumen de venta" agrupadas por medio de pago.
 *
 * @see docs/codigo/ventas.md#liquidaciones-mock
 */
export const MOCK_SALES: Record<TenderMedia, SaleTransaction[]> = groupByTenderMedia(POS_SALES.map(toSaleTransaction));

// --- Lado banco: derivado de `sale.reconciliationStatus`; no excluye canceladas ---
const BATCH_PREFIX: Record<TenderMedia, string> = {
  bbva: 'LOTE-BBVA',
  rappi: 'RAPPI-LIQ',
  efectivo: 'CORTE',
  didi_food: 'DIDI',
};

const SETTLEMENT_LABEL: Record<TenderMedia, string> = {
  bbva: 'Liquidación SPEI',
  rappi: 'Liquidación Rappi',
  efectivo: 'Corte de caja',
  didi_food: 'Liquidación DiDi Food',
};

function batchIdFor(tenderMedia: TenderMedia, date: string): string {
  return `${BATCH_PREFIX[tenderMedia]}-${date.replace(/-/g, '')}`;
}

function descriptionFor(tenderMedia: TenderMedia, batchId: string): string {
  return `${SETTLEMENT_LABEL[tenderMedia]} — Lote ${batchId}`;
}

// `amount_mismatch`: liquida el 88 % del total, como proporción para seguir válido si el total cambia.
const MISMATCH_RATIO = 0.88;

// Abonos de V-2007; el último se calcula por resta para que la suma cuadre exacta.
const SPLIT_RATIOS: readonly number[] = [0.5, 0.3];

// Única venta liquidada en varios depósitos (SPEI por abonos); da filas a "Ver detalles".
const SPLIT_SETTLEMENT_SALE_ID = 'V-2007';

function settlementsForSale(sale: Sale, saleTx: SaleTransaction): SettlementTransaction[] {
  if (sale.reconciliationStatus === 'sale_only') return [];

  const batchId = batchIdFor(sale.tenderMedia, sale.date);
  const description = descriptionFor(sale.tenderMedia, batchId);

  if (sale.reconciliationStatus === 'amount_mismatch') {
    return [
      {
        id: `L-${sale.id}`,
        date: sale.date,
        orderId: saleTx.orderId,
        tenderMedia: sale.tenderMedia,
        amount: round2(saleTx.amount * MISMATCH_RATIO),
        batchId,
        description,
      },
    ];
  }

  // 'matched' a partir de aquí.
  if (sale.id === SPLIT_SETTLEMENT_SALE_ID) {
    const parts = SPLIT_RATIOS.map((ratio) => round2(saleTx.amount * ratio));
    const lastPart = round2(saleTx.amount - parts.reduce((sum, p) => sum + p, 0));
    return [...parts, lastPart].map((amount, i) => ({
      id: `L-${sale.id}-${i + 1}`,
      date: sale.date,
      orderId: saleTx.orderId,
      tenderMedia: sale.tenderMedia,
      amount,
      batchId,
      description: `${description} — abono ${i + 1}/${parts.length + 1}`,
    }));
  }

  return [
    {
      id: `L-${sale.id}`,
      date: sale.date,
      orderId: saleTx.orderId,
      tenderMedia: sale.tenderMedia,
      amount: saleTx.amount,
      batchId,
      description,
    },
  ];
}

// Depósitos sin venta, el 16 y 23 de agosto (únicos días sin ventas) para dar un
// grupo "Sin venta" limpio. Ver docs/codigo/ventas.md#liquidaciones-mock.
const ORPHAN_SETTLEMENTS: SettlementTransaction[] = [
  {
    id: 'L-ORPHAN-BBVA-01',
    date: '2026-08-16',
    orderId: 'SPEI0000199999',
    tenderMedia: 'bbva',
    amount: 2980,
    batchId: batchIdFor('bbva', '2026-08-16'),
    description: 'Transferencia SPEI recibida — folio sin identificar',
  },
  {
    id: 'L-ORPHAN-RAPPI-01',
    date: '2026-08-23',
    orderId: 'RAPPI-LIQ-999',
    tenderMedia: 'rappi',
    amount: 270,
    batchId: batchIdFor('rappi', '2026-08-23'),
    description: 'Liquidación Rappi sin folio de orden',
  },
  {
    id: 'L-ORPHAN-EFECTIVO-01',
    date: '2026-08-16',
    orderId: 'CORTE-0816-099',
    tenderMedia: 'efectivo',
    amount: 975,
    batchId: batchIdFor('efectivo', '2026-08-16'),
    description: 'Depósito en ventanilla sin referencia',
  },
  {
    id: 'L-ORPHAN-DIDI-01',
    date: '2026-08-23',
    orderId: 'DIDI-099',
    tenderMedia: 'didi_food',
    amount: 298,
    batchId: batchIdFor('didi_food', '2026-08-23'),
    description: 'Liquidación DiDi Food sin folio de orden',
  },
];

// Con `L-ORPHAN-RAPPI-01` suman 15 candidatas sueltas de Rappi el 23 de agosto
// para la demo de "Gestión de diferencias"; montos determinísticos.
const LOOSE_RAPPI_COUNT = 14;

function buildLooseRappiSettlements(count: number): SettlementTransaction[] {
  const date = '2026-08-23';
  const batchId = batchIdFor('rappi', date);
  return Array.from({ length: count }, (_, i) => ({
    id: `L-ORPHAN-RAPPI-${String(i + 2).padStart(2, '0')}`,
    date,
    orderId: `RAPPI-LIQ-9${50 + i}`,
    tenderMedia: 'rappi' as const,
    amount: round2(320 + i * 67.5),
    batchId,
    description: `Liquidación Rappi sin folio de orden — depósito ${i + 2}/${count + 1}`,
  }));
}

const LOOSE_RAPPI_SETTLEMENTS = buildLooseRappiSettlements(LOOSE_RAPPI_COUNT);

const derivedSettlements: SettlementTransaction[] = POS_SALES.flatMap((sale) => {
  const saleTx = toSaleTransaction(sale);
  return settlementsForSale(sale, saleTx);
});

/**
 * Lado banco del cruce: liquidaciones derivadas de las ventas más depósitos sin venta.
 *
 * @see docs/codigo/ventas.md#liquidaciones-mock
 */
export const MOCK_SETTLEMENTS: Record<TenderMedia, SettlementTransaction[]> = groupByTenderMedia([
  ...derivedSettlements,
  ...ORPHAN_SETTLEMENTS,
  ...LOOSE_RAPPI_SETTLEMENTS,
]);
