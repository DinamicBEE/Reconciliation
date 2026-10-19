import { HttpClient } from '@angular/common/http';
import { Injectable, ResourceRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
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

  // Se vuelve `true` la primera vez que `SalesDashboard` llama a `ensureLoaded`.
  private readonly requested = signal(false);

  // ADR-0002, punto 3: un `rxResource` por catálogo. Piden una vez solicitados,
  // con sesión y con `view_dashboard`; al cerrar sesión `params` es `undefined`
  // y vuelven a vacío sin un `effect` que los limpie.
  private readonly tenderMediaResource = this.catalogResource<TenderMediaOption>('tender-media');
  private readonly statusesResource = this.catalogResource<ReconciliationStatusOption>('reconciliation-statuses');

  readonly tenderMedia = computed(() => valueOrEmpty(this.tenderMediaResource));
  readonly reconciliationStatuses = computed(() => valueOrEmpty(this.statusesResource));
  readonly loading = computed(() => this.tenderMediaResource.isLoading() || this.statusesResource.isLoading());
  readonly loadFailed = computed(() => !!this.tenderMediaResource.error() || !!this.statusesResource.error());

  // Pide los catálogos la primera vez; después solo reintenta los que fallaron.
  ensureLoaded(): void {
    if (!this.requested()) {
      this.requested.set(true);
      return;
    }
    if (this.tenderMediaResource.error()) this.tenderMediaResource.reload();
    if (this.statusesResource.error()) this.statusesResource.reload();
  }

  findTenderMedia(id: number): TenderMediaOption | null {
    return this.tenderMedia().find((option) => option.id === id) ?? null;
  }

  findReconciliationStatus(id: number): ReconciliationStatusOption | null {
    return this.reconciliationStatuses().find((option) => option.id === id) ?? null;
  }

  private catalogResource<T>(path: string): ResourceRef<readonly T[]> {
    return rxResource<readonly T[], string | undefined>({
      params: () =>
        this.requested() && this.auth.isAuthenticated() && this.access.hasPermission('view_dashboard') ? path : undefined,
      stream: ({ params }) => this.http.get<T[]>(`${this.apiUrl}/sales/catalogs/${params}`),
      defaultValue: [],
    });
  }
}

// Un resource en error lanza al leer `value()`: se usa `hasValue()`.
function valueOrEmpty<T>(resource: ResourceRef<readonly T[]>): readonly T[] {
  return resource.hasValue() ? resource.value() : [];
}
