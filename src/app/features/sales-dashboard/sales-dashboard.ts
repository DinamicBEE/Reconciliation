import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { SaleStatusTag } from '../../shared/components/sale-status-tag/sale-status-tag';
import { MatchStatusTag } from '../../shared/components/match-status-tag/match-status-tag';
import { ReconciliationStatusTag } from '../../shared/components/reconciliation-status-tag/reconciliation-status-tag';
import { ReconciliationStatus, TENDER_MEDIA_LABEL } from '../../shared/models/reconciliation-item.model';
import { PERSON_TYPE_LABEL, Sale, STORE_LABEL, TAX_REGIME_LABEL } from '../../shared/models/sale.model';
import {
  DateRangeFilter,
  SalesDashboardService,
  StatusFilter,
  StoreFilter,
  TenderMediaFilter,
} from './data/sales-dashboard.service';
import {
  dianQueryUrl as computeDianQueryUrl,
  saleReconciliationStatus,
  saleSubtotal as computeSaleSubtotal,
  saleTaxAmount as computeSaleTaxAmount,
  saleTaxableBase,
  saleTotal as computeSaleTotal,
} from './data/sale.util';
import { buildSalesCsv } from './data/sale-export.util';

@Component({
  selector: 'app-sales-dashboard',
  imports: [
    CommonModule,
    FormsModule,
    NzCardModule,
    NzTableModule,
    NzSelectModule,
    NzDatePickerModule,
    NzInputModule,
    NzDrawerModule,
    NzButtonModule,
    NzTooltipModule,
    SaleStatusTag,
    MatchStatusTag,
    ReconciliationStatusTag,
  ],
  providers: [SalesDashboardService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-dashboard.html',
  styleUrl: './sales-dashboard.scss',
})
export class SalesDashboard {
  protected readonly service = inject(SalesDashboardService);
  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;
  protected readonly storeLabel = STORE_LABEL;
  protected readonly personTypeLabel = PERSON_TYPE_LABEL;
  protected readonly taxRegimeLabel = TAX_REGIME_LABEL;

  protected readonly storeOptions: { value: StoreFilter; label: string }[] = [
    { value: 'all', label: 'Todas las tiendas' },
    { value: 'polanco', label: 'Sucursal Polanco' },
    { value: 'condesa', label: 'Sucursal Condesa' },
    { value: 'roma', label: 'Sucursal Roma' },
    { value: 'centro', label: 'Sucursal Centro' },
  ];

  // Mismo vocabulario/orden que reconciliation-dashboard.ts (statusOptions)
  // — "los mismos estados que los de la conciliación".
  protected readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'conciliado', label: 'Conciliado' },
    { value: 'desconciliado', label: 'Desconciliado' },
    { value: 'por_conciliar', label: 'Por conciliar' },
  ];

  protected readonly tenderMediaOptions: { value: TenderMediaFilter; label: string }[] = [
    { value: 'all', label: 'Todos los medios' },
    { value: 'bbva', label: 'BBVA' },
    { value: 'rappi', label: 'Rappi' },
    { value: 'didi_food', label: 'DiDi Food' },
    { value: 'efectivo', label: 'Efectivo' },
  ];

  // Mismo texto que `statusOptions` (sin 'all') — como Record en vez de array
  // porque así lo consume `buildSalesCsv()`, igual que `storeLabel`/
  // `tenderMediaLabel` de arriba.
  protected readonly statusLabel: Record<ReconciliationStatus, string> = {
    conciliado: 'Conciliado',
    desconciliado: 'Desconciliado',
    por_conciliar: 'Por conciliar',
  };

  // Desglose financiero completo de la venta abierta en el Drawer — un solo
  // computed para no repetir las llamadas a sale.util en la plantilla.
  protected readonly selectedSaleBreakdown = computed(() => {
    const sale = this.service.selectedSale();
    if (!sale) return null;
    return {
      subtotal: computeSaleSubtotal(sale),
      taxableBase: saleTaxableBase(sale),
      taxAmount: computeSaleTaxAmount(sale),
      total: computeSaleTotal(sale),
    };
  });

  protected onDateRangeChange(value: [Date, Date] | null): void {
    this.service.setDateRange(value as DateRangeFilter);
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

  protected onRowClick(sale: Sale): void {
    this.service.openSale(sale);
  }

  protected itemSubtotal(quantity: number, unitPrice: number): number {
    return quantity * unitPrice;
  }

  // Suma de sale.payments — solo se muestra en la plantilla cuando hay más
  // de un pago (pago mixto), como verificación de que los montos cuadran.
  protected paymentsTotal(sale: Sale): number {
    return sale.payments.reduce((sum, payment) => sum + payment.amount, 0);
  }

  // Expuestos para la tabla — las plantillas no pueden llamar funciones de
  // módulo importadas directamente, solo miembros del componente.
  protected saleSubtotal(sale: Sale): number {
    return computeSaleSubtotal(sale);
  }

  protected saleTaxAmount(sale: Sale): number {
    return computeSaleTaxAmount(sale);
  }

  protected saleTotal(sale: Sale): number {
    return computeSaleTotal(sale);
  }

  protected saleStatus(sale: Sale): ReconciliationStatus {
    return saleReconciliationStatus(sale);
  }

  // Enlace de consulta del CUFE en el catálogo público de la DIAN —
  // "Documento electrónico" del Drawer ("Consultar en la DIAN").
  protected dianQueryUrl(sale: Sale): string {
    return computeDianQueryUrl(sale.invoice);
  }

  // Botón "Exportar" del toolbar — exporta lo que los 5 filtros están
  // mostrando (`filteredSales`, no solo la página actual de la tabla) como
  // CSV, que Excel abre igual de bien que un .xlsx para esta tabla sin
  // formato/fórmulas. BOM UTF-8 al inicio del Blob para que Excel respete los
  // acentos (nombres de cliente, "Sucursal ...") al abrirlo directamente.
  protected exportCsv(): void {
    const csv = buildSalesCsv(this.service.filteredSales(), {
      store: this.storeLabel,
      tenderMedia: this.tenderMediaLabel,
      status: this.statusLabel,
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const link = document.createElement('a');
    link.href = url;
    link.download = `resumen-de-venta_${stamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
