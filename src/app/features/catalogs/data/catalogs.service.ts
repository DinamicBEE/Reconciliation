import { Injectable, computed, signal } from '@angular/core';
import { MOCK_CATALOGS } from './catalogs-mock.data';
import { Catalog, CatalogKind } from './catalogs.model';
import { filterCatalogRows, filterCatalogs } from './catalog-filter.util';

/**
 * Estado de "Catálogos cargados", de solo lectura, sobre `MOCK_CATALOGS`.
 *
 * @remarks Provisto en `Catalogs.providers` (ADR-0002, punto 4): no sobrevive a salir de la pantalla.
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
@Injectable()
export class CatalogsService {
  private readonly catalogs = signal<readonly Catalog[]>(MOCK_CATALOGS);

  readonly search = signal('');
  readonly kindFilter = signal<CatalogKind | 'all'>('all');

  readonly filteredCatalogs = computed(() => filterCatalogs(this.catalogs(), this.search(), this.kindFilter()));

  readonly totalCatalogs = computed(() => this.catalogs().length);

  // Detalle de una lista (Drawer) — su búsqueda se reinicia al abrir otra.
  private readonly selectedId = signal<string | null>(null);
  readonly rowSearch = signal('');

  readonly selectedCatalog = computed(() => this.catalogs().find((c) => c.id === this.selectedId()) ?? null);

  readonly filteredRows = computed(() => {
    const catalog = this.selectedCatalog();
    return catalog ? filterCatalogRows(catalog.rows, this.rowSearch()) : [];
  });

  openCatalog(catalog: Catalog): void {
    this.rowSearch.set('');
    this.selectedId.set(catalog.id);
  }

  closeCatalog(): void {
    this.selectedId.set(null);
  }
}
