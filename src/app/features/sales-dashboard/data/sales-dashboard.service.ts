import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { toIsoDate } from '../../../shared/utils/iso-date.util';
import { SaleListItem, SalesApiService, SalesListParams } from './sales-api.service';

// Medio de pago, estado y tienda: `id` REAL de los catálogos — el mismo valor
// que recibe `GET /sales` (`tenderMedia`, `status`, `store`). La tienda sale de
// las ubicaciones del login (`CatalogService`); medio y estado, de
// `SalesCatalogService`.
export type TenderMediaFilter = number | 'all';
export type StoreFilter = number | 'all';
export type StatusFilter = number | 'all';
export type DateRangeFilter = [Date, Date] | null;
// Filtro "Empresa" (subsidiaria) — id del login. `GET /sales` aún NO filtra por
// subsidiaria (ni las ubicaciones del login traen su subsidiaria), así que el
// select queda deshabilitado hasta que el backend lo soporte.
export type SubsidiariaFilter = number | 'all';

export const SALES_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const SEARCH_DEBOUNCE_MS = 300;

function isSameDay(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b);
}

// Tienda + día sobre los que actuaría el botón "Reprocesar" del toolbar.
export interface ReprocessTarget {
  date: Date;
  storeId: number;
}

/**
 * Estado de "Resumen de venta" sobre `GET /sales` (Core Service): los filtros
 * del toolbar se traducen a la query del backend y la tabla pagina en el
 * SERVIDOR (`page` base 1, `pageSize` ≤ 100). Cualquier cambio de filtro vuelve
 * a la página 1; la búsqueda espera 300 ms sin teclear antes de consultar. Una
 * consulta nueva cancela la anterior (`switchMap`).
 *
 * Provisto a nivel de componente (`SalesDashboard.providers`): el estado vive lo
 * que vive la pantalla.
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

  // Filtros (sin paginación) en el formato de `GET /sales` — los usa también la
  // exportación, que recorre todas las páginas.
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

  private readonly query = computed<SalesListParams>(() => ({
    ...this.filters(),
    page: this.page(),
    pageSize: this.pageSize(),
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
          this.api.list(query).pipe(
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

  // El botón "x" del range-picker (y a veces un cambio a medias de fecha)
  // emite un array truthy con huecos (`[undefined, undefined]`) en vez de
  // `null` — normalizarlo aquí evita mandar un rango inválido.
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

  // Todas las filas que cumplen los filtros actuales (no solo la página).
  exportRows(): Observable<SaleListItem[]> {
    return this.api.listAll(this.filters());
  }

  // Botón "Reprocesar" del toolbar: solo tiene sentido cuando los filtros
  // acotan a UN día específico Y una tienda específica. `null` cuando no se
  // cumple, consumido directamente por `[disabled]` en la plantilla.
  readonly reprocessTarget = computed<ReprocessTarget | null>(() => {
    const range = this.dateRange();
    const store = this.storeFilter();
    if (!range || store === 'all' || !isSameDay(range[0], range[1])) {
      return null;
    }
    return { date: range[0], storeId: store };
  });

  // Simula el reproceso (delay + éxito): `POST /sales/capture` aún no está
  // conectado (ver docs/analisis-front-vs-back-dev).
  reprocessDay(target: ReprocessTarget): Promise<void> {
    void target;
    return new Promise((resolve) => setTimeout(resolve, 1200));
  }

  openSale(sale: SaleListItem): void {
    this.selectedSale.set(sale);
  }

  closeSale(): void {
    this.selectedSale.set(null);
  }
}
