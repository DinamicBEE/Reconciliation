import { Injectable, Signal, computed, inject, linkedSignal, signal } from '@angular/core';
import { SettlementTransaction, TenderMedia, TransactionMatch } from '../../../shared/models/reconciliation-item.model';
import { MOCK_SALES, MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { crossMatchTransactions } from '../../../shared/utils/cross-match.util';
import { ResolvedMatchesStore } from '../../../shared/data/resolved-matches.store';
import { findMatchCandidates } from './candidate-match.util';
import { MatchCandidate, MatchOrigin } from './difference-management.model';

/** Payload que se enviaría al backend al confirmar el match de una orden. */
export interface SaveResult {
  orderId: string;
  matchedSettlementIds: string[];
  settledAmount: number;
  note: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Estado de la resolución manual de una orden: candidatos, selección, nota y guardado.
 *
 * @remarks Se provee en el componente; el estado se reinicia al cambiar de orden.
 * @see docs/codigo/diferencias.md#pantalla
 */
@Injectable()
export class DifferenceManagementService {
  private readonly resolvedMatches = inject(ResolvedMatchesStore);

  // Signals de la ruta entregados una vez por `bindOrder`; todo se deriva de ellos (ADR-0002, punto 6).
  private readonly source = signal<{ tenderMedia: Signal<TenderMedia | null>; orderId: Signal<string | null> } | null>(null);
  private readonly tenderMediaSignal = computed(() => this.source()?.tenderMedia() ?? null);
  private readonly orderIdSignal = computed(() => this.source()?.orderId() ?? null);
  // Cambia solo al pasar a otra orden: reinicia la sesión de resolución.
  private readonly orderKey = computed(() => `${this.tenderMediaSignal() ?? ''}|${this.orderIdSignal() ?? ''}`);

  private readonly importedSettlements = linkedSignal<string, SettlementTransaction[]>({
    source: this.orderKey,
    computation: () => [],
  });

  // settlement.id -> origen; solo guarda las seleccionadas. Con `amount_mismatch`
  // arranca con la liquidación sugerida por el motor.
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

  private readonly importErrorsState = linkedSignal<string, string[]>({ source: this.orderKey, computation: () => [] });
  /** Errores por línea de la última importación de CSV. */
  readonly importErrors = this.importErrorsState.asReadonly();
  /** Liquidaciones importadas por CSV en esta sesión. */
  readonly importedCount = computed(() => this.importedSettlements().length);

  /**
   * Orden en pantalla, calculada con el mismo motor de cruce que "Detalle por tender media".
   *
   * @see docs/codigo/conciliacion.md#cruce-de-transacciones
   */
  readonly order = computed<TransactionMatch | null>(() => {
    const tenderMedia = this.tenderMediaSignal();
    const orderId = this.orderIdSignal();
    if (!tenderMedia || !orderId) return null;
    return this.crossMatchFor(tenderMedia).find((m) => m.orderId === orderId) ?? null;
  });

  // Liquidaciones del tender, sin las de órdenes ya cruzadas limpiamente, más las importadas por CSV.
  // Ver docs/codigo/diferencias.md#candidatos
  private readonly candidatePool = computed<SettlementTransaction[]>(() => {
    const tenderMedia = this.tenderMediaSignal();
    if (!tenderMedia) return [];

    // Por `orderId`: una orden puede liquidarse en varios depósitos y todos quedan fuera.
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

  /** Suma en vivo de las liquidaciones seleccionadas (no el `settlement` original de la orden). */
  readonly selectedSettledAmount = computed(() => {
    const selectedIds = this.selection();
    let sum = 0;
    for (const candidate of this.candidates()) {
      if (selectedIds.has(candidate.settlement.id)) sum += candidate.settlement.amount;
    }
    return round2(sum);
  });

  readonly selectedDifference = computed(() => round2((this.order()?.sale?.amount ?? 0) - this.selectedSettledAmount()));

  private crossMatchFor(tenderMedia: TenderMedia): TransactionMatch[] {
    return crossMatchTransactions(MOCK_SALES[tenderMedia], MOCK_SETTLEMENTS[tenderMedia]);
  }

  /**
   * Conecta el servicio a los signals de la ruta; el componente lo llama una vez en su constructor.
   *
   * @remarks Al cambiar de orden, importados, nota y selección se reinician (`linkedSignal` sobre la orden).
   */
  bindOrder(tenderMedia: Signal<TenderMedia | null>, orderId: Signal<string | null>): void {
    this.source.set({ tenderMedia, orderId });
  }

  setImportErrors(errors: string[]): void {
    this.importErrorsState.set(errors);
  }

  importSettlements(rows: SettlementTransaction[]): void {
    this.importedSettlements.update((current) => [...current, ...rows]);
  }

  /** Selecciona o deselecciona una liquidación; toda selección hecha aquí queda como `manual`. */
  toggleCandidate(settlementId: string): void {
    this.selection.update((current) => {
      const next = new Map(current);
      if (next.has(settlementId)) {
        next.delete(settlementId);
      } else {
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

  /**
   * Arma el payload del match y lo registra en {@link ResolvedMatchesStore}; no llama al backend.
   *
   * @returns El payload, o `null` si no hay orden o `canSave` es falso.
   * @see docs/codigo/diferencias.md#guardado
   */
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
