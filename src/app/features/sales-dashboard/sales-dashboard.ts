import { firstValueFrom } from 'rxjs';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ReconciliationStatusTag } from '../../shared/components/reconciliation-status-tag/reconciliation-status-tag';
import { ReconciliationStatus } from '../../shared/models/reconciliation-item.model';
import { COUNTRY_PROFILE } from '../../core/country/active-country';
import { CatalogService } from '../../core/services/catalog.service';
import { AccessControlService } from '../../core/auth/access-control.service';
import {
  DateRangeFilter,
  SALES_PAGE_SIZE_OPTIONS,
  SalesDashboardService,
  StatusFilter,
  StoreFilter,
  SubsidiariaFilter,
  TenderMediaFilter,
} from './data/sales-dashboard.service';
import { SaleListItem } from './data/sales-api.service';
import { buildSaleListCsv } from './data/sale-list-export.util';
import { MoneyPipe } from '../../core/country/money.pipe';
import { SalesCatalogService } from './data/sales-catalog.service';
import { CaptureMessage, describeCaptureError, describeCaptureResult } from './data/capture-result.util';

const RECONCILIATION_STATUSES = new Set<string>(['conciliado', 'desconciliado', 'por_conciliar']);

/**
 * "Resumen de venta": tabla de `GET /sales` con filtros, exportación y "Reprocesar".
 *
 * @remarks Sin `GET /sales/{id}`, el Drawer muestra lo que trae la fila del listado.
 * @see docs/codigo/ventas.md#resumen-de-venta
 */
@Component({
  selector: 'app-sales-dashboard',
  imports: [
    NzPageHeaderModule,
    CommonModule,
    MoneyPipe,
    FormsModule,
    NzCardModule,
    NzTableModule,
    NzSelectModule,
    NzDatePickerModule,
    NzInputModule,
    NzDrawerModule,
    NzButtonModule,
    NzTooltipModule,
    NzTagModule,
    NzModalModule,
    ReconciliationStatusTag,
  ],
  providers: [SalesDashboardService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-dashboard.html',
  styleUrl: './sales-dashboard.scss',
})
export class SalesDashboard {
  protected readonly service = inject(SalesDashboardService);
  private readonly catalog = inject(CatalogService);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  protected readonly access = inject(AccessControlService);
  // Vocabulario del país activo (`environment.country`): nombre del punto de venta.
  protected readonly country = inject(COUNTRY_PROFILE);
  protected readonly pageSizeOptions = SALES_PAGE_SIZE_OPTIONS;
  protected readonly exporting = signal(false);

  // Ubicaciones del login (`CatalogService`); su id es el `store` de `GET /sales`.
  protected readonly storeOptions = computed<{ value: StoreFilter; label: string }[]>(() => [
    { value: 'all', label: this.country.vocabulary.allLocations },
    ...this.catalog.ubicaciones().map((u) => ({ value: u.id, label: u.nombre })),
  ]);

  // Subsidiarias del login; el select va deshabilitado porque `GET /sales` no filtra
  // por subsidiaria (ver docs/codigo/ventas.md#resumen-de-venta).
  protected readonly subsidiariaOptions = computed<{ value: SubsidiariaFilter; label: string }[]>(() => [
    { value: 'all', label: 'Todas las empresas' },
    ...this.catalog.subsidiarias().map((s) => ({ value: s.id, label: s.nombre })),
  ]);

  // `GET /sales/catalogs/tender-media` y `/reconciliation-statuses`.
  protected readonly salesCatalog = inject(SalesCatalogService);

  protected readonly statusOptions = computed<{ value: StatusFilter; label: string }[]>(() => [
    { value: 'all', label: 'Todos los estados' },
    ...this.salesCatalog.reconciliationStatuses().map((s) => ({ value: s.id, label: s.description })),
  ]);

  // `pendingReview`: código del POS que llegó en una venta sin estar sembrado.
  protected readonly tenderMediaOptions = computed<{ value: TenderMediaFilter; label: string }[]>(() => [
    { value: 'all', label: 'Todos los medios' },
    ...this.salesCatalog
      .tenderMedia()
      .map((m) => ({ value: m.id, label: m.pendingReview ? `${m.description} (por revisar)` : m.description })),
  ]);

  constructor() {
    this.salesCatalog.ensureLoaded();
  }

  protected onDateRangeChange(value: [Date, Date] | null): void {
    this.service.setDateRange(value as DateRangeFilter);
  }

  protected onSubsidiariaFilterChange(value: SubsidiariaFilter): void {
    this.service.setSubsidiariaFilter(value);
  }

  protected onStoreFilterChange(value: StoreFilter): void {
    this.service.setStoreFilter(value);
  }

  protected onStatusFilterChange(value: StatusFilter): void {
    this.service.setStatusFilter(value);
  }

  protected onTenderMediaFilterChange(value: TenderMediaFilter): void {
    this.service.setTenderMediaFilter(value);
  }

  protected onSearchChange(value: string): void {
    this.service.setSearch(value);
  }

  protected onPageIndexChange(page: number): void {
    this.service.setPage(page);
  }

  protected onPageSizeChange(size: number): void {
    this.service.setPageSize(size);
  }

  protected onRowClick(sale: SaleListItem): void {
    this.service.openSale(sale);
  }

  // `ReconciliationStatusTag` pinta los 3 estados del portal; el `code` del
  // backend es el mismo valor. Un código nuevo cae a "por conciliar".
  protected statusOf(sale: SaleListItem): ReconciliationStatus {
    const code = sale.reconciliationStatus.code;
    return (RECONCILIATION_STATUSES.has(code) ? code : 'por_conciliar') as ReconciliationStatus;
  }

  protected tenderMediaText(sale: SaleListItem): string {
    const media = sale.tenderMedia;
    if (!media) return 'Sin pagos';
    return media.mixed ? `${media.description} +${media.paymentCount - 1}` : media.description;
  }

  // CSV de todo lo filtrado, con BOM UTF-8 para que Excel respete los acentos.
  protected exportCsv(): void {
    // Defensa en profundidad: el botón ya se oculta sin `export_reports` (matriz 7.16 del DED).
    if (!this.access.hasPermission('export_reports') || this.exporting()) return;

    this.exporting.set(true);
    this.service.exportRows().subscribe({
      next: (rows) => {
        this.exporting.set(false);
        if (rows.length === 0) {
          this.message.info('No hay ventas que exportar con los filtros actuales.');
          return;
        }
        const csv = buildSaleListCsv(rows, { location: this.country.vocabulary.location });
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = `resumen-de-venta_${stamp}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      },
      // El aviso del error lo da `httpErrorAlertInterceptor`.
      error: () => this.exporting.set(false),
    });
  }

  // `nzOnOk` como Promise deja "Reprocesar" en carga mientras dura la captura síncrona.
  // Ver docs/codigo/ventas.md#reprocesar.
  protected onReprocessClick(): void {
    // Defensa en profundidad: el botón ya se oculta sin `capture_sales`.
    if (!this.access.canReprocessSales()) return;
    const target = this.service.reprocessTarget();
    if (!target) return;

    const dateLabel = this.formatDate(target.date);
    const storeLabel = this.catalog.findUbicacion(target.storeId)?.nombre ?? `#${target.storeId}`;
    const place = `${storeLabel} del ${dateLabel}`;

    this.modal.confirm({
      nzTitle: 'Reprocesar día',
      nzContent: `Se volverán a traer de Facturiza las ventas del <b>${dateLabel}</b> de <b>${storeLabel}</b>. Las que ya existen no se duplican. Puede tardar unos segundos.`,
      nzOkText: 'Reprocesar',
      nzCancelText: 'Cancelar',
      nzOnOk: async () => {
        let result: CaptureMessage;
        try {
          result = describeCaptureResult(await firstValueFrom(this.service.reprocessDay(target)), place);
        } catch (err) {
          result = describeCaptureError(err, place);
        }
        this.message.create(result.level, result.text, { nzDuration: result.level === 'success' ? 4500 : 8000 });
        if (result.reload) this.service.reload();
      },
    });
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }
}
