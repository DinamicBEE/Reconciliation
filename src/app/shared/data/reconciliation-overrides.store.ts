import { Injectable, signal } from '@angular/core';
import { TenderMedia } from '../models/reconciliation-item.model';

function keyFor(tenderMedia: TenderMedia, date: string): string {
  return `${tenderMedia}|${date}`;
}

/**
 * Overrides manuales de "Desconciliar" por grupo medio de pago + día.
 *
 * @remarks Es `root` para sobrevivir la navegación; el servicio de la tabla es por ruta.
 * @see docs/codigo/conciliacion.md#stores-compartidos
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationOverridesStore {
  private readonly overridden = signal<Set<string>>(new Set());

  /** Fuerza el grupo a `desconciliado` aunque los montos cuadren. */
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
