import { Injectable, computed, signal } from '@angular/core';
import { MatchStatus, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { MOCK_SALES, MOCK_SETTLEMENTS } from './tender-detail-mock.data';
import { crossMatchTransactions } from './cross-match.util';

export type MatchStatusFilter = MatchStatus | 'all';

// Referencia de "hoy" para esta app sin backend — no se usa el reloj real
// (correría desalineado con las fechas de los datos mock, que están fijas
// en agosto de 2026). El día que exista API, esto lo resuelve el servidor.
export const APP_TODAY_ISO = '2026-08-27';

@Injectable()
export class TenderDetailService {
  private readonly tenderMediaSignal = signal<TenderMedia | null>(null);
  readonly tenderMedia = this.tenderMediaSignal.asReadonly();

  readonly dateFilter = signal<string>(APP_TODAY_ISO);
  readonly statusFilter = signal<MatchStatusFilter>('all');

  private readonly matches = computed(() => {
    const tenderMedia = this.tenderMediaSignal();
    if (!tenderMedia) return [];
    return crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]);
  });

  // Todo lo que corresponde al día en scope (hoy, o la fecha de la línea
  // desde la que se entró) — la card resumen y la tabla parten de aquí.
  private readonly dateScopedMatches = computed(() => {
    const date = this.dateFilter();
    return this.matches().filter((m) => m.date === date);
  });

  readonly filteredMatches = computed(() => {
    const filter = this.statusFilter();
    const dayMatches = this.dateScopedMatches();
    return filter === 'all' ? dayMatches : dayMatches.filter((m) => m.status === filter);
  });

  // Resumen global del día — suma de las órdenes, independiente del filtro
  // de estado de la tabla (el filtro solo acota qué filas se VEN, no lo que
  // se suma en el resumen).
  readonly summary = computed(() => {
    const dayMatches = this.dateScopedMatches();
    const pending = dayMatches.filter((m) => m.status === 'sale_only');
    const attention = dayMatches.filter(
      (m) => m.status === 'amount_mismatch' || m.status === 'settlement_only',
    );

    const totalSold = dayMatches.reduce((sum, m) => sum + (m.sale?.amount ?? 0), 0);
    const totalSettled = dayMatches.reduce((sum, m) => sum + (m.settlement?.amount ?? 0), 0);

    return {
      totalSold,
      totalSettled,
      difference: totalSold - totalSettled,
      pendingAmount: pending.reduce((sum, m) => sum + (m.sale?.amount ?? 0), 0),
      attentionAmount: attention.reduce((sum, m) => sum + Math.abs(m.difference), 0),
    };
  });

  setTenderMedia(tenderMedia: TenderMedia): void {
    this.tenderMediaSignal.set(tenderMedia);
  }

  setDateFilter(date: string): void {
    this.dateFilter.set(date);
  }

  setStatusFilter(filter: MatchStatusFilter): void {
    this.statusFilter.set(filter);
  }
}
