import { Injectable, computed, signal } from '@angular/core';
import {
  ReconciliationItem,
  ReconciliationStatus,
  TenderMedia,
} from '../../../shared/models/reconciliation-item.model';
import {
  MOCK_DISCREPANCY_AMOUNT_TREND,
  MOCK_RECONCILED_PCT_TREND,
  MOCK_RECONCILIATION_ITEMS,
  MOCK_TENDER_MEDIA_STATUS,
} from './reconciliation-mock.data';

export type StatusFilter = ReconciliationStatus | 'all';
export type TenderMediaFilter = TenderMedia | 'all';
export type DateRangeFilter = [Date, Date] | null;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Estado del feature de conciliación. Hoy sirve datos mock; el día que exista
 * backend, solo cambia cómo se llena `items` (p. ej. vía httpResource / un
 * effect que llame a un endpoint) — el resto de la app no se entera.
 */
@Injectable()
export class ReconciliationService {
  private readonly items = signal<ReconciliationItem[]>(MOCK_RECONCILIATION_ITEMS);

  readonly statusFilter = signal<StatusFilter>('all');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly dateRange = signal<DateRangeFilter>(null);

  readonly filteredItems = computed(() => {
    const status = this.statusFilter();
    const tenderMedia = this.tenderMediaFilter();
    const range = this.dateRange();

    return this.items().filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (tenderMedia !== 'all' && item.tenderMedia !== tenderMedia) return false;
      if (range) {
        const itemTime = new Date(item.date).getTime();
        if (itemTime < startOfDay(range[0]) || itemTime > endOfDay(range[1])) return false;
      }
      return true;
    });
  });

  // Los KPI reflejan el total global (no el filtro de la tabla) — son el
  // "pulso" general del proceso de conciliación.
  readonly summary = computed(() => {
    const all = this.items();
    return {
      totalMovements: all.length,
      matchedCount: all.filter((i) => i.status === 'matched').length,
      pendingCount: all.filter((i) => i.status === 'pending').length,
      discrepancyCount: all.filter((i) => i.status === 'discrepancy').length,
      totalDiscrepancyAmount: all
        .filter((i) => i.status === 'discrepancy')
        .reduce((sum, i) => sum + Math.abs(i.bankAmount - i.bookAmount), 0),
      lastSyncedAt: '2026-08-26T08:15:00',
    };
  });

  // Visión inmediata: qué medio de pago está al día vs atrasado.
  readonly tenderMediaStatuses = signal(MOCK_TENDER_MEDIA_STATUS);

  // Series de 7 días para las gráficas comparativas de los KPI.
  readonly reconciledPctTrend = signal(MOCK_RECONCILED_PCT_TREND);
  readonly discrepancyAmountTrend = signal(MOCK_DISCREPANCY_AMOUNT_TREND);

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
  }

  setTenderMediaFilter(filter: TenderMediaFilter): void {
    this.tenderMediaFilter.set(filter);
  }

  setDateRange(range: DateRangeFilter): void {
    this.dateRange.set(range);
  }
}
