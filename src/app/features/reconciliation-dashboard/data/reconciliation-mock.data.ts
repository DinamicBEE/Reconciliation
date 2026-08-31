import { TrendPoint } from '../../../shared/models/reconciliation-item.model';

// Series de 7 días para las gráficas de los KPI — mock ilustrativo. La tabla
// de movimientos ya no vive aquí: se unificó con el cruce venta vs.
// liquidación de `shared/mock-data/sales-settlements.mock-data.ts` (ver
// `reconciliation.service.ts` y MASTER.md, "Patrón: cruce transacción a
// transacción entre dos fuentes").
export const MOCK_RECONCILED_PCT_TREND: TrendPoint[] = [
  { date: '2026-08-20', value: 78 },
  { date: '2026-08-21', value: 80 },
  { date: '2026-08-22', value: 75 },
  { date: '2026-08-23', value: 82 },
  { date: '2026-08-24', value: 85 },
  { date: '2026-08-25', value: 79 },
  { date: '2026-08-26', value: 84 },
];

export const MOCK_DISCREPANCY_AMOUNT_TREND: TrendPoint[] = [
  { date: '2026-08-20', value: 650 },
  { date: '2026-08-21', value: 920 },
  { date: '2026-08-22', value: 480 },
  { date: '2026-08-23', value: 1100 },
  { date: '2026-08-24', value: 700 },
  { date: '2026-08-25', value: 850 },
  { date: '2026-08-26', value: 790 },
];
