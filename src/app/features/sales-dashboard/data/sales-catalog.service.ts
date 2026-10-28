import { HttpClient } from '@angular/common/http';
import { Injectable, ResourceRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Entrada de `GET /sales/catalogs/tender-media`: un medio de pago por código del POS.
 *
 * @see docs/codigo/ventas.md#catalogos-de-filtros
 */
export interface TenderMediaOption {
  id: number;
  code: string;
  description: string;
  /** `true` si el código llegó en una venta sin estar sembrado y aún no se revisa. */
  pendingReview: boolean;
  /** Código del catálogo 12 de la DIAN; `null` sin homologar, ausente en backends anteriores. */
  dianCode?: string | null;
}

/** Entrada de `GET /sales/catalogs/reconciliation-statuses`, en el orden del catálogo. */
export interface ReconciliationStatusOption {
  id: number;
  code: string;
  description: string;
}

/**
 * Combos de medios de pago y estados de conciliación de "Resumen de venta" (Guia_Integracion_Frontend §7.2).
 *
 * @remarks El `id` de cada opción es el filtro de `GET /sales`; se piden solo con `view_dashboard`.
 * @see docs/codigo/ventas.md#catalogos-de-filtros
 */
@Injectable({ providedIn: 'root' })
export class SalesCatalogService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessControlService);
  private readonly apiUrl = environment.apiUrl;

  // `true` desde la primera llamada a `ensureLoaded`.
  private readonly requested = signal(false);

  // Un `rxResource` por catálogo (ADR-0002, punto 3): al cerrar sesión `params` es
  // `undefined` y vuelven a vacío sin un `effect`.
  private readonly tenderMediaResource = this.catalogResource<TenderMediaOption>('tender-media');
  private readonly statusesResource = this.catalogResource<ReconciliationStatusOption>('reconciliation-statuses');

  readonly tenderMedia = computed(() => valueOrEmpty(this.tenderMediaResource));
  readonly reconciliationStatuses = computed(() => valueOrEmpty(this.statusesResource));
  readonly loading = computed(() => this.tenderMediaResource.isLoading() || this.statusesResource.isLoading());
  readonly loadFailed = computed(() => !!this.tenderMediaResource.error() || !!this.statusesResource.error());

  /** Pide los catálogos la primera vez; después solo reintenta los que fallaron. */
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
