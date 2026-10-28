import { Injectable, computed, inject, signal } from '@angular/core';
import { parseIsoDate } from '../../../shared/utils/iso-date.util';
import { NewReconciliationRunInput, ReconciliationRun, ReconciliationRunStatus } from './reconciliation-run.model';
import { ReconciliationRunsStore } from './reconciliation-runs.store';

/** Filtro de estatus de la tabla; `'all'` no filtra. */
export type StatusFilter = ReconciliationRunStatus | 'all';
/** Rango de fecha de creación (inclusive, por día local); `null` no filtra. */
export type DateRangeFilter = [Date, Date] | null;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Filtros de la tabla de "Conciliación bancaria" (una fila por corrida) sobre {@link ReconciliationRunsStore}.
 *
 * @remarks Se provee por ruta; las corridas viven en el store `root`.
 * @see docs/codigo/conciliacion.md#tabla-de-conciliacion
 */
@Injectable()
export class ReconciliationService {
  private readonly store = inject(ReconciliationRunsStore);

  readonly statusFilter = signal<StatusFilter>('all');
  readonly dateRange = signal<DateRangeFilter>(null);

  readonly filteredRuns = computed<ReconciliationRun[]>(() => {
    const status = this.statusFilter();
    const range = this.dateRange();

    return this.store.runs().filter((run) => {
      if (status !== 'all' && run.status !== status) return false;
      if (range) {
        const created = parseIsoDate(run.createdAt)?.getTime();
        if (created === undefined || created < startOfDay(range[0]) || created > endOfDay(range[1])) return false;
      }
      return true;
    });
  });

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
  }

  /**
   * Fija el rango de fechas.
   *
   * @remarks La "x" del range-picker emite `[undefined, undefined]`; se normaliza a `null`.
   */
  setDateRange(range: DateRangeFilter): void {
    this.dateRange.set(range && range[0] && range[1] ? range : null);
  }

  create(input: NewReconciliationRunInput): ReconciliationRun {
    return this.store.create(input);
  }

  markDesconciliado(run: ReconciliationRun): void {
    this.store.markDesconciliado(run.id);
  }
}
