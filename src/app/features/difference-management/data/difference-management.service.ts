import { Injectable, computed, inject, signal } from '@angular/core';
import { SettlementTransaction, TenderMedia, TransactionMatch } from '../../../shared/models/reconciliation-item.model';
import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import { ResolvedMatchesStore } from '../../../shared/data/resolved-matches.store';
import { findMatchCandidates } from './candidate-match.util';
import { MatchCandidate, MatchOrigin } from './difference-management.model';

export interface SaveResult {
  orderId: string;
  matchedSettlementIds: string[];
  settledAmount: number;
  note: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class DifferenceManagementService {
  private readonly resolvedMatches = inject(ResolvedMatchesStore);

  private readonly tenderMediaSignal = signal<TenderMedia | null>(null);
  private readonly orderIdSignal = signal<string | null>(null);
  private readonly importedSettlements = signal<SettlementTransaction[]>([]);

  // settlement.id -> origen. Solo contiene entradas SELECCIONADAS — la
  // ausencia de una liquidación aquí significa "no seleccionada".
  private readonly selection = signal<Map<string, MatchOrigin>>(new Map());

  readonly note = signal('');

  // La orden en cuestión, armada con el mismo motor de cruce que
  // "Detalle por tender media" (ver cross-match.util.ts) — una sola fuente
  // de verdad de qué es sale_only/amount_mismatch/etc.
  readonly order = computed<TransactionMatch | null>(() => {
    const tenderMedia = this.tenderMediaSignal();
    const orderId = this.orderIdSignal();
    if (!tenderMedia || !orderId) return null;
    return this.crossMatchFor(tenderMedia).find((m) => m.orderId === orderId) ?? null;
  });

  // Pool de liquidaciones candidatas: todas las del tender media MENOS las ya
  // cruzadas 1:1 limpiamente con OTRA orden (esas están resueltas, no se
  // pueden "robar"), más las que se hayan importado por CSV en esta sesión.
  private readonly candidatePool = computed<SettlementTransaction[]>(() => {
    const tenderMedia = this.tenderMediaSignal();
    if (!tenderMedia) return [];

    // Filtra por `orderId`, no por el id de la fila representativa de
    // `TransactionMatch.settlement` — una orden puede liquidarse en MÁS de
    // un depósito (ver cross-match.util.ts), así que excluir solo esa fila
    // dejaría las demás liquidaciones de esa misma orden "sueltas" en el
    // pool, disponibles para robárselas a otra orden aunque ya estén
    // cuadradas.
    const cleanlyMatchedOrderIds = new Set(
      this.crossMatchFor(tenderMedia)
        .filter((m) => m.status === 'matched')
        .map((m) => m.orderId),
    );

    return [
      ...MOCK_SETTLEMENTS[tenderMedia].filter((s) => !cleanlyMatchedOrderIds.has(s.orderId)),
      ...this.importedSettlements(),
    ];
  });

  readonly candidates = computed<MatchCandidate[]>(() => {
    const order = this.order();
    if (!order?.sale) return [];
    return findMatchCandidates(order.sale, this.candidatePool(), order.settlement?.id ?? null);
  });

  readonly selectedCount = computed(() => this.selection().size);
  readonly canSave = computed(() => this.selectedCount() > 0 && this.note().trim().length > 0);

  // "Monto liquidado"/"Diferencia" en vivo para el Card de resumen — la suma
  // de lo YA seleccionado, no el `settlement` original de la orden (que
  // puede no coincidir con lo que el analista termine eligiendo aquí).
  readonly selectedSettledAmount = computed(() => {
    const selectedIds = this.selection();
    let sum = 0;
    for (const candidate of this.candidates()) {
      if (selectedIds.has(candidate.settlement.id)) sum += candidate.settlement.amount;
    }
    return round2(sum);
  });

  readonly selectedDifference = computed(() => round2((this.order()?.sale?.amount ?? 0) - this.selectedSettledAmount()));

  // Función pura de cruce, cacheada implícitamente por `computed` — se
  // recalcula solo cuando cambia el tender media en scope.
  private crossMatchFor(tenderMedia: TenderMedia): TransactionMatch[] {
    return crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]);
  }

  // Efecto de entrada a la pantalla (llamado desde el componente, no desde un
  // `effect` interno del service — mismo patrón que
  // ReconciliationService.setStatusFilter/etc: setters explícitos, no
  // reactividad implícita). Reinicia todo el estado de la sesión de
  // resolución: importados, nota y selección.
  setOrder(tenderMedia: TenderMedia, orderId: string): void {
    this.tenderMediaSignal.set(tenderMedia);
    this.orderIdSignal.set(orderId);
    this.importedSettlements.set([]);
    this.note.set('');

    const order = this.crossMatchFor(tenderMedia).find((m) => m.orderId === orderId) ?? null;
    const suggestedId = order?.status === 'amount_mismatch' ? (order.settlement?.id ?? null) : null;
    this.selection.set(suggestedId ? new Map([[suggestedId, 'backend']]) : new Map());
  }

  importSettlements(rows: SettlementTransaction[]): void {
    this.importedSettlements.update((current) => [...current, ...rows]);
  }

  toggleCandidate(settlementId: string): void {
    this.selection.update((current) => {
      const next = new Map(current);
      if (next.has(settlementId)) {
        next.delete(settlementId);
      } else {
        // Cualquier toggle hecho por el usuario cuenta como manual, incluso
        // si estaba seleccionada por el backend — el humano acaba de
        // intervenir sobre ella.
        next.set(settlementId, 'manual');
      }
      return next;
    });
  }

  isSelected(settlementId: string): boolean {
    return this.selection().has(settlementId);
  }

  originOf(settlementId: string): MatchOrigin | null {
    return this.selection().get(settlementId) ?? null;
  }

  setNote(value: string): void {
    this.note.set(value);
  }

  // No hay backend todavía — esto arma el payload que se enviaría Y deja
  // constancia en `ResolvedMatchesStore` (root, sobrevive la navegación) para
  // que la fila agrupada de "Conciliación" refleje el match al volver ahí.
  // El componente decide qué hacer con el resultado (confirmación + toast +
  // navegación).
  save(): SaveResult | null {
    const order = this.order();
    const tenderMedia = this.tenderMediaSignal();
    if (!order || !tenderMedia || !this.canSave()) return null;

    const result: SaveResult = {
      orderId: order.orderId,
      matchedSettlementIds: [...this.selection().keys()],
      settledAmount: this.selectedSettledAmount(),
      note: this.note().trim(),
    };

    this.resolvedMatches.resolve(tenderMedia, order.orderId, {
      settledAmount: result.settledAmount,
      matchedSettlementIds: result.matchedSettlementIds,
      note: result.note,
      resolvedAt: new Date().toISOString(),
    });

    return result;
  }
}
