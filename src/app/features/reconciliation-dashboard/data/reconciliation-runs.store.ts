import { Injectable, computed, signal } from '@angular/core';
import { toIsoDate } from '../../../shared/utils/iso-date.util';
import { NewReconciliationRunInput, ReconciliationRun } from './reconciliation-run.model';
import { MOCK_RECONCILIATION_RUNS } from './reconciliation-runs.mock-data';

/**
 * Conciliaciones (corridas) de la sesión, en memoria (sin backend).
 *
 * @remarks Es `root` porque la tabla y la comparativa tienen servicios por ruta y deben ver la misma corrida.
 * @see docs/codigo/conciliacion.md#corridas
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationRunsStore {
  private readonly all = signal<ReconciliationRun[]>(MOCK_RECONCILIATION_RUNS);

  /** Corridas de la más reciente a la más antigua (fecha de creación y, a igual fecha, id). */
  readonly runs = computed(() =>
    [...this.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
  );

  /** @returns La corrida con ese id, o `null` si no existe o el id está vacío. */
  find(id: string | null | undefined): ReconciliationRun | null {
    return id ? (this.all().find((run) => run.id === id) ?? null) : null;
  }

  /**
   * Crea una corrida `pendiente` con el siguiente id `CON-NNNN`.
   *
   * @param now - Fecha de creación en hora local; es la fecha real, no el "hoy" fijo de los mocks.
   */
  create(input: NewReconciliationRunInput, now: Date = new Date()): ReconciliationRun {
    const run: ReconciliationRun = {
      ...input,
      id: this.nextId(),
      createdAt: toIsoDate(now),
      status: 'pendiente',
      comments: '',
    };
    this.all.update((current) => [...current, run]);
    return run;
  }

  /** Pasa la corrida a `desconciliado`; no revalida {@link canDesconciliar}, eso lo decide la tabla. */
  markDesconciliado(id: string): void {
    this.all.update((current) =>
      current.map((run) => (run.id === id ? { ...run, status: 'desconciliado' as const } : run)),
    );
  }

  private nextId(): string {
    const max = this.all().reduce((acc, run) => Math.max(acc, Number(run.id.replace(/\D/g, '')) || 0), 0);
    return `CON-${String(max + 1).padStart(4, '0')}`;
  }
}
