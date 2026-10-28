import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { toIsoDate } from '../../shared/utils/iso-date.util';
import { AccessControlService } from '../../core/auth/access-control.service';
import { CatalogService } from '../../core/services/catalog.service';
import { OrganizationCatalogService } from '../../core/services/organization-catalog.service';
import { DateRangeFilter, ReconciliationService, StatusFilter } from './data/reconciliation.service';
import { ReconciliationRun } from './data/reconciliation-run.model';
import { buildRunCsv, canDesconciliar, canDownload } from './data/reconciliation-run.util';
import { RunStatusTag } from './run-status-tag/run-status-tag';

/**
 * Tabla de conciliaciones (corridas) y modal "Nueva conciliación".
 *
 * @see docs/codigo/conciliacion.md#tabla-de-conciliacion
 */
@Component({
  selector: 'app-reconciliation-dashboard',
  imports: [
    NzPageHeaderModule,
    CommonModule,
    FormsModule,
    RouterLink,
    NzCardModule,
    NzTableModule,
    NzSelectModule,
    NzDatePickerModule,
    NzButtonModule,
    NzTooltipModule,
    NzModalModule,
    RunStatusTag,
  ],
  providers: [ReconciliationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reconciliation-dashboard.html',
  styleUrl: './reconciliation-dashboard.scss',
})
export class ReconciliationDashboard {
  protected readonly service = inject(ReconciliationService);
  private readonly router = inject(Router);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly catalog = inject(CatalogService);
  private readonly organization = inject(OrganizationCatalogService);
  protected readonly access = inject(AccessControlService);

  protected readonly canDesconciliar = canDesconciliar;
  protected readonly canDownload = canDownload;

  protected readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estatus' },
    { value: 'conciliado', label: 'Conciliado' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'desconciliado', label: 'Desconciliado' },
  ];

  protected onStatusFilterChange(value: StatusFilter): void {
    this.service.setStatusFilter(value);
  }

  protected onDateRangeChange(value: [Date, Date] | null): void {
    this.service.setDateRange(value as DateRangeFilter);
  }

  // Irreversible en la sesión: se confirma antes.
  protected onDesconciliarClick(run: ReconciliationRun): void {
    if (!canDesconciliar(run)) return;
    this.modal.confirm({
      nzTitle: 'Desconciliar',
      nzContent: `¿Desconciliar la conciliación <b>${run.id}</b> de <b>${run.storeName}</b> (${this.formatPeriod(run)})? Pasará a "Desconciliado".`,
      nzOkText: 'Desconciliar',
      nzOkDanger: true,
      nzOnOk: () => {
        this.service.markDesconciliado(run);
        this.message.success(`La conciliación ${run.id} se marcó como desconciliada.`);
      },
    });
  }

  // CSV con BOM UTF-8 para que Excel respete los acentos.
  protected onDownloadClick(run: ReconciliationRun): void {
    if (!canDownload(run)) return;
    const blob = new Blob(['﻿' + buildRunCsv(run)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conciliacion_${run.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected formatPeriod(run: ReconciliationRun): string {
    return `${this.formatDate(run.periodStart)} – ${this.formatDate(run.periodEnd)}`;
  }

  private formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  // --- "Nueva conciliación" -------------------------------------------------
  // Catálogos de la sesión; la subsidiaria de cada ubicación sale de `GET /catalogs/ubicaciones`.
  protected readonly companyOptions = computed(() =>
    this.catalog.subsidiarias().map((s) => ({ value: s.id, label: s.nombre })),
  );
  // Solo las tiendas de la empresa elegida; sin la relación cargada, las de la sesión.
  protected readonly storeOptions = computed(() => {
    const companyId = this.newCompanyId();
    if (companyId === null) return [];
    const companyOf = new Map(this.organization.ubicaciones().map((u) => [u.id, u.subsidiariaId]));
    return this.catalog
      .ubicaciones()
      .filter((u) => companyOf.size === 0 || companyOf.get(u.id) === companyId)
      .map((u) => ({ value: u.id, label: u.nombre }));
  });

  protected readonly newModalOpen = signal(false);
  protected readonly newCompanyId = signal<number | null>(null);
  protected readonly newStoreId = signal<number | null>(null);
  protected readonly newPeriod = signal<[Date, Date] | null>(null);

  protected readonly canStart = computed(
    () => this.newCompanyId() !== null && this.newStoreId() !== null && this.newPeriod() !== null,
  );

  protected openNewModal(): void {
    this.organization.ensureLoaded();
    this.newModalOpen.set(true);
  }

  // Cambiar de empresa descarta la tienda elegida.
  protected onCompanyChange(companyId: number | null): void {
    this.newCompanyId.set(companyId);
    this.newStoreId.set(null);
  }

  protected closeNewModal(): void {
    this.newModalOpen.set(false);
    this.newCompanyId.set(null);
    this.newStoreId.set(null);
    this.newPeriod.set(null);
  }

  // La "x" del range-picker emite un array con huecos, no `null`.
  protected onNewPeriodChange(value: [Date, Date] | null): void {
    this.newPeriod.set(value && value[0] && value[1] ? value : null);
  }

  protected startReconciliation(): void {
    const companyId = this.newCompanyId();
    const storeId = this.newStoreId();
    const period = this.newPeriod();
    if (companyId === null || storeId === null || !period) return;

    const run = this.service.create({
      companyName: this.catalog.findSubsidiaria(companyId)?.nombre ?? `#${companyId}`,
      storeName: this.catalog.findUbicacion(storeId)?.nombre ?? `#${storeId}`,
      periodStart: toIsoDate(period[0]),
      periodEnd: toIsoDate(period[1]),
    });
    this.closeNewModal();
    this.router.navigate(['/conciliacion', run.id, 'proceso']);
  }
}
