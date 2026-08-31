import { TenderMediaStatus } from '../models/reconciliation-item.model';

// Salud de conciliación por medio de pago — usado en el KPI "Medios de pago"
// de reconciliation-dashboard (display puro, sin navegación). Vivió antes en
// reconciliation-dashboard/data; se promovió a shared cuando existió un
// segundo consumidor (el selector de "Detalle por tender media", retirado —
// ver MASTER.md) y se quedó aquí aunque ese consumidor ya no exista, por si
// aparece otro.
export const MOCK_TENDER_MEDIA_STATUS: TenderMediaStatus[] = [
  { tenderMedia: 'bbva', health: 'up_to_date', lastReconciledAt: '2026-08-26T07:30:00', daysBehind: 0 },
  { tenderMedia: 'rappi', health: 'up_to_date', lastReconciledAt: '2026-08-26T09:00:00', daysBehind: 0 },
  { tenderMedia: 'efectivo', health: 'delayed', lastReconciledAt: '2026-08-24T18:00:00', daysBehind: 2 },
  { tenderMedia: 'didi_food', health: 'delayed', lastReconciledAt: '2026-08-22T20:00:00', daysBehind: 4 },
];
