import { SettlementTransaction } from '../../../shared/models/reconciliation-item.model';

/** Origen de una liquidación seleccionada: `backend` la vinculó el motor de cruce; `manual`, un analista. */
export type MatchOrigin = 'backend' | 'manual';

/** Liquidación candidata a cruzarse con la venta de la orden en pantalla. */
export interface MatchCandidate {
  settlement: SettlementTransaction;
  /** El motor ya la traía vinculada al entrar; fija el origen inicial y no cambia al tocarla. */
  suggestedByBackend: boolean;
}
