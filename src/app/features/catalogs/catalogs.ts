import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { COUNTRY_PROFILE } from '../../core/country/active-country';
import { Catalog, CatalogKind, catalogKindLabels } from './data/catalogs.model';
import { CatalogsService } from './data/catalogs.service';

type KindFilter = CatalogKind | 'all';

/**
 * "Catálogos cargados" (CU14 del DED): listas fiscales, homologaciones, NetSuite y maestros, de solo lectura.
 *
 * @remarks El detalle se abre en un Drawer, no en una ruta: no tiene flujo propio ni acciones de escritura.
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
@Component({
  selector: 'app-catalogs',
  imports: [
    NzPageHeaderModule,
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
  // "Catálogo fijo SAT" / "Catálogo fijo DIAN" según el país activo.
  protected readonly kindLabel = catalogKindLabels(inject(COUNTRY_PROFILE));

  protected readonly kindOptions: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'Todos los tipos' },
    ...(Object.entries(this.kindLabel) as [CatalogKind, string][]).map(([value, label]) => ({ value, label })),
  ];

  protected onRowClick(catalog: Catalog): void {
    this.service.openCatalog(catalog);
  }
}
