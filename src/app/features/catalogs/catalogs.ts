import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { CATALOG_TYPE_LABELS, CatalogColumn, CatalogRecord, CatalogSummary, CatalogType } from './data/catalogs.model';
import { CATALOG_PAGE_SIZES, CatalogsService } from './data/catalogs.service';
import { formatCatalogValue } from './data/catalog-value.util';

type TypeFilter = CatalogType | 'all';

/**
 * "Catálogos cargados" (CU14 del DED): catálogos DIAN, NetSuite e internos del backend, de solo lectura.
 *
 * @remarks El detalle se abre en un Drawer, no en una ruta: no tiene flujo propio ni acciones de escritura.
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
@Component({
  selector: 'app-catalogs',
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzCardModule,
    NzDrawerModule,
    NzInputModule,
    NzSelectModule,
    NzTableModule,
    NzTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CatalogsService],
  templateUrl: './catalogs.html',
  styleUrl: './catalogs.scss',
})
export class Catalogs {
  protected readonly service = inject(CatalogsService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly typeLabel = CATALOG_TYPE_LABELS;
  protected readonly pageSizes = CATALOG_PAGE_SIZES;
  protected readonly typeOptions: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'Todos los tipos' },
    ...(Object.entries(CATALOG_TYPE_LABELS) as [CatalogType, string][]).map(([value, label]) => ({ value, label })),
  ];

  protected onRowClick(catalog: CatalogSummary): void {
    this.service.openCatalog(catalog);
  }

  protected formatValue(record: CatalogRecord, column: CatalogColumn): string {
    return formatCatalogValue(record[column.key], column.type, this.locale);
  }
}
