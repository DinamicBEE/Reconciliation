import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, map, tap } from 'rxjs';
import { toIsoDate } from '../../../shared/utils/iso-date.util';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { SalesCatalogService } from '../../sales-dashboard/data/sales-catalog.service';
import {
  CODE_BY_RUN_STATUS,
  ReconciliationApiService,
  ReconciliationListParams,
  toReconciliationRun,
} from './reconciliation-api.service';
import { NewReconciliationRunInput, ReconciliationRun, ReconciliationRunStatus } from './reconciliation-run.model';
import { ReconciliationRunsStore } from './reconciliation-runs.store';

/** Filtro de estatus de la tabla; `'all'` no filtra. */
export type StatusFilter = ReconciliationRunStatus | 'all';
/** Rango de fecha de creación (inclusive, por día); `null` no filtra. */
export type DateRangeFilter = [Date, Date] | null;

/** Tamaños de página de la tabla (el backend acepta de 1 a 100). */
export const RECONCILIATION_PAGE_SIZES = [10, 20, 50, 100];

// Ids del catálogo en el orden en que los siembra la V1; solo si el catálogo no se pudo leer (pide `view_dashboard`).
const FALLBACK_STATUS_IDS: Record<string, number> = { por_conciliar: 1, conciliado: 2, desconciliado: 3 };

interface Filters {
  status?: number;
  createdFrom?: string;
  createdTo?: string;
}

/**
 * Tabla de "Conciliación bancaria" (`GET /reconciliations`): filtros y paginación en el servidor.
 *
 * @remarks Se provee por ruta. Lo recibido se guarda en {@link ReconciliationRunsStore} para la comparativa y el proceso.
 * @see docs/codigo/conciliacion.md#tabla-de-conciliacion
 */
@Injectable()
export class ReconciliationService {
  private readonly api = inject(ReconciliationApiService);
  private readonly store = inject(ReconciliationRunsStore);
  private readonly statusCatalog = inject(SalesCatalogService);
  private readonly access = inject(AccessControlService);

  readonly statusFilter = signal<StatusFilter>('all');
  readonly dateRange = signal<DateRangeFilter>(null);
  readonly pageSize = signal(RECONCILIATION_PAGE_SIZES[0]);
  private readonly refreshTick = signal(0);

  private readonly filters = computed<Filters>(
    () => {
      const status = this.statusFilter();
      const range = this.dateRange();
      return {
        status: status === 'all' ? undefined : this.statusId(status),
        createdFrom: range ? toIsoDate(range[0]) : undefined,
        createdTo: range ? toIsoDate(range[1]) : undefined,
      };
    },
    { equal: (a, b) => a.status === b.status && a.createdFrom === b.createdFrom && a.createdTo === b.createdTo },
  );

  /** Página actual (desde 1); vuelve a 1 al cambiar un filtro o el tamaño de página. */
  readonly page = linkedSignal({ source: () => [this.filters(), this.pageSize()] as const, computation: () => 1 });

  private readonly listResource = rxResource({
    params: () => ({ ...this.filters(), page: this.page(), pageSize: this.pageSize(), tick: this.refreshTick() }),
    stream: ({ params: { tick: _tick, ...params } }) => this.fetch(params),
  });

  // Un resource en error lanza al leer `value()`: se usa `hasValue()`.
  private readonly pageValue = computed(() => (this.listResource.hasValue() ? this.listResource.value() : null));

  /** Filas de la página, con el "Desconciliar" de la sesión aplicado. */
  readonly runs = computed(() => (this.pageValue()?.runs ?? []).map((run) => this.store.withLocalStatus(run)));
  readonly total = computed(() => this.pageValue()?.total ?? 0);
  readonly loading = this.listResource.isLoading;
  readonly loadFailed = computed(() => !!this.listResource.error());

  constructor() {
    // El id de cada estatus sale del catálogo de estados de conciliación.
    if (this.access.hasPermission('view_dashboard')) this.statusCatalog.ensureLoaded();
  }

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

  setPage(page: number): void {
    this.page.set(page);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
  }

  reload(): void {
    this.refreshTick.update((n) => n + 1);
  }

  /** Crea la conciliación en el backend y la guarda en el store; no recarga la tabla (eso lo decide quien llama). */
  create(input: NewReconciliationRunInput): Observable<ReconciliationRun> {
    return this.api.create({ store: input.storeId, periodStart: input.periodStart, periodEnd: input.periodEnd }).pipe(
      map(toReconciliationRun),
      tap((run) => this.store.upsert([run])),
    );
  }

  markDesconciliado(run: ReconciliationRun): void {
    this.store.markDesconciliado(run.id);
  }

  private fetch(params: ReconciliationListParams): Observable<{ runs: ReconciliationRun[]; total: number }> {
    return this.api.list(params).pipe(
      map((page) => ({ runs: page.data.map(toReconciliationRun), total: page.total })),
      tap((page) => this.store.upsert(page.runs)),
    );
  }

  private statusId(status: ReconciliationRunStatus): number {
    const code = CODE_BY_RUN_STATUS[status];
    return this.statusCatalog.reconciliationStatuses().find((option) => option.code === code)?.id ?? FALLBACK_STATUS_IDS[code];
  }
}
