import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { MatchStatusTag } from '../../shared/components/match-status-tag/match-status-tag';
import { Sparkline } from '../../shared/components/sparkline/sparkline';
import { RadialProgress } from '../../shared/components/radial-progress/radial-progress';
import { MatchStatus, TENDER_MEDIA_LABEL, TenderMedia, TransactionMatch } from '../../shared/models/reconciliation-item.model';
import { DateRangeFilter, ReconciliationService, StatusFilter, TenderMediaFilter } from './data/reconciliation.service';

// Solo estas dos requieren intervención manual (existe un lado, pero no hay
// certeza de cruce) — "Sin venta" es una anomalía del lado del banco sin una
// orden propia que gestionar, y "Cruzado" ya está resuelto. Mismo criterio
// que usaba tender-detail (retirado, ver MASTER.md).
const ACTIONABLE_STATUSES = new Set<MatchStatus>(['sale_only', 'amount_mismatch']);

@Component({
  selector: 'app-reconciliation-dashboard',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NzCardModule,
    NzTableModule,
    NzSelectModule,
    NzDatePickerModule,
    MatchStatusTag,
    Sparkline,
    RadialProgress,
  ],
  providers: [ReconciliationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reconciliation-dashboard.html',
  styleUrl: './reconciliation-dashboard.scss',
})
export class ReconciliationDashboard {
  protected readonly service = inject(ReconciliationService);
  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;

  protected readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'matched', label: 'Cruzado' },
    { value: 'sale_only', label: 'Por liquidar' },
    { value: 'amount_mismatch', label: 'Monto distinto' },
    { value: 'settlement_only', label: 'Sin venta' },
  ];

  protected readonly tenderMediaOptions: { value: TenderMediaFilter; label: string }[] = [
    { value: 'all', label: 'Todos los medios' },
    { value: 'bbva', label: 'BBVA' },
    { value: 'rappi', label: 'Rappi' },
    { value: 'didi_food', label: 'DiDi Food' },
    { value: 'efectivo', label: 'Efectivo' },
  ];

  // KPI 2 — % conciliado, comparado contra ayer.
  protected readonly reconciledPct = computed(() => {
    const trend = this.service.reconciledPctTrend();
    const today = trend.at(-1)?.value ?? 0;
    const yesterday = trend.at(-2)?.value ?? today;
    return { today, delta: today - yesterday };
  });

  // KPI 3 — monto en discrepancia, comparado contra ayer.
  protected readonly discrepancyTrendSummary = computed(() => {
    const trend = this.service.discrepancyAmountTrend();
    const today = trend.at(-1)?.value ?? 0;
    const yesterday = trend.at(-2)?.value ?? today;
    return { today, delta: today - yesterday, values: trend.map((p) => p.value) };
  });

  protected difference(item: TransactionMatch): number {
    return item.difference;
  }

  protected onStatusFilterChange(value: StatusFilter): void {
    this.service.setStatusFilter(value);
  }

  protected onTenderMediaFilterChange(value: TenderMediaFilter): void {
    this.service.setTenderMediaFilter(value);
  }

  protected onDateRangeChange(value: [Date, Date] | null): void {
    this.service.setDateRange(value as DateRangeFilter);
  }

  protected tenderLabel(tenderMedia: TenderMedia): string {
    return TENDER_MEDIA_LABEL[tenderMedia];
  }

  // Solo "Por liquidar"/"Monto distinto" abren "Gestión de diferencias" — ahí
  // se resuelve manualmente contra candidatos bancarios.
  protected isActionable(item: TransactionMatch): boolean {
    return ACTIONABLE_STATUSES.has(item.status);
  }

  protected resolveLink(item: TransactionMatch): unknown[] {
    return ['/conciliacion', item.tenderMedia, 'diferencias', item.orderId];
  }
}
