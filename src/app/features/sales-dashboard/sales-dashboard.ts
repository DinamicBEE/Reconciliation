import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { Sparkline } from '../../shared/components/sparkline/sparkline';
import { SaleStatusTag } from '../../shared/components/sale-status-tag/sale-status-tag';
import { MatchStatusTag } from '../../shared/components/match-status-tag/match-status-tag';
import { TENDER_MEDIA_LABEL } from '../../shared/models/reconciliation-item.model';
import { Sale } from '../../shared/models/sale.model';
import { SalesPeriod, SalesDashboardService } from './data/sales-dashboard.service';
import { saleSubtotal, saleTaxAmount, saleTaxableBase, saleTotal as computeSaleTotal } from './data/sale.util';

@Component({
  selector: 'app-sales-dashboard',
  imports: [
    CommonModule,
    FormsModule,
    NzCardModule,
    NzTableModule,
    NzRadioModule,
    NzDrawerModule,
    Sparkline,
    SaleStatusTag,
    MatchStatusTag,
  ],
  providers: [SalesDashboardService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-dashboard.html',
  styleUrl: './sales-dashboard.scss',
})
export class SalesDashboard {
  protected readonly service = inject(SalesDashboardService);
  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;

  protected readonly periodOptions: { value: SalesPeriod; label: string }[] = [
    { value: 'day', label: 'Hoy' },
    { value: 'month', label: 'Este mes' },
  ];

  // Desglose financiero completo de la venta abierta en el Drawer — un solo
  // computed para no repetir las llamadas a sale.util en la plantilla.
  protected readonly selectedSaleBreakdown = computed(() => {
    const sale = this.service.selectedSale();
    if (!sale) return null;
    return {
      subtotal: saleSubtotal(sale),
      taxableBase: saleTaxableBase(sale),
      taxAmount: saleTaxAmount(sale),
      total: computeSaleTotal(sale),
    };
  });

  protected onPeriodChange(value: SalesPeriod): void {
    this.service.setPeriod(value);
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

  // Expuesto para la tabla — las plantillas no pueden llamar funciones de
  // módulo importadas directamente, solo miembros del componente.
  protected saleTotal(sale: Sale): number {
    return computeSaleTotal(sale);
  }
}
