import { Injectable, Signal, computed, inject, linkedSignal, signal } from '@angular/core';
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

  // Orden en pantalla: signals de la ruta que entrega el componente una sola vez
  // (`bindOrder`). Todo lo demás se deriva de ellos — sin `effect` que copie
  // parámetros de ruta en el servicio (ADR-0002, punto 6).
  private readonly source = signal<{ tenderMedia: Signal<TenderMedia | null>; orderId: Signal<string | null> } | null>(null);
  private readonly tenderMediaSignal = computed(() => this.source()?.tenderMedia() ?? null);
  private readonly orderIdSignal = computed(() => this.source()?.orderId() ?? null);
  // Cambia solo al pasar a OTRA orden: reinicia la sesión de resolución.
  private readonly orderKey = computed(() => `${this.tenderMediaSignal() ?? ''}|${this.orderIdSignal() ?? ''}`);

  private readonly importedSettlements = linkedSignal<string, SettlementTransaction[]>({
    source: this.orderKey,
    computation: () => [],
  });

  // settlement.id -> origen. Solo contiene entradas SELECCIONADAS — la
  // ausencia de una liquidación aquí significa "no seleccionada". Al entrar a
  // una orden con `amount_mismatch` arranca con la liquidación sugerida.
  private readonly selection = linkedSignal<string, Map<string, MatchOrigin>>({
    source: this.orderKey,
    computation: () => {
      const tenderMedia = this.tenderMediaSignal();
      const orderId = this.orderIdSignal();
      const order = tenderMedia && orderId ? (this.crossMatchFor(tenderMedia).find((m) => m.orderId === orderId) ?? null) : null;
      const suggestedId = order?.status === 'amount_mismatch' ? (order.settlement?.id ?? null) : null;
      return suggestedId ? new Map([[suggestedId, 'backend']]) : new Map();
    },
  });

  private readonly noteState = linkedSignal<string, string>({ source: this.orderKey, computation: () => '' });
  readonly note = this.noteState.asReadonly();

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

  // Lo llama el componente UNA vez (constructor) con los signals de su ruta. Al
  // cambiar de orden, importados, nota y selección se reinician solos
  // (`linkedSignal` sobre `orderKey`).
  bindOrder(tenderMedia: Signal<TenderMedia | null>, orderId: Signal<string | null>): void {
    this.source.set({ tenderMedia, orderId });
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
    this.noteState.set(value);
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
