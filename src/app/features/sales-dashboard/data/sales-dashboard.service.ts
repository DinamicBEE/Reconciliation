import { Injectable, computed, signal } from '@angular/core';
import { TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { Sale } from '../../../shared/models/sale.model';
import { MOCK_SALES } from './sales-mock.data';

export type TenderMediaFilter = TenderMedia | 'all';
export type DateRangeFilter = [Date, Date] | null;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Estado de "Resumen de venta". Sin KPIs ni toggle día/mes (retirados) — la
 * tabla ahora es el catálogo completo de ventas, acotado por los 3 filtros
 * de abajo (mismo criterio de filtros que `reconciliation.service.ts` y
 * `user-management.service.ts`: `search` para texto libre, `signal` +
 * `'all'` para selects, `[Date, Date] | null` para rango de fecha).
 */
@Injectable()
export class SalesDashboardService {
  private readonly sales = signal<Sale[]>(MOCK_SALES);
  readonly selectedSale = signal<Sale | null>(null);

  readonly search = signal('');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly dateRange = signal<DateRangeFilter>(null);

  readonly filteredSales = computed(() => {
    const term = this.search().trim().toLowerCase();
    const tenderMedia = this.tenderMediaFilter();
    const range = this.dateRange();

    return this.sales().filter((sale) => {
      if (tenderMedia !== 'all' && sale.tenderMedia !== tenderMedia) return false;
      if (term && !sale.customer.name.toLowerCase().includes(term)) return false;
      if (range) {
        const saleTime = new Date(sale.date).getTime();
        if (saleTime < startOfDay(range[0]) || saleTime > endOfDay(range[1])) return false;
      }
      return true;
    });
  });

  setSearch(value: string): void {
    this.search.set(value);
  }

  setTenderMediaFilter(filter: TenderMediaFilter): void {
    this.tenderMediaFilter.set(filter);
  }

  setDateRange(range: DateRangeFilter): void {
    this.dateRange.set(range);
  }

  openSale(sale: Sale): void {
    this.selectedSale.set(sale);
  }

  closeSale(): void {
    this.selectedSale.set(null);
  }
}
