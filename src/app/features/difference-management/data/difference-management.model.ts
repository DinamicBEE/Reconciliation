import { SettlementTransaction } from '../../../shared/models/reconciliation-item.model';

// Específico de esta pantalla (no sube a shared/models — ver MASTER.md,
// "shared solo si un segundo feature lo necesita").

// backend: el motor de cálculo ya había vinculado esta liquidación a la
//   orden (mismo orderId) antes de que un humano interviniera.
// manual: un analista la seleccionó a mano en esta pantalla.
export type MatchOrigin = 'backend' | 'manual';

export interface MatchCandidate {
  settlement: SettlementTransaction;
  // true si el motor de cálculo ya la traía vinculada al entrar a la
  // pantalla — determina el origen inicial en el Map de selección
  // (DifferenceManagementService), no cambia aunque el usuario la toque.
  suggestedByBackend: boolean;
}
