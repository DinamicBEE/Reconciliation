import { Injectable, computed, signal } from '@angular/core';
import { MatchStatus, TENDER_MEDIA_LABEL, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { MOCK_TENDER_MEDIA_STATUS } from '../../../shared/mock-data/tender-media-status.mock-data';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import { MOCK_DISCREPANCY_AMOUNT_TREND, MOCK_RECONCILED_PCT_TREND } from './reconciliation-mock.data';
import { TenderDaySummary, groupByTenderDay } from './group-by-tender-day.util';

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
 * Estado del feature de conciliación. La tabla muestra TOTALES agrupados
 * por medio de pago + fecha (ver "Patrón: conciliación por tender media y
 * fecha" en MASTER.md) — un banco liquida por lote diario, no orden por
 * orden, así que comparar sumas de un día es lo que de verdad se concilia
 * contra el estado de cuenta. El cruce POR ORDEN (`crossMatchTransactions`,
 * mismo motor que sigue usando `difference-management`) se sigue calculando
 * aquí, pero solo como insumo para encontrar la orden puntual a la que
 * apunta "Gestionar" dentro de cada grupo — no para pintar la tabla.
 */
@Injectable()
export class ReconciliationService {
  private readonly orderMatches = computed(() =>
    ALL_TENDER_MEDIA.flatMap((tenderMedia) =>
      crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]),
    ),
  );

  private readonly dayGroups = computed<TenderDaySummary[]>(() =>
    groupByTenderDay(MOCK_SALES, MOCK_SETTLEMENTS, this.orderMatches(), ALL_TENDER_MEDIA),
  );

  readonly statusFilter = signal<StatusFilter>('all');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly dateRange = signal<DateRangeFilter>(null);

  readonly filteredItems = computed(() => {
    const status = this.statusFilter();
    const tenderMedia = this.tenderMediaFilter();
    const range = this.dateRange();

    return this.dayGroups().filter((group) => {
      if (status !== 'all' && group.status !== status) return false;
      if (tenderMedia !== 'all' && group.tenderMedia !== tenderMedia) return false;
      if (range) {
        const groupTime = new Date(group.date).getTime();
        if (groupTime < startOfDay(range[0]) || groupTime > endOfDay(range[1])) return false;
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
