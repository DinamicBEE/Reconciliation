import { SaleTransaction, SettlementTransaction } from '../../../shared/models/reconciliation-item.model';
import { MatchCandidate } from './difference-management.model';

// Antes topado a 5 — la sección "Transacciones bancarias candidatas" ahora
// tiene su propio scroll interno (máx. 5 filas visibles, ver
// difference-management.scss), así que ya no hace falta cortar la lista tan
// corto para que la pantalla no se vea larga; 20 deja margen sobre las 15
// liquidaciones "sueltas" de RAPPI del mock (ver sales-settlements.mock-data.ts)
// sin truncarlas.
const MAX_CANDIDATES = 20;

function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / msPerDay;
}

/**
 * Ordena un conjunto de liquidaciones candidatas por qué tan bien podrían
 * corresponder a una venta sin cruce limpio: primero la que el motor de
 * cálculo ya traía vinculada (si existe), luego por cercanía de monto, luego
 * por cercanía de fecha. Función pura — el filtrado de qué liquidaciones
 * entran al pool (excluir las ya cruzadas 1:1 con otra orden, agregar las
 * importadas por CSV) lo hace el service, no esta función.
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
