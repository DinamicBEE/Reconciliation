import { Injectable, computed, signal } from '@angular/core';
import { ReconciliationRun } from './reconciliation-run.model';

/**
 * Conciliaciones (corridas) que la sesión ya recibió del backend, por id.
 *
 * @remarks Es `root` para que la comparativa y el proceso encuentren la corrida que abrió la tabla.
 * "Desconciliar" vive solo aquí (el backend no tiene endpoint) y se superpone a lo que llega.
 * @see docs/codigo/conciliacion.md#corridas
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationRunsStore {
  private readonly byId = signal<ReadonlyMap<string, ReconciliationRun>>(new Map());
  private readonly desconciliados = signal<ReadonlySet<string>>(new Set());

  /** Corridas conocidas, de la más reciente a la más antigua (fecha de creación y, a igual fecha, id). */
  readonly runs = computed(() =>
    [...this.byId().values()]
      .map((run) => this.withLocalStatus(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id, undefined, { numeric: true })),
  );

  /** @returns La corrida con ese id, o `null` si la sesión aún no la recibió o el id está vacío. */
  find(id: string | null | undefined): ReconciliationRun | null {
    const run = id ? this.byId().get(id) : undefined;
    return run ? this.withLocalStatus(run) : null;
  }

  /** Guarda o reemplaza las corridas recibidas del backend. */
  upsert(runs: readonly ReconciliationRun[]): void {
    if (runs.length === 0) return;
    this.byId.update((current) => {
      const next = new Map(current);
      for (const run of runs) next.set(run.id, run);
      return next;
    });
  }

  /** Aplica a las corridas el "Desconciliar" de la sesión. */
  withLocalStatus(run: ReconciliationRun): ReconciliationRun {
    return this.desconciliados().has(run.id) ? { ...run, status: 'desconciliado' } : run;
  }

  /** Pasa la corrida a `desconciliado` en esta sesión; no revalida {@link canDesconciliar}, eso lo decide la tabla. */
  markDesconciliado(id: string): void {
    this.desconciliados.update((current) => new Set(current).add(id));
  }
}
