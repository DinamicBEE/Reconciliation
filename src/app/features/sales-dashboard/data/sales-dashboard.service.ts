import { Injectable, computed, signal } from '@angular/core';
import { ReconciliationStatus, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { Sale, Store } from '../../../shared/models/sale.model';
import { MOCK_SALES } from './sales-mock.data';
import { saleReconciliationStatus } from './sale.util';

export type TenderMediaFilter = TenderMedia | 'all';
export type StoreFilter = Store | 'all';
export type StatusFilter = ReconciliationStatus | 'all';
export type DateRangeFilter = [Date, Date] | null;

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
  private readonly sales = signal<Sale[]>(MOCK_SALES);
  readonly selectedSale = signal<Sale | null>(null);

  readonly dateRange = signal<DateRangeFilter>(null);
  readonly storeFilter = signal<StoreFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly search = signal('');

  readonly filteredSales = computed(() => {
    const range = this.dateRange();
    const store = this.storeFilter();
    const status = this.statusFilter();
    const tenderMedia = this.tenderMediaFilter();
    const term = this.search().trim().toLowerCase();

    return this.sales().filter((sale) => {
      if (store !== 'all' && sale.store !== store) return false;
      if (status !== 'all' && saleReconciliationStatus(sale) !== status) return false;
      if (tenderMedia !== 'all' && sale.tenderMedia !== tenderMedia) return false;
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
