import { TrendPoint } from '../../../shared/models/reconciliation-item.model';

/** Serie ilustrativa de 7 días del porcentaje conciliado (KPI). */
export const MOCK_RECONCILED_PCT_TREND: TrendPoint[] = [
  { date: '2026-08-20', value: 78 },
  { date: '2026-08-21', value: 80 },
  { date: '2026-08-22', value: 75 },
  { date: '2026-08-23', value: 82 },
  { date: '2026-08-24', value: 85 },
  { date: '2026-08-25', value: 79 },
  { date: '2026-08-26', value: 84 },
];

/** Serie ilustrativa de 7 días del monto en diferencias (KPI). */
export const MOCK_DISCREPANCY_AMOUNT_TREND: TrendPoint[] = [
  { date: '2026-08-20', value: 650 },
  { date: '2026-08-21', value: 920 },
  { date: '2026-08-22', value: 480 },
  { date: '2026-08-23', value: 1100 },
  { date: '2026-08-24', value: 700 },
  { date: '2026-08-25', value: 850 },
  { date: '2026-08-26', value: 790 },
];
