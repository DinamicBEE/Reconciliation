import { Injectable, computed, signal } from '@angular/core';
import { MatchStatus, TENDER_MEDIA_LABEL, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { MOCK_TENDER_MEDIA_STATUS } from '../../../shared/mock-data/tender-media-status.mock-data';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import { MOCK_DISCREPANCY_AMOUNT_TREND, MOCK_RECONCILED_PCT_TREND } from './reconciliation-mock.data';

export type StatusFilter = MatchStatus | 'all';
export type TenderMediaFilter = TenderMedia | 'all';
export type DateRangeFilter = [Date, Date] | null;

const ALL_TENDER_MEDIA = Object.keys(TENDER_MEDIA_LABEL) as TenderMedia[];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Estado del feature de conciliación. La tabla es el cruce venta (POS) vs.
 * liquidación (banco) de TODOS los tender media juntos — antes vivía
 * separada por medio de pago en "Detalle por tender media" (retirado, ver
 * MASTER.md); aquí se corre `crossMatchTransactions` una vez por medio de
 * pago y se concatena, mismo motor de cruce que ya usaba ese feature y que
 * sigue usando `difference-management`.
 */
@Injectable()
export class ReconciliationService {
  private readonly matches = computed(() =>
    ALL_TENDER_MEDIA.flatMap((tenderMedia) =>
      crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]),
    ).sort((a, b) => a.date.localeCompare(b.date)),
  );

  readonly statusFilter = signal<StatusFilter>('all');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly dateRange = signal<DateRangeFilter>(null);

  readonly filteredItems = computed(() => {
    const status = this.statusFilter();
    const tenderMedia = this.tenderMediaFilter();
    const range = this.dateRange();

    return this.matches().filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (tenderMedia !== 'all' && item.tenderMedia !== tenderMedia) return false;
      if (range) {
        const itemTime = new Date(item.date).getTime();
        if (itemTime < startOfDay(range[0]) || itemTime > endOfDay(range[1])) return false;
      }
      return true;
    });
  });

  // Visión inmediata: qué medio de pago está al día vs atrasado.
  readonly tenderMediaStatuses = signal(MOCK_TENDER_MEDIA_STATUS);

  // Series de 7 días para las gráficas comparativas de los KPI — mock
  // independiente de `matches` (ilustrativo, no derivado en vivo).
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
