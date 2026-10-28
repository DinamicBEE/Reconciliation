import { HttpClient } from '@angular/common/http';
import { Injectable, ResourceRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';

/** Opción de `GET /catalogs/ubicaciones` con la subsidiaria a la que pertenece. */
export interface UbicacionCatalogEntry extends CatalogEntry {
  subsidiariaId: number;
}

/**
 * Los 6 catálogos organizacionales del Core Service (Guia_Integracion_Frontend §7.1).
 *
 * @remarks Coincide con el campo de `UserDetailDto` (`cargos`) y, con sufijo `Ids`, con el de `PATCH /users/{id}`.
 */
export type OrganizationCatalogKind = 'subsidiarias' | 'ubicaciones' | 'cargos' | 'puestos' | 'departamentos' | 'areas';

/** Todos los {@link OrganizationCatalogKind}, en orden de presentación. */
export const ORGANIZATION_CATALOG_KINDS: readonly OrganizationCatalogKind[] = [
  'subsidiarias',
  'ubicaciones',
  'cargos',
  'puestos',
  'departamentos',
  'areas',
];

/**
 * Catálogos organizacionales completos (`GET /catalogs/...`) para asignar organización a una persona.
 *
 * @remarks Distinto de {@link CatalogService} (lo accesible a la sesión). Carga perezosa, un recurso por catálogo.
 * @see docs/codigo/catalogos.md#catalogos-organizacionales
 */
@Injectable({ providedIn: 'root' })
export class OrganizationCatalogService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  // `true` desde la primera llamada a `ensureLoaded`.
  private readonly requested = signal(false);

  // Un `rxResource` por catálogo (ADR-0002, punto 3): al cerrar sesión `params` es
  // `undefined` y el valor vuelve a `[]` sin un `effect`.
  private readonly resources = Object.fromEntries(
    ORGANIZATION_CATALOG_KINDS.map((kind) => [
      kind,
      rxResource<readonly CatalogEntry[], OrganizationCatalogKind | undefined>({
        params: () => (this.requested() && this.auth.isAuthenticated() ? kind : undefined),
        stream: ({ params }) => this.http.get<CatalogEntry[]>(`${this.apiUrl}/catalogs/${params}`),
        defaultValue: [],
      }),
    ]),
  ) as Record<OrganizationCatalogKind, ResourceRef<readonly CatalogEntry[]>>;

  readonly subsidiarias = computed(() => this.options('subsidiarias'));
  readonly ubicaciones = computed(() => this.options('ubicaciones') as readonly UbicacionCatalogEntry[]);
  readonly cargos = computed(() => this.options('cargos'));
  readonly puestos = computed(() => this.options('puestos'));
  readonly departamentos = computed(() => this.options('departamentos'));
  readonly areas = computed(() => this.options('areas'));

  /** Algún catálogo con una petición en vuelo (`loading`) o fallida en el último intento (`loadFailed`). */
  readonly loading = computed(() => ORGANIZATION_CATALOG_KINDS.some((kind) => this.resources[kind].isLoading()));
  readonly loadFailed = computed(() => ORGANIZATION_CATALOG_KINDS.some((kind) => !!this.resources[kind].error()));

  /** Pide los catálogos la primera vez; después solo reintenta los que fallaron. */
  ensureLoaded(): void {
    if (!this.requested()) {
      this.requested.set(true);
      return;
    }
    for (const kind of ORGANIZATION_CATALOG_KINDS) {
      if (this.resources[kind].error()) this.resources[kind].reload();
    }
  }

  /** Vuelve a pedir los seis (p. ej. tras cargar datos nuevos en el backend). */
  reload(): void {
    if (!this.requested()) {
      this.requested.set(true);
      return;
    }
    for (const kind of ORGANIZATION_CATALOG_KINDS) this.resources[kind].reload();
  }

  /** @returns Opciones del catálogo; `[]` si no cargó o falló (usa `hasValue()`: `value()` lanza en error). */
  options(kind: OrganizationCatalogKind): readonly CatalogEntry[] {
    const resource = this.resources[kind];
    return resource.hasValue() ? resource.value() : [];
  }

  /** @returns `null` si el id no está en el catálogo cargado. */
  find(kind: OrganizationCatalogKind, id: number): CatalogEntry | null {
    return this.options(kind).find((entry) => entry.id === id) ?? null;
  }

  /** Ubicaciones de las subsidiarias indicadas; sin subsidiarias elegidas, todas. */
  ubicacionesFor(subsidiariaIds: readonly number[]): readonly UbicacionCatalogEntry[] {
    const all = this.ubicaciones();
    return subsidiariaIds.length ? all.filter((u) => subsidiariaIds.includes(u.subsidiariaId)) : all;
  }

  /**
   * Quita las ubicaciones que no pertenecen a ninguna de `subsidiariaIds` (al deseleccionar una subsidiaria).
   *
   * @returns Copia de `ubicacionIds` sin cambios si no hay subsidiarias elegidas o catálogo cargado.
   */
  pruneUbicaciones(ubicacionIds: readonly number[], subsidiariaIds: readonly number[]): number[] {
    if (!subsidiariaIds.length || !this.ubicaciones().length) return [...ubicacionIds];
    return ubicacionIds.filter((id) => {
      const ubicacion = this.ubicaciones().find((u) => u.id === id);
      return !ubicacion || subsidiariaIds.includes(ubicacion.subsidiariaId);
    });
  }
}
