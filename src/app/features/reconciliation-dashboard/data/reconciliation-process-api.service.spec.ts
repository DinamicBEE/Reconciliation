import { TestBed } from '@angular/core/testing';
import { BankStatementSummary } from './bank-statement.util';
import {
  ReconciliationProcessApi,
  SIMULATED_VALIDATION_MS,
  SubmitBankStatementResponse,
} from './reconciliation-process-api.service';
import { MOCK_RECONCILIATION_RESULT } from './reconciliation-result.mock-data';

const SUMMARY: BankStatementSummary = {
  totalRecords: 10,
  totalAmount: 1500.5,
  dateFrom: '2026-07-02',
  dateTo: '2026-07-06',
};

describe('ReconciliationProcessApi', () => {
  let api: ReconciliationProcessApi;

  beforeEach(() => {
    vi.useFakeTimers();
    api = TestBed.inject(ReconciliationProcessApi);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('simula una espera de 10 segundos', () => {
    expect(SIMULATED_VALIDATION_MS).toBe(10_000);
  });

  it('no emite antes de 10 s y emite { runId, accepted: true, result } a los 10 s', () => {
    const next = vi.fn();
    const complete = vi.fn();
    api.submitBankStatement('CON-0007', 'banco.xlsx', SUMMARY).subscribe({ next, complete });

    vi.advanceTimersByTime(SIMULATED_VALIDATION_MS - 1);
    expect(next).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({
      runId: 'CON-0007',
      accepted: true,
      result: MOCK_RECONCILIATION_RESULT,
    } satisfies SubmitBankStatementResponse);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('devuelve el runId recibido y el resultado simulado (KPIs y líneas)', () => {
    let response: SubmitBankStatementResponse | undefined;
    api.submitBankStatement('CON-0042', 'otro.xlsx', SUMMARY).subscribe((r) => (response = r));

    vi.advanceTimersByTime(SIMULATED_VALIDATION_MS);

    expect(response?.runId).toBe('CON-0042');
    expect(response?.accepted).toBe(true);
    expect(response?.result).toBe(MOCK_RECONCILIATION_RESULT);
    expect(response?.result.rows.length).toBe(response?.result.total);
    expect(response?.result.kpis.coincidencias).toBeDefined();
    expect(response?.result.kpis.diferencias).toBeDefined();
    expect(response?.result.kpis.sinCoincidencias).toBeDefined();
  });

  it('no emite si se cancela la suscripción antes de tiempo', () => {
    const next = vi.fn();
    const sub = api.submitBankStatement('CON-0007', 'banco.xlsx', SUMMARY).subscribe(next);

    vi.advanceTimersByTime(5000);
    sub.unsubscribe();
    vi.advanceTimersByTime(SIMULATED_VALIDATION_MS);

    expect(next).not.toHaveBeenCalled();
  });

  it('cada llamada tiene su propio temporizador', () => {
    const first = vi.fn();
    const second = vi.fn();
    api.submitBankStatement('A', 'a.xlsx', SUMMARY).subscribe(first);
    vi.advanceTimersByTime(4000);
    api.submitBankStatement('B', 'b.xlsx', SUMMARY).subscribe(second);

    vi.advanceTimersByTime(6000);
    expect(first).toHaveBeenCalledWith({ runId: 'A', accepted: true, result: MOCK_RECONCILIATION_RESULT });
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);
    expect(second).toHaveBeenCalledWith({ runId: 'B', accepted: true, result: MOCK_RECONCILIATION_RESULT });
  });
});
