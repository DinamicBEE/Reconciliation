import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { AuthService } from '../../../core/auth/auth.service';

// `GET /sales/catalogs/tender-media` — medios de pago por código del POS.
// `pendingReview = true`: el código llegó en una venta sin estar sembrado y el
// equipo aún no lo revisa.
export interface TenderMediaOption {
  id: number;
  code: string;
  description: string;
  pendingReview: boolean;
}

// `GET /sales/catalogs/reconciliation-statuses` — en el orden del catálogo.
export interface ReconciliationStatusOption {
  id: number;
  code: string;
  description: string;
}

/**
 * Combos de filtros del Resumen de venta servidos por el Core Service
 * (Guia_Integracion_Frontend §7.2): medios de pago y estados de conciliación.
 * El `id` de cada opción es el valor que recibirá `GET /sales` en sus filtros
 * `tenderMedia` y `status` (ids, no códigos ni nombres).
 *
 * Exigen `view_dashboard`: sin ese permiso no se piden (darían 403). Las
 * subsidiarias y ubicaciones/tiendas NO salen de aquí: se llenan con las listas
 * que trae el login (`CatalogService`). `GET /sales/catalogs/stores` no se usa a
 * propósito (decisión de producto, ver docs/analisis-front-vs-back-dev).
 *
 * Carga perezosa (`ensureLoaded`, la llama `SalesDashboard`), una vez por sesión;
 * cada catálogo por separado. Se limpian al cerrar sesión. El aviso de error lo
 * da `httpErrorAlertInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class SalesCatalogService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessControlService);
  private readonly apiUrl = environment.apiUrl;

  readonly tenderMedia = signal<readonly TenderMediaOption[]>([]);
  readonly reconciliationStatuses = signal<readonly ReconciliationStatusOption[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  private tenderMediaLoaded = false;
  private statusesLoaded = false;
  private pending = 0;

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) untracked(() => this.clear());
    });
  }

  ensureLoaded(): void {
    if (!this.access.hasPermission('view_dashboard')) return;
    if (!this.tenderMediaLoaded) {
      this.fetch<TenderMediaOption>('tender-media', (list) => {
        this.tenderMedia.set(list);
        this.tenderMediaLoaded = true;
      });
    }
    if (!this.statusesLoaded) {
      this.fetch<ReconciliationStatusOption>('reconciliation-statuses', (list) => {
        this.reconciliationStatuses.set(list);
        this.statusesLoaded = true;
      });
    }
  }

  findTenderMedia(id: number): TenderMediaOption | null {
    return this.tenderMedia().find((option) => option.id === id) ?? null;
  }

  findReconciliationStatus(id: number): ReconciliationStatusOption | null {
    return this.reconciliationStatuses().find((option) => option.id === id) ?? null;
  }

  private fetch<T>(path: string, apply: (list: T[]) => void): void {
    this.pending++;
    this.loading.set(true);
    this.loadFailed.set(false);
    this.http
      .get<T[]>(`${this.apiUrl}/sales/catalogs/${path}`)
      .pipe(finalize(() => this.settle()))
      .subscribe({
        next: (list) => apply(list),
        error: () => this.loadFailed.set(true),
      });
  }

  private settle(): void {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) this.loading.set(false);
  }

  private clear(): void {
    this.tenderMedia.set([]);
    this.reconciliationStatuses.set([]);
    this.tenderMediaLoaded = false;
    this.statusesLoaded = false;
    this.loadFailed.set(false);
  }
}
