import { Injectable, signal } from '@angular/core';
import { TenderMedia } from '../models/reconciliation-item.model';

/** Match manual confirmado en "Gestión de diferencias" para una orden. */
export interface ResolvedMatch {
  settledAmount: number; // suma de los montos de las transacciones elegidas al guardar
  matchedSettlementIds: string[];
  note: string;
  resolvedAt: string; // ISO datetime
}

function keyFor(tenderMedia: TenderMedia, orderId: string): string {
  return `${tenderMedia}|${orderId}`;
}

/**
 * Matches manuales confirmados en "Gestión de diferencias", por medio de pago + orden.
 *
 * @remarks Es `root` porque los servicios de ambas pantallas son por ruta; no hay backend.
 * @see docs/codigo/conciliacion.md#stores-compartidos
 */
@Injectable({ providedIn: 'root' })
export class ResolvedMatchesStore {
  private readonly resolved = signal<Map<string, ResolvedMatch>>(new Map());

  resolve(tenderMedia: TenderMedia, orderId: string, match: ResolvedMatch): void {
    this.resolved.update((current) => {
      const next = new Map(current);
      next.set(keyFor(tenderMedia, orderId), match);
      return next;
    });
  }

  get(tenderMedia: TenderMedia, orderId: string): ResolvedMatch | null {
    return this.resolved().get(keyFor(tenderMedia, orderId)) ?? null;
  }
}
