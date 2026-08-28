import {
  ReconciliationItem,
  TenderMediaStatus,
  TrendPoint,
} from '../../../shared/models/reconciliation-item.model';

// Datos de ejemplo — reemplazar por llamadas HTTP reales cuando exista el
// backend de conciliación (ver ReconciliationService).
export const MOCK_RECONCILIATION_ITEMS: ReconciliationItem[] = [
  // BBVA
  {
    id: 'MOV-1001',
    date: '2026-08-26',
    description: 'Transferencia SPEI recibida - Cliente Acme SA',
    account: 'BBVA •••• 4471',
    reference: 'SPEI0000123456',
    tenderMedia: 'bbva',
    bankAmount: 152340.0,
    bookAmount: 152340.0,
    status: 'matched',
  },
  {
    id: 'MOV-1002',
    date: '2026-08-23',
    description: 'Pago proveedor - Suministros del Norte',
    account: 'BBVA •••• 4471',
    reference: 'SPEI0000123499',
    tenderMedia: 'bbva',
    bankAmount: -48210.5,
    bookAmount: -48210.5,
    status: 'matched',
  },
  {
    id: 'MOV-1003',
    date: '2026-08-25',
    description: 'Comisión por manejo de cuenta',
    account: 'BBVA •••• 4471',
    reference: 'COM-08-2026',
    tenderMedia: 'bbva',
    bankAmount: -320.0,
    bookAmount: -280.0,
    status: 'discrepancy',
  },
  {
    id: 'MOV-1004',
    date: '2026-08-24',
    description: 'Depósito en ventanilla - Sucursal Polanco',
    account: 'BBVA •••• 4471',
    reference: 'DEP-778812',
    tenderMedia: 'bbva',
    bankAmount: 9800.0,
    bookAmount: 9800.0,
    status: 'matched',
  },

  // Rappi
  {
    id: 'RAP-2201',
    date: '2026-08-26',
    description: 'Liquidación pedidos Rappi - Lote 886',
    account: 'Rappi Merchant',
    reference: 'RAPPI-886',
    tenderMedia: 'rappi',
    bankAmount: 41250.0,
    bookAmount: 0,
    status: 'pending',
  },
  {
    id: 'RAP-2200',
    date: '2026-08-25',
    description: 'Liquidación pedidos Rappi - Lote 885',
    account: 'Rappi Merchant',
    reference: 'RAPPI-885',
    tenderMedia: 'rappi',
    bankAmount: 38900.0,
    bookAmount: 38900.0,
    status: 'matched',
  },
  {
    id: 'RAP-2199',
    date: '2026-08-24',
    description: 'Liquidación pedidos Rappi - Lote 884',
    account: 'Rappi Merchant',
    reference: 'RAPPI-884',
    tenderMedia: 'rappi',
    bankAmount: 45230.0,
    bookAmount: 45230.0,
    status: 'matched',
  },

  // DiDi Food
  {
    id: 'DID-3390',
    date: '2026-08-23',
    description: 'Liquidación DiDi Food - Semana 34',
    account: 'DiDi Food Merchant',
    reference: 'DIDI-034',
    tenderMedia: 'didi_food',
    bankAmount: 27650.0,
    bookAmount: 26900.0,
    status: 'discrepancy',
  },
  {
    id: 'DID-3388',
    date: '2026-08-22',
    description: 'Liquidación DiDi Food - Semana 33',
    account: 'DiDi Food Merchant',
    reference: 'DIDI-033',
    tenderMedia: 'didi_food',
    bankAmount: 31200.0,
    bookAmount: 0,
    status: 'pending',
  },

  // Efectivo
  {
    id: 'EFE-0912',
    date: '2026-08-24',
    description: 'Corte de caja - Sucursal Polanco',
    account: 'Caja Efectivo',
    reference: 'CORTE-0824',
    tenderMedia: 'efectivo',
    bankAmount: 18420.0,
    bookAmount: 18420.0,
    status: 'matched',
  },
  {
    id: 'EFE-0913',
    date: '2026-08-25',
    description: 'Corte de caja - Sucursal Condesa',
    account: 'Caja Efectivo',
    reference: 'CORTE-0825',
    tenderMedia: 'efectivo',
    bankAmount: 15600.0,
    bookAmount: 0,
    status: 'pending',
  },
];

// Estado por medio de pago — hoy vendría de "última fecha conciliada" por
// canal contra la fecha actual. Regla: más de 1 día de rezago = atrasado
// (Rappi/DiDi liquidan T+1, un día de rezago es normal).
export const MOCK_TENDER_MEDIA_STATUS: TenderMediaStatus[] = [
  { tenderMedia: 'bbva', health: 'up_to_date', lastReconciledAt: '2026-08-26T07:30:00', daysBehind: 0 },
  { tenderMedia: 'rappi', health: 'up_to_date', lastReconciledAt: '2026-08-26T09:00:00', daysBehind: 0 },
  { tenderMedia: 'efectivo', health: 'delayed', lastReconciledAt: '2026-08-24T18:00:00', daysBehind: 2 },
  { tenderMedia: 'didi_food', health: 'delayed', lastReconciledAt: '2026-08-22T20:00:00', daysBehind: 4 },
];

// Series de 7 días para las gráficas de los KPI — mock ilustrativo.
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
