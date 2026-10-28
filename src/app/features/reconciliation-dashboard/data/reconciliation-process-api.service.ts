import { Injectable } from '@angular/core';
import { Observable, map, timer } from 'rxjs';
import { BankStatementSummary } from './bank-statement.util';
import { ReconciliationResult } from './reconciliation-result.model';
import { MOCK_RECONCILIATION_RESULT } from './reconciliation-result.mock-data';

/** Espera, en milisegundos, de la respuesta simulada del paso "Validación". */
export const SIMULATED_VALIDATION_MS = 10_000;

/** Respuesta al envío del extracto: el resultado POS contra banco ya calculado. */
export interface SubmitBankStatementResponse {
  runId: string;
  accepted: true;
  result: ReconciliationResult;
}

/**
 * Envío del extracto de una conciliación al backend, simulado mientras no hay endpoint.
 *
 * @see docs/codigo/conciliacion.md#envio-y-resultado
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationProcessApi {
  /** @returns Observable que emite tras {@link SIMULATED_VALIDATION_MS} con `MOCK_RECONCILIATION_RESULT`; no falla. */
  submitBankStatement(
    runId: string,
    fileName: string,
    summary: BankStatementSummary,
  ): Observable<SubmitBankStatementResponse> {
    void fileName;
    void summary;
    return timer(SIMULATED_VALIDATION_MS).pipe(map(() => ({ runId, accepted: true as const, result: MOCK_RECONCILIATION_RESULT })));
  }
}
