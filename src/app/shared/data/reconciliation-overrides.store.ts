import { Injectable, signal } from '@angular/core';
import { TenderMedia } from '../models/reconciliation-item.model';

function keyFor(tenderMedia: TenderMedia, date: string): string {
  return `${tenderMedia}|${date}`;
}

/**
 * "Desconciliar" (columna Acciones de "Conciliación", solo en filas
 * `conciliado`): un override manual, a nivel de GRUPO (tender media +
 * fecha, no de una orden puntual — la fila que dispara la acción ya es un
 * total agrupado, ver `group-by-tender-day.util.ts`), que fuerza el estado
 * de vuelta a `desconciliado` aunque la suma vendido/liquidado siga
 * cuadrando. Root — mismo motivo que `ResolvedMatchesStore` (sobrevive la
 * navegación aunque `ReconciliationService` sea por-ruta): sin esto, volver
 * a `/conciliacion` olvidaría el "desconciliar" con solo recargar el
 * computed.
 *
 * No hay "volver a conciliar" todavía — no se pidió, y el mock no tiene
 * backend que reconcilie de verdad; si aparece esa necesidad, agregar un
 * `resolve()` simétrico aquí, no reinventar el patrón.
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationOverridesStore {
  private readonly overridden = signal<Set<string>>(new Set());

  markDesconciliado(tenderMedia: TenderMedia, date: string): void {
    this.overridden.update((current) => {
      const next = new Set(current);
      next.add(keyFor(tenderMedia, date));
      return next;
    });
  }

  isDesconciliado(tenderMedia: TenderMedia, date: string): boolean {
    return this.overridden().has(keyFor(tenderMedia, date));
  }
}
