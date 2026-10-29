import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, Signal, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounce, map, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CatalogDetail, CatalogSummary, CatalogType } from './catalogs.model';

/** Registros por página del detalle (el backend acepta de 1 a 200). */
export const CATALOG_PAGE_SIZES = [10, 20, 50, 100];

interface ListParams {
  search: string;
  type: CatalogType | 'all';
}

interface DetailParams {
  code: string;
  search: string;
  page: number;
  pageSize: number;
}

/**
 * Estado de "Catálogos cargados": lista (`GET /catalogs`) y detalle paginado (`GET /catalogs/items`).
 *
 * @remarks Provisto en `Catalogs.providers` (ADR-0002, punto 4): no sobrevive a salir de la pantalla.
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
@Injectable()
export class CatalogsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  readonly search = signal('');
  readonly typeFilter = signal<CatalogType | 'all'>('all');
  private readonly listSearch = debouncedSearch(this.search);

  private readonly listResource = rxResource<readonly CatalogSummary[], ListParams>({
    params: () => ({ search: this.listSearch(), type: this.typeFilter() }),
    stream: ({ params }) =>
      this.http.get<CatalogSummary[]>(`${this.apiUrl}/catalogs`, {
        params: queryParams({ search: params.search, type: params.type === 'all' ? '' : params.type }),
      }),
    defaultValue: [],
  });

  // Un resource en error lanza al leer `value()`: se usa `hasValue()`.
  readonly catalogs = computed(() => (this.listResource.hasValue() ? this.listResource.value() : []));
  readonly loading = this.listResource.isLoading;
  readonly loadFailed = computed(() => !!this.listResource.error());

  // Detalle (Drawer): la búsqueda se reinicia al abrir otro catálogo y la página al cambiar cualquiera de los dos.
  private readonly selected = signal<CatalogSummary | null>(null);
  readonly selectedCatalog = this.selected.asReadonly();
  readonly rowSearch = signal('');
  private readonly itemsSearch = debouncedSearch(this.rowSearch);
  readonly page = linkedSignal({
    source: () => `${this.selected()?.code}|${this.itemsSearch()}`,
    computation: () => 1,
  });
  readonly pageSize = signal(CATALOG_PAGE_SIZES[0]);

  private readonly detailResource = rxResource<CatalogDetail | undefined, DetailParams | undefined>({
    params: () => {
      const catalog = this.selected();
      return catalog
        ? { code: catalog.code, search: this.itemsSearch(), page: this.page(), pageSize: this.pageSize() }
        : undefined;
    },
    stream: ({ params }) =>
      this.http.get<CatalogDetail>(`${this.apiUrl}/catalogs/items`, {
        params: queryParams({
          code: params.code,
          search: params.search,
          page: String(params.page),
          pageSize: String(params.pageSize),
        }),
      }),
  });

  /** Detalle del catálogo abierto; `null` mientras llega o si la respuesta es de otro catálogo. */
  readonly detail = computed(() => {
    const detail = this.detailResource.hasValue() ? this.detailResource.value() : undefined;
    return detail && detail.catalog.code === this.selected()?.code ? detail : null;
  });
  readonly detailLoading = this.detailResource.isLoading;
  readonly detailFailed = computed(() => !!this.detailResource.error());

  openCatalog(catalog: CatalogSummary): void {
    this.rowSearch.set('');
    this.selected.set(catalog);
  }

  closeCatalog(): void {
    this.selected.set(null);
  }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  reloadList(): void {
    this.listResource.reload();
  }

  reloadDetail(): void {
    this.detailResource.reload();
  }
}

// Espera 300 ms tras teclear; borrar la búsqueda aplica en el acto (también al abrir otro catálogo).
// Al borrar, el valor con espera también vuelve a '' de inmediato: teclear luego no revive la búsqueda anterior.
function debouncedSearch(source: Signal<string>): Signal<string> {
  const debounced = toSignal(
    toObservable(source).pipe(
      map((value) => value.trim()),
      debounce((value) => timer(value === '' ? 0 : 300)),
    ),
    { initialValue: source().trim() },
  );
  return computed(() => (source().trim() === '' ? '' : debounced()));
}

// Solo los parámetros con valor: el backend trata la ausencia como "sin filtro".
function queryParams(values: Record<string, string>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params = params.set(key, value);
  }
  return params;
}
