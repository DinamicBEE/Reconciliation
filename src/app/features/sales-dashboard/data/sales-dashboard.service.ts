import { Injectable, computed, signal } from '@angular/core';
import { Sale } from '../../../shared/models/sale.model';
import { MOCK_SALES } from './sales-mock.data';
import { saleTotal } from './sale.util';

export type SalesPeriod = 'day' | 'month';

// Misma referencia de "hoy" que tender-detail (ver design-system MASTER.md,
// "Convención: hoy sin backend") — cada feature define la suya, no hay una
// global compartida todavía (solo 2 consumidores).
export const APP_TODAY_ISO = '2026-08-27';
const APP_TODAY_MONTH = APP_TODAY_ISO.slice(0, 7); // '2026-08'

@Injectable()
export class SalesDashboardService {
  private readonly sales = signal<Sale[]>(MOCK_SALES);

  readonly period = signal<SalesPeriod>('day');
  readonly selectedSale = signal<Sale | null>(null);

  // La tabla siempre muestra las ventas de HOY, independiente del toggle de
  // periodo de los KPI (ese toggle solo afecta las sumas de arriba).
  readonly todaySales = computed(() => this.sales().filter((s) => s.date === APP_TODAY_ISO));

  private readonly monthSales = computed(() =>
    this.sales().filter((s) => s.date.startsWith(APP_TODAY_MONTH)),
  );

  private readonly scopedSales = computed(() =>
    this.period() === 'day' ? this.todaySales() : this.monthSales(),
  );

  readonly summary = computed(() => {
    const list = this.scopedSales().filter((s) => s.status === 'completada');
    const totalAmount = list.reduce((sum, s) => sum + saleTotal(s), 0);
    const count = list.length;
    return {
      totalAmount,
      count,
      avgTicket: count ? totalAmount / count : 0,
    };
  });

  // Serie de 7 días (suma diaria, ventas completadas) para el sparkline del
  // KPI de "Total vendido" — no depende del toggle día/mes, siempre es la
  // tendencia reciente.
  readonly dailyTrend = computed(() => {
    const byDate = new Map<string, number>();
    for (const sale of this.sales()) {
      if (sale.status !== 'completada') continue;
      byDate.set(sale.date, (byDate.get(sale.date) ?? 0) + saleTotal(sale));
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([, value]) => value);
  });

  setPeriod(period: SalesPeriod): void {
    this.period.set(period);
  }

  openSale(sale: Sale): void {
    this.selectedSale.set(sale);
  }

  closeSale(): void {
    this.selectedSale.set(null);
  }
}
