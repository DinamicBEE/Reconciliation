import { Injectable, signal } from '@angular/core';
import { TenderMedia } from '../models/reconciliation-item.model';

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
 * Matches manuales confirmados en "Gestión de diferencias". No hay backend
 * todavía — `DifferenceManagementService` y `ReconciliationService` son
 * provistos por ruta (una instancia nueva cada vez que se entra al feature),
 * así que sin este store `root` la tabla de "Conciliación" no tendría forma
 * de enterarse de un match recién guardado al volver a `/conciliacion` sin
 * recargar la página.
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
