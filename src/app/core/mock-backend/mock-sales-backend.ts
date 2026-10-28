import { MOCK_SALES } from '../../features/sales-dashboard/data/sales-mock.data';
import { saleReconciliationStatus, saleSubtotal, saleTaxAmount, saleTotal } from '../../features/sales-dashboard/data/sale.util';
import type {
  CaptureBatchResult,
  CaptureRequest,
  SaleListItem,
  SalesListPage,
  SalesListParams,
} from '../../features/sales-dashboard/data/sales-api.service';
import type { ReconciliationStatusOption, TenderMediaOption } from '../../features/sales-dashboard/data/sales-catalog.service';
import { TENDER_MEDIA_LABEL, TenderMedia } from '../../shared/models/reconciliation-item.model';
import { Sale, Store } from '../../shared/models/sale.model';
import { MOCK_UBICACIONES } from '../auth/auth-mock.data';

// Ventas, catálogos de filtros y captura simulados (`/sales/**`), armados con las ventas mock del POS.

const TENDER_MEDIA_IDS: Record<TenderMedia, number> = { bbva: 1, rappi: 2, efectivo: 3, didi_food: 4 };

export const MOCK_TENDER_MEDIA_OPTIONS: TenderMediaOption[] = (Object.keys(TENDER_MEDIA_IDS) as TenderMedia[]).map((code) => ({
  id: TENDER_MEDIA_IDS[code],
  code: code.toUpperCase(),
  description: TENDER_MEDIA_LABEL[code],
  pendingReview: false,
  dianCode: null,
}));

export const MOCK_RECONCILIATION_STATUS_OPTIONS: ReconciliationStatusOption[] = [
  { id: 1, code: 'conciliado', description: 'Conciliado' },
  { id: 2, code: 'desconciliado', description: 'Desconciliado' },
  { id: 3, code: 'por_conciliar', description: 'Por conciliar' },
];

// Cada sucursal del POS mock apunta a una ubicación del catálogo de organización.
const STORE_UBICACION_ID: Record<Store, number> = { polanco: 1, condesa: 2, roma: 9, centro: 10 };

const MAX_PAGE_SIZE = 100;

function toListItem(sale: Sale): SaleListItem {
  const ubicacionId = STORE_UBICACION_ID[sale.store];
  const biggest = [...sale.payments].sort((a, b) => b.amount - a.amount)[0];
  const statusCode = saleReconciliationStatus(sale);
  const status = MOCK_RECONCILIATION_STATUS_OPTIONS.find((s) => s.code === statusCode)!;
  const media = biggest ? MOCK_TENDER_MEDIA_OPTIONS.find((m) => m.id === TENDER_MEDIA_IDS[biggest.method]) : undefined;
  return {
    id: Number(sale.id.replace(/\D/g, '')) || 0,
    folio: sale.folio,
    documentType: sale.status === 'cancelada' ? 'CREDIT_NOTE' : 'INVOICE',
    date: sale.date,
    time: sale.time,
    store: { id: ubicacionId, name: MOCK_UBICACIONES.find((u) => u.id === ubicacionId)?.nombre ?? sale.store },
    customer: {
      id: Number(sale.id.replace(/\D/g, '')) || 0,
      document: sale.customer.taxId,
      name: sale.customer.name,
      finalConsumer: sale.customer.name.toLowerCase().startsWith('cliente mostrador'),
    },
    tenderMedia: media
      ? { id: media.id, code: media.code, description: media.description, mixed: sale.payments.length > 1, paymentCount: sale.payments.length }
      : null,
    reconciliationStatus: { id: status.id, code: status.code, description: status.description },
    subtotal: saleSubtotal(sale),
    taxes: saleTaxAmount(sale),
    total: saleTotal(sale),
  };
}

const ALL_ITEMS: SaleListItem[] = MOCK_SALES.map(toListItem).sort(
  (a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '') || b.id - a.id,
);

/** `GET /sales`: filtra y pagina las ventas mock como lo haría el Core Service. */
export function listMockSales(params: SalesListParams): SalesListPage {
  const search = params.search?.trim().toLowerCase();
  const rows = ALL_ITEMS.filter((sale) => {
    if (params.dateFrom && sale.date < params.dateFrom) return false;
    if (params.dateTo && sale.date > params.dateTo) return false;
    if (params.store !== undefined && sale.store.id !== params.store) return false;
    if (params.tenderMedia !== undefined && sale.tenderMedia?.id !== params.tenderMedia) return false;
    if (params.status !== undefined && sale.reconciliationStatus.id !== params.status) return false;
    if (search) {
      const haystack = `${sale.folio} ${sale.customer?.name ?? ''} ${sale.customer?.document ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 20));
  return { data: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}

/** `POST /sales/capture`: captura simulada, siempre completa; no inserta nada nuevo. */
export function captureMockSales(request: CaptureRequest): CaptureBatchResult {
  const dateTo = request.dateTo ?? request.dateFrom;
  const locations = request.ubicacionIds.map((ubicacionId) => {
    const existing = ALL_ITEMS.filter((s) => s.store.id === ubicacionId && s.date >= request.dateFrom && s.date <= dateTo).length;
    const day = {
      captureLogId: ubicacionId,
      ubicacionId,
      businessDate: request.dateFrom,
      status: 'OK' as const,
      capturedCount: existing,
      insertedCount: 0,
      skippedCount: existing,
      failedCount: 0,
      capturedAmount: 0,
      declaredCount: existing,
      pages: 1,
      errorMessage: null,
    };
    return {
      ubicacionId,
      dateFrom: request.dateFrom,
      dateTo,
      daysRequested: 1,
      declaredCount: existing,
      status: 'OK' as const,
      capturedCount: existing,
      insertedCount: 0,
      skippedCount: existing,
      failedCount: 0,
      capturedAmount: 0,
      days: [day],
    };
  });
  const captured = locations.reduce((sum, l) => sum + l.capturedCount, 0);
  return {
    dateFrom: request.dateFrom,
    dateTo,
    locationsRequested: locations.length,
    daysRequested: locations.length,
    declaredCount: captured,
    status: 'OK',
    capturedCount: captured,
    insertedCount: 0,
    skippedCount: captured,
    failedCount: 0,
    capturedAmount: 0,
    locations,
  };
}
