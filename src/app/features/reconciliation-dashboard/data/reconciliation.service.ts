import { Injectable, computed, inject, signal } from '@angular/core';
import { ReconciliationStatus, TENDER_MEDIA_LABEL, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { MOCK_TENDER_MEDIA_STATUS } from '../../../shared/mock-data/tender-media-status.mock-data';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import { ResolvedMatchesStore } from '../../../shared/data/resolved-matches.store';
import { ReconciliationOverridesStore } from '../../../shared/data/reconciliation-overrides.store';
import { MOCK_DISCREPANCY_AMOUNT_TREND, MOCK_RECONCILED_PCT_TREND } from './reconciliation-mock.data';
import { TenderDaySummary, groupByTenderDay } from './group-by-tender-day.util';

export type StatusFilter = ReconciliationStatus | 'all';
export type TenderMediaFilter = TenderMedia | 'all';
export type DateRangeFilter = [Date, Date] | null;

const ALL_TENDER_MEDIA = Object.keys(TENDER_MEDIA_LABEL) as TenderMedia[];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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
  private readonly resolvedMatches = inject(ResolvedMatchesStore);
  private readonly overrides = inject(ReconciliationOverridesStore);

  private readonly orderMatches = computed(() =>
    ALL_TENDER_MEDIA.flatMap((tenderMedia) =>
      crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]),
    ),
  );

  // Aplica, sobre el total agrupado por día + medio de pago, primero los
  // matches confirmados a mano en "Gestión de diferencias"
  // (`ResolvedMatchesStore`) y luego un "Desconciliar" manual
  // (`ReconciliationOverridesStore`) — ambos root, sobreviven la navegación
  // aunque este service sea por-ruta. Un match resuelto apunta siempre a
  // `group.actionableOrder`, la única orden puntual gestionable de ese grupo
  // (ver group-by-tender-day.util.ts) — se deja de mostrar "Gestionar"
  // (actionableOrder: null) y el grupo pasa a "conciliado" con el monto
  // realmente confirmado, no el que traía el mock. "Desconciliar" hace lo
  // opuesto: fuerza `desconciliado` aunque la suma siga cuadrando, y le da
  // a "Gestionar" ALGUNA orden del grupo a la que apuntar (no necesariamente
  // una orden con discrepancia real — ver reconciliation-dashboard.ts,
  // `resolveLink`, que ya resuelve el caso donde `actionableOrder` sigue
  // siendo null con un fallback).
  private readonly dayGroups = computed<TenderDaySummary[]>(() => {
    const groups = groupByTenderDay(MOCK_SALES, MOCK_SETTLEMENTS, this.orderMatches(), ALL_TENDER_MEDIA);

    return groups
      .map((group) => {
        const actionableOrder = group.actionableOrder;
        if (!actionableOrder) return group;

        const resolved = this.resolvedMatches.get(group.tenderMedia, actionableOrder.orderId);
        if (!resolved) return group;

        return {
          ...group,
          settledAmount: resolved.settledAmount,
          difference: round2(group.soldAmount - resolved.settledAmount),
          status: 'conciliado' as const,
          actionableOrder: null,
        };
      })
      .map((group) => {
        if (!this.overrides.isDesconciliado(group.tenderMedia, group.date)) return group;
        return { ...group, status: 'desconciliado' as const };
      });
  });

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

  // "Desconciliar" — ver comentario de `dayGroups` arriba.
  markDesconciliado(group: TenderDaySummary): void {
    this.overrides.markDesconciliado(group.tenderMedia, group.date);
  }
}
