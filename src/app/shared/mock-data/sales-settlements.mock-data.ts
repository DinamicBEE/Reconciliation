import { SaleTransaction, SettlementTransaction, TenderMedia } from '../models/reconciliation-item.model';

// Dataset compartido por todo lo que cruza venta vs. liquidación por
// orderId — "Detalle por tender media" (tabla completa) y "Gestión de
// diferencias" (candidatos de match manual para una orden puntual).
// Promovido desde tender-detail/data al aparecer un segundo consumidor,
// mismo criterio que _summary-strip.scss (ver MASTER.md). Reemplazar por
// llamadas HTTP reales cuando exista backend — el cruce por orderId lo hace
// `shared/utils/cross-match.util.ts`, no este archivo.

export const MOCK_SALES: Record<TenderMedia, SaleTransaction[]> = {
  bbva: [
    { id: 'S-B001', date: '2026-08-24', orderId: 'ORD-B001', tenderMedia: 'bbva', amount: 15000 },
    { id: 'S-B002', date: '2026-08-24', orderId: 'ORD-B002', tenderMedia: 'bbva', amount: 8200 },
    { id: 'S-B003', date: '2026-08-25', orderId: 'ORD-B003', tenderMedia: 'bbva', amount: 5400 },
    { id: 'S-B004', date: '2026-08-25', orderId: 'ORD-B004', tenderMedia: 'bbva', amount: 12000 },
    { id: 'S-B005', date: '2026-08-26', orderId: 'ORD-B005', tenderMedia: 'bbva', amount: 3000 },
    { id: 'S-B006', date: '2026-08-27', orderId: 'ORD-B010', tenderMedia: 'bbva', amount: 4200 },
    { id: 'S-B007', date: '2026-08-27', orderId: 'ORD-B011', tenderMedia: 'bbva', amount: 6100 },
  ],
  rappi: [
    { id: 'S-R101', date: '2026-08-24', orderId: 'ORD-R101', tenderMedia: 'rappi', amount: 410 },
    { id: 'S-R102', date: '2026-08-25', orderId: 'ORD-R102', tenderMedia: 'rappi', amount: 389 },
    { id: 'S-R103', date: '2026-08-25', orderId: 'ORD-R103', tenderMedia: 'rappi', amount: 452 },
    { id: 'S-R104', date: '2026-08-26', orderId: 'ORD-R104', tenderMedia: 'rappi', amount: 275 },
    { id: 'S-R105', date: '2026-08-26', orderId: 'ORD-R105', tenderMedia: 'rappi', amount: 198 },
    { id: 'S-R106', date: '2026-08-27', orderId: 'ORD-R110', tenderMedia: 'rappi', amount: 320 },
  ],
  efectivo: [
    { id: 'S-E301', date: '2026-08-22', orderId: 'ORD-E301', tenderMedia: 'efectivo', amount: 1200 },
    { id: 'S-E302', date: '2026-08-24', orderId: 'ORD-E302', tenderMedia: 'efectivo', amount: 980 },
    { id: 'S-E303', date: '2026-08-25', orderId: 'ORD-E303', tenderMedia: 'efectivo', amount: 1450 },
    { id: 'S-E304', date: '2026-08-22', orderId: 'ORD-E304', tenderMedia: 'efectivo', amount: 640 },
    { id: 'S-E305', date: '2026-08-27', orderId: 'ORD-E310', tenderMedia: 'efectivo', amount: 900 },
  ],
  didi_food: [
    { id: 'S-D401', date: '2026-08-22', orderId: 'ORD-D401', tenderMedia: 'didi_food', amount: 310 },
    { id: 'S-D402', date: '2026-08-23', orderId: 'ORD-D402', tenderMedia: 'didi_food', amount: 295 },
    { id: 'S-D403', date: '2026-08-24', orderId: 'ORD-D403', tenderMedia: 'didi_food', amount: 340 },
    { id: 'S-D404', date: '2026-08-25', orderId: 'ORD-D404', tenderMedia: 'didi_food', amount: 410 },
    { id: 'S-D405', date: '2026-08-20', orderId: 'ORD-D405', tenderMedia: 'didi_food', amount: 180 },
    { id: 'S-D406', date: '2026-08-27', orderId: 'ORD-D410', tenderMedia: 'didi_food', amount: 260 },
  ],
};

// `description` es texto libre del banco/proveedor — se muestra en las cards
// de "Gestión de diferencias" (`features/difference-management`), no en la
// tabla de "Detalle por tender media". Las filas *099/*199/*399/*499 son
// liquidaciones huérfanas (sin orden con ese orderId) agregadas a propósito,
// cercanas en monto/fecha a una orden `sale_only` real de su tender media,
// para que "Gestión de diferencias" tenga al menos un candidato de buen
// ajuste con qué demostrarse.
export const MOCK_SETTLEMENTS: Record<TenderMedia, SettlementTransaction[]> = {
  bbva: [
    {
      id: 'L-B001',
      date: '2026-08-24',
      orderId: 'ORD-B001',
      tenderMedia: 'bbva',
      amount: 15000,
      batchId: 'LOTE-BBVA-0824',
      description: 'Liquidación SPEI — Lote LOTE-BBVA-0824',
    },
    {
      id: 'L-B002',
      date: '2026-08-24',
      orderId: 'ORD-B002',
      tenderMedia: 'bbva',
      amount: 8200,
      batchId: 'LOTE-BBVA-0824',
      description: 'Liquidación SPEI — Lote LOTE-BBVA-0824',
    },
    {
      id: 'L-B003',
      date: '2026-08-25',
      orderId: 'ORD-B003',
      tenderMedia: 'bbva',
      amount: 5350,
      batchId: 'LOTE-BBVA-0825',
      description: 'Liquidación SPEI — Lote LOTE-BBVA-0825',
    },
    {
      id: 'L-B004',
      date: '2026-08-25',
      orderId: 'ORD-B004',
      tenderMedia: 'bbva',
      amount: 12000,
      batchId: 'LOTE-BBVA-0825',
      description: 'Liquidación SPEI — Lote LOTE-BBVA-0825',
    },
    {
      id: 'L-B006',
      date: '2026-08-25',
      orderId: 'ORD-B006',
      tenderMedia: 'bbva',
      amount: 950,
      batchId: 'LOTE-BBVA-0825',
      description: 'Depósito SPEI sin conciliar — Lote LOTE-BBVA-0825',
    },
    {
      id: 'L-B010',
      date: '2026-08-27',
      orderId: 'ORD-B010',
      tenderMedia: 'bbva',
      amount: 4200,
      batchId: 'LOTE-BBVA-0827',
      description: 'Liquidación SPEI — Lote LOTE-BBVA-0827',
    },
    {
      id: 'L-B099',
      date: '2026-08-26',
      orderId: 'ORD-B099',
      tenderMedia: 'bbva',
      amount: 2980,
      batchId: 'LOTE-BBVA-0826',
      description: 'Transferencia SPEI recibida — folio sin identificar',
    },
  ],
  rappi: [
    {
      id: 'L-R101',
      date: '2026-08-25',
      orderId: 'ORD-R101',
      tenderMedia: 'rappi',
      amount: 410,
      batchId: 'RAPPI-LIQ-885',
      description: 'Liquidación Rappi — Lote RAPPI-LIQ-885',
    },
    {
      id: 'L-R102',
      date: '2026-08-26',
      orderId: 'ORD-R102',
      tenderMedia: 'rappi',
      amount: 389,
      batchId: 'RAPPI-LIQ-886',
      description: 'Liquidación Rappi — Lote RAPPI-LIQ-886',
    },
    {
      id: 'L-R103',
      date: '2026-08-26',
      orderId: 'ORD-R103',
      tenderMedia: 'rappi',
      amount: 452,
      batchId: 'RAPPI-LIQ-886',
      description: 'Liquidación Rappi — Lote RAPPI-LIQ-886',
    },
    {
      id: 'L-R105',
      date: '2026-08-26',
      orderId: 'ORD-R105',
      tenderMedia: 'rappi',
      amount: 190,
      batchId: 'RAPPI-LIQ-886',
      description: 'Liquidación Rappi — Lote RAPPI-LIQ-886',
    },
    {
      id: 'L-R199',
      date: '2026-08-26',
      orderId: 'ORD-R199',
      tenderMedia: 'rappi',
      amount: 270,
      batchId: 'RAPPI-LIQ-887',
      description: 'Liquidación Rappi sin folio de orden — Lote RAPPI-LIQ-887',
    },
  ],
  efectivo: [
    {
      id: 'L-E301',
      date: '2026-08-22',
      orderId: 'ORD-E301',
      tenderMedia: 'efectivo',
      amount: 1200,
      batchId: 'CORTE-0822',
      description: 'Corte de caja — Sucursal Polanco',
    },
    {
      id: 'L-E304',
      date: '2026-08-22',
      orderId: 'ORD-E304',
      tenderMedia: 'efectivo',
      amount: 640,
      batchId: 'CORTE-0822',
      description: 'Corte de caja — Sucursal Condesa',
    },
    {
      id: 'L-E399',
      date: '2026-08-24',
      orderId: 'ORD-E399',
      tenderMedia: 'efectivo',
      amount: 975,
      batchId: 'CORTE-0824',
      description: 'Depósito en ventanilla sin referencia — Sucursal Polanco',
    },
  ],
  didi_food: [
    {
      id: 'L-D401',
      date: '2026-08-23',
      orderId: 'ORD-D401',
      tenderMedia: 'didi_food',
      amount: 269,
      batchId: 'DIDI-034',
      description: 'Liquidación DiDi Food — Lote DIDI-034',
    },
    {
      id: 'L-D405',
      date: '2026-08-21',
      orderId: 'ORD-D405',
      tenderMedia: 'didi_food',
      amount: 180,
      batchId: 'DIDI-033',
      description: 'Liquidación DiDi Food — Lote DIDI-033',
    },
    {
      id: 'L-D406',
      date: '2026-08-23',
      orderId: 'ORD-D406',
      tenderMedia: 'didi_food',
      amount: 150,
      batchId: 'DIDI-034',
      description: 'Liquidación DiDi Food — Lote DIDI-034',
    },
    {
      id: 'L-D499',
      date: '2026-08-23',
      orderId: 'ORD-D499',
      tenderMedia: 'didi_food',
      amount: 298,
      batchId: 'DIDI-035',
      description: 'Liquidación DiDi Food sin folio de orden — Lote DIDI-035',
    },
  ],
};
