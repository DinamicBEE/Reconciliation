import { SaleTransaction, SettlementTransaction, TenderMedia } from '../models/reconciliation-item.model';
import { Sale } from '../models/sale.model';
// Fuente de verdad: el mismo mock de ventas que consume `sales-dashboard`
// ("Resumen de venta") — la base de TODO lo que se concilia es el sistema
// POS, no un dataset paralelo inventado para este feature (así era antes:
// `MOCK_SALES`/`MOCK_SETTLEMENTS` traían sus propios `ORD-*` sin relación
// real con las ventas que se ven en `/dashboard`, con fechas/montos que no
// cuadraban entre pantallas). Import cruzado de feature (sales-dashboard)
// hacia shared/ — única excepción documentada a la regla dura de
// "Estructura de carpetas" (shared nunca importa de features): mover el
// mock de ventas completo a shared/ habría tocado archivos que otra sesión
// tenía en vuelo al escribir esto; queda pendiente como limpieza futura
// (ver MASTER.md, "Patrón: conciliación por tender media y fecha").
import { MOCK_SALES as POS_SALES } from '../../features/sales-dashboard/data/sales-mock.data';
import { saleTotal } from '../../features/sales-dashboard/data/sale.util';

// Dataset compartido por todo lo que cruza venta vs. liquidación por
// orderId — "Conciliación" (totales agrupados por tender media/fecha) y
// "Gestión de diferencias" (candidatos de match manual para una orden
// puntual). Promovido desde tender-detail/data al aparecer un segundo
// consumidor, mismo criterio que _summary-strip.scss (ver MASTER.md).
// Reemplazar por llamadas HTTP reales cuando exista backend — el cruce por
// orderId lo hace `shared/utils/cross-match.util.ts`, no este archivo.

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupByTenderMedia<T extends { tenderMedia: TenderMedia }>(rows: T[]): Record<TenderMedia, T[]> {
  const groups: Record<TenderMedia, T[]> = { bbva: [], rappi: [], efectivo: [], didi_food: [] };
  for (const row of rows) groups[row.tenderMedia].push(row);
  return groups;
}

// `sale.reference` (folio del pago/liquidación tal como lo conoce el POS —
// "SPEI0000129981", "RAPPI-LIQ-901", "DIDI-041", "CORTE-0827-01") hace de
// `orderId`: es la MISMA referencia que ya se ve en la columna "Referencia"
// de `sales-dashboard` — usar un id distinto aquí (como el viejo `ORD-B001`)
// era precisamente lo que rompía la trazabilidad entre las dos pantallas.
function toSaleTransaction(sale: Sale): SaleTransaction {
  return {
    id: sale.id,
    date: sale.date,
    orderId: sale.reference,
    tenderMedia: sale.tenderMedia,
    amount: round2(saleTotal(sale)),
  };
}

export const MOCK_SALES: Record<TenderMedia, SaleTransaction[]> = groupByTenderMedia(POS_SALES.map(toSaleTransaction));

// --- Lado banco: se deriva de `sale.reconciliationStatus` — el MISMO campo
// que ya pinta la columna "Estado de conciliación" en sales-dashboard, así
// que una venta "Cruzado" ahí SIEMPRE trae su liquidación aquí, y una
// "Por liquidar" ahí NUNCA la trae. Ninguna venta se excluye por estar
// `cancelada` (V-2005 es la única `amount_mismatch` de todo el mock y está
// cancelada — excluirla habría dejado el estado "Monto distinto" sin ni un
// solo caso de demostración, y de paso habría desalineado esta tabla de lo
// que sales-dashboard ya le muestra al usuario para esa misma fila).
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

// Una orden liquidada por debajo de lo vendido — 12% corto, determinístico
// (no un delta hardcodeado por venta), así sigue siendo válido si el total
// de la venta cambia (descuento/IVA/propina) sin volver a ajustar esto a
// mano.
const MISMATCH_RATIO = 0.88;

// Ratios del abono partido de V-2007 (ver abajo) — suman 1, el último se
// calcula por resta (no por su propio ratio) para que la suma cuadre exacto
// contra el total real de la venta sin arrastrar el redondeo de los otros
// dos.
const SPLIT_RATIOS: readonly number[] = [0.5, 0.3];

// V-2007 ("pago mixto", ver sales-mock.data.ts) es la única venta que se
// liquida en más de un depósito — un caso real y frecuente (SPEI puede
// llegar por abonos), y de paso deja al menos 3 transacciones bancarias
// bajo un mismo día+medio de pago para poder demostrar el modal "Ver
// detalles" con más de una fila (ver MASTER.md).
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

// Liquidaciones huérfanas — el banco depositó algo sin una venta que lo
// respalde en el POS (anomalía real: duplicado, comisión mal aplicada, o
// una venta que nunca se capturó). Fechadas el 16 y el 23 de agosto a
// propósito: son los DOS únicos días del rango de `sales-dashboard` sin
// ninguna venta generada (`buildDay` en sales-mock.data.ts salta esas dos
// fechas), así el grupo que producen es un "Sin venta" limpio — puesto en
// cualquier otro día habría caído sobre un grupo que YA tenía sus propias
// ventas de ese medio, mezclando dos anomalías distintas (una venta sin
// liquidar + un depósito sin orden) en una sola fila "Monto distinto"
// confusa de leer. Referencias que nunca coinciden con un `sale.reference`
// real.
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

const derivedSettlements: SettlementTransaction[] = POS_SALES.flatMap((sale) => {
  const saleTx = toSaleTransaction(sale);
  return settlementsForSale(sale, saleTx);
});

export const MOCK_SETTLEMENTS: Record<TenderMedia, SettlementTransaction[]> = groupByTenderMedia([
  ...derivedSettlements,
  ...ORPHAN_SETTLEMENTS,
]);
