import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { toIsoDate } from '../../../shared/utils/iso-date.util';
import { CaptureBatchResult, SaleListItem, SalesApiService, SalesListParams } from './sales-api.service';

/** Id de `SalesCatalogService.tenderMedia` que recibe `GET /sales` como `tenderMedia`. */
export type TenderMediaFilter = number | 'all';
/** Id de ubicación del login (`CatalogService`) que recibe `GET /sales` como `store`. */
export type StoreFilter = number | 'all';
/** Id de `SalesCatalogService.reconciliationStatuses` que recibe `GET /sales` como `status`. */
export type StatusFilter = number | 'all';
/** Rango de fechas completo o `null`. */
export type DateRangeFilter = [Date, Date] | null;
/**
 * Filtro "Empresa" (id de subsidiaria del login).
 *
 * @remarks `GET /sales` aún no filtra por subsidiaria: el select queda deshabilitado.
 * @see docs/codigo/ventas.md#resumen-de-venta
 */
export type SubsidiariaFilter = number | 'all';

/** Tamaños de página del paginador (máximo del backend: 100). */
export const SALES_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const SEARCH_DEBOUNCE_MS = 300;

function isSameDay(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b);
}

/** Tienda y día sobre los que actúa "Reprocesar". */
export interface ReprocessTarget {
  date: Date;
  storeId: number;
}

/**
 * Estado de "Resumen de venta" con paginación en el servidor sobre `GET /sales`.
 *
 * @remarks Provisto en `SalesDashboard.providers`: el estado vive lo que vive la pantalla.
 * @see docs/codigo/ventas.md#resumen-de-venta
 */
@Injectable()
export class SalesDashboardService {
  private readonly api = inject(SalesApiService);

  readonly selectedSale = signal<SaleListItem | null>(null);

  readonly dateRange = signal<DateRangeFilter>(null);
  readonly subsidiariaFilter = signal<SubsidiariaFilter>('all');
  readonly storeFilter = signal<StoreFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly tenderMediaFilter = signal<TenderMediaFilter>('all');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(SALES_PAGE_SIZE_OPTIONS[0]);

  readonly rows = signal<SaleListItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  /** Filtros sin paginación en el formato de `GET /sales`; también los usa la exportación. */
  readonly filters = computed<Omit<SalesListParams, 'page' | 'pageSize'>>(() => {
    const range = this.dateRange();
    const store = this.storeFilter();
    const status = this.statusFilter();
    const tenderMedia = this.tenderMediaFilter();
    return {
      dateFrom: range ? toIsoDate(range[0]) : undefined,
      dateTo: range ? toIsoDate(range[1]) : undefined,
      store: store === 'all' ? undefined : store,
      status: status === 'all' ? undefined : status,
      tenderMedia: tenderMedia === 'all' ? undefined : tenderMedia,
      search: this.search().trim() || undefined,
    };
  });

  // Sube para repetir la consulta actual (p. ej. tras reprocesar).
  private readonly refreshTick = signal(0);

  // `tick` no viaja al backend: solo fuerza repetir la misma consulta.
  private readonly query = computed<{ params: SalesListParams; tick: number }>(() => ({
    params: { ...this.filters(), page: this.page(), pageSize: this.pageSize() },
    tick: this.refreshTick(),
  }));

  constructor() {
    toObservable(this.query)
      .pipe(
        // Agrupa cambios seguidos (p. ej. filtro + regreso a la página 1) y deja
        // de consultar en cada tecla de la búsqueda.
        debounceTime(SEARCH_DEBOUNCE_MS),
        tap(() => {
          this.loading.set(true);
          this.loadFailed.set(false);
        }),
        switchMap((query) =>
          this.api.list(query.params).pipe(
            // El aviso del error lo da `httpErrorAlertInterceptor`.
            catchError(() => {
              this.loadFailed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (res) {
          this.rows.set(res.data);
          this.total.set(res.total);
        } else {
          this.rows.set([]);
          this.total.set(0);
        }
      });
  }

  /** Normaliza a `null` el `[undefined, undefined]` que emite la "x" del range-picker. */
  setDateRange(range: DateRangeFilter): void {
    this.dateRange.set(range && range[0] && range[1] ? range : null);
    this.page.set(1);
  }

  setSubsidiariaFilter(filter: SubsidiariaFilter): void {
    this.subsidiariaFilter.set(filter);
    this.page.set(1);
  }

  setStoreFilter(filter: StoreFilter): void {
    this.storeFilter.set(filter);
    this.page.set(1);
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
    this.page.set(1);
  }

  setTenderMediaFilter(filter: TenderMediaFilter): void {
    this.tenderMediaFilter.set(filter);
    this.page.set(1);
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  /** Todas las filas de los filtros actuales, no solo la página. */
  exportRows(): Observable<SaleListItem[]> {
    return this.api.listAll(this.filters());
  }

  /** Destino de "Reprocesar"; `null` salvo que los filtros acoten a un día y una tienda. */
  readonly reprocessTarget = computed<ReprocessTarget | null>(() => {
    const range = this.dateRange();
    const store = this.storeFilter();
    if (!range || store === 'all' || !isSameDay(range[0], range[1])) {
      return null;
    }
    return { date: range[0], storeId: store };
  });

  /** `POST /sales/capture` de un día y una tienda; idempotente (lo existente cuenta como omitido). */
  reprocessDay(target: ReprocessTarget): Observable<CaptureBatchResult> {
    return this.api.capture({ ubicacionIds: [target.storeId], dateFrom: toIsoDate(target.date) });
  }

  /** Vuelve a consultar la página actual con los filtros actuales. */
  reload(): void {
    this.refreshTick.update((n) => n + 1);
  }

  openSale(sale: SaleListItem): void {
    this.selectedSale.set(sale);
  }

  closeSale(): void {
    this.selectedSale.set(null);
  }
}
