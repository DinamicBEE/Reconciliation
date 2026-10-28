import { SaleTransaction, SettlementTransaction } from '../../../shared/models/reconciliation-item.model';
import { MatchCandidate } from './difference-management.model';

// Margen sobre las 15 liquidaciones sueltas de RAPPI del mock; la lista tiene scroll propio.
// Ver docs/codigo/diferencias.md#candidatos
const MAX_CANDIDATES = 20;

function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / msPerDay;
}

/**
 * Ordena las liquidaciones candidatas para una venta sin cruce limpio: primero la vinculada por
 * el motor, luego por cercanía de monto y de fecha; devuelve como máximo 20.
 *
 * @remarks Función pura: qué liquidaciones entran al pool lo decide {@link DifferenceManagementService}.
 * @param linkedSettlementId - Liquidación que el motor de cruce ya traía vinculada, o `null`.
 * @see docs/codigo/diferencias.md#candidatos
 */
export function findMatchCandidates(
  sale: SaleTransaction,
  settlementPool: SettlementTransaction[],
  linkedSettlementId: string | null,
): MatchCandidate[] {
  return settlementPool
    .map((settlement) => ({
      settlement,
      suggestedByBackend: settlement.id === linkedSettlementId,
      amountDiff: Math.abs(settlement.amount - sale.amount),
      dateDiff: daysBetween(settlement.date, sale.date),
    }))
    .sort((a, b) => {
      if (a.suggestedByBackend !== b.suggestedByBackend) return a.suggestedByBackend ? -1 : 1;
      if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
      return a.dateDiff - b.dateDiff;
    })
    .slice(0, MAX_CANDIDATES)
    .map(({ settlement, suggestedByBackend }) => ({ settlement, suggestedByBackend }));
}
