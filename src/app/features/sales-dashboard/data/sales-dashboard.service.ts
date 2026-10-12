import { Injectable, computed, inject, signal } from '@angular/core';
import { ReconciliationStatus, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { Sale, Store } from '../../../shared/models/sale.model';
import { MOCK_SALES } from './sales-mock.data';
import { saleReconciliationStatus } from './sale.util';
import { SalesCatalogService } from './sales-catalog.service';

// Medio de pago y estado: `id` REAL de los catálogos del Core Service
// (`GET /sales/catalogs/tender-media` y `/reconciliation-statuses`, ver
// `SalesCatalogService`) — el mismo valor que recibirá `GET /sales` en sus
// filtros `tenderMedia`/`status`.
export type TenderMediaFilter = number | 'all';
export type StoreFilter = Store | 'all';
export type StatusFilter = number | 'all';
export type DateRangeFilter = [Date, Date] | null;
// Filtro "Empresa" (subsidiaria) del toolbar — id REAL del catálogo del
// backend (`Sale.subsidiariaId`/`CatalogService.subsidiarias()`), a
// diferencia de `StoreFilter` (que sigue siendo un slug fijo del mock, ver
// sale.model.ts).
export type SubsidiariaFilter = number | 'all';

// Puente TEMPORAL id del catálogo → valor del mock de ventas, mientras la tabla
// siga siendo `MOCK_SALES` (sin `GET /sales`). Estado: el `code` del backend
// (`por_conciliar`/`conciliado`/`desconciliado`) es el mismo valor que
// `ReconciliationStatus`. Medio de pago: por nombre normalizado
// ("Efectivo" → 'efectivo', "Rappi" → 'rappi'); un medio del POS que el mock no
// modela (Transferencia, tarjetas...) no coincide con ninguna venta. Al integrar
// `GET /sales` este puente desaparece: los ids viajan tal cual al backend.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const MOCK_TENDER_MEDIA = new Set<string>(['rappi', 'didi_food', 'efectivo', 'bbva']);

export function mockTenderMediaFor(description: string): TenderMedia | null {
  const slug = normalize(description);
  return MOCK_TENDER_MEDIA.has(slug) ? (slug as TenderMedia) : null;
}

const MOCK_STATUSES = new Set<string>(['conciliado', 'desconciliado', 'por_conciliar']);

export function mockStatusFor(code: string): ReconciliationStatus | null {
  return MOCK_STATUSES.has(code) ? (code as ReconciliationStatus) : null;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

// Tienda + día sobre los que actuaría el botón "Reprocesar" del toolbar.
export interface ReprocessTarget {
  date: Date;
  store: Store;
}

/**
 * Estado de "Resumen de venta". Sin KPIs ni toggle día/mes (retirados) — la
 * tabla ahora es el catálogo completo de ventas, acotado por los 5 filtros
 * de abajo (mismo criterio de filtros que `reconciliation.service.ts` y
 * `user-management.service.ts`: `search` para texto libre, `signal` +
 * `'all'` para selects, `[Date, Date] | null` para rango de fecha).
 */
@Injectable()
export class SalesDashboardService {
  private readonly salesCatalog = inject(SalesCatalogService);
  private readonly sales = signal<Sale[]>(MOCK_SALES);
  readonly selectedSale = signal<Sale | null>(null);

  readonly dateRange = signal<DateRangeFilter>(null);
  readonly subsidiariaFilter = signal<SubsidiariaFilter>('all');
  readonly storeFilter = signal<StoreFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly search = signal('');

  readonly filteredSales = computed(() => {
    const range = this.dateRange();
    const subsidiaria = this.subsidiariaFilter();
    const store = this.storeFilter();
    const statusId = this.statusFilter();
    const tenderMediaId = this.tenderMediaFilter();
    const statusOption = statusId === 'all' ? null : this.salesCatalog.findReconciliationStatus(statusId);
    const status = statusOption ? mockStatusFor(statusOption.code) : null;
    const tenderMediaOption = tenderMediaId === 'all' ? null : this.salesCatalog.findTenderMedia(tenderMediaId);
    const tenderMedia = tenderMediaOption ? mockTenderMediaFor(tenderMediaOption.description) : null;
    const term = this.search().trim().toLowerCase();

    return this.sales().filter((sale) => {
      if (subsidiaria !== 'all' && sale.subsidiariaId !== subsidiaria) return false;
      if (store !== 'all' && sale.store !== store) return false;
      if (statusId !== 'all' && saleReconciliationStatus(sale) !== status) return false;
      // Igual que `GET /sales`: la venta debe tener ALGÚN pago con ese medio.
      if (tenderMediaId !== 'all' && !sale.payments.some((payment) => payment.method === tenderMedia)) return false;
      if (term && !sale.customer.name.toLowerCase().includes(term)) return false;
      if (range) {
        const saleTime = new Date(sale.date).getTime();
        if (saleTime < startOfDay(range[0]) || saleTime > endOfDay(range[1])) return false;
      }
      return true;
    });
  });

  // El botón "x" del range-picker (y a veces un cambio a medias de fecha)
  // emite un array truthy con huecos (`[undefined, undefined]`) en vez de
  // `null` — normalizarlo aquí evita que `filteredSales`/`reprocessTarget`
  // reciban un rango con `range[0]`/`range[1]` inválidos.
  setDateRange(range: DateRangeFilter): void {
    this.dateRange.set(range && range[0] && range[1] ? range : null);
  }

  setSubsidiariaFilter(filter: SubsidiariaFilter): void {
    this.subsidiariaFilter.set(filter);
  }

  setStoreFilter(filter: StoreFilter): void {
    this.storeFilter.set(filter);
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
  }

  setTenderMediaFilter(filter: TenderMediaFilter): void {
    this.tenderMediaFilter.set(filter);
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  // Botón "Reprocesar" del toolbar: solo tiene sentido cuando los filtros
  // acotan a UN día específico (mismo día de inicio/fin del range-picker, no
  // un rango) Y una tienda específica (`storeFilter !== 'all'`) — reprocesar
  // "todas las tiendas" o un rango de varios días no es la operación que
  // pidió el botón. `null` cuando no se cumple, consumido directamente por
  // `[disabled]` en la plantilla.
  readonly reprocessTarget = computed<ReprocessTarget | null>(() => {
    const range = this.dateRange();
    const store = this.storeFilter();

    if (!range || store === 'all' || !isSameDay(range[0], range[1])) {
      return null;
    }

    return { date: range[0], store };
  });

  // Simula la llamada al backend del reproceso (ver docs/api-endpoints.csv,
  // POST /sales/{store}/{date}/reprocess) — delay artificial + éxito, sin
  // mutar `sales()`: el reproceso corre del lado del backend real, la tabla
  // de este mock no tiene un estado "reprocesando" que reflejar.
  reprocessDay(target: ReprocessTarget): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 1200));
  }

  openSale(sale: Sale): void {
    this.selectedSale.set(sale);
  }

  closeSale(): void {
    this.selectedSale.set(null);
  }
}
