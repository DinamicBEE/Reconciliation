import { HttpClient } from '@angular/common/http';
import { Injectable, ResourceRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';

// Opción de `GET /catalogs/ubicaciones`: además del nombre trae la subsidiaria a
// la que pertenece, para filtrar las ubicaciones según las subsidiarias elegidas.
export interface UbicacionCatalogEntry extends CatalogEntry {
  subsidiariaId: number;
}

// Los 6 catálogos organizacionales del Core Service (Guia_Integracion_Frontend
// §7.1). La llave es también el nombre del campo de `UserDetailDto` que trae lo
// asignado a la persona (`cargos`, `puestos`, ...) y, con sufijo `Ids`, el del
// `PATCH /users/{id}` (`cargoIds`, ...).
export type OrganizationCatalogKind = 'subsidiarias' | 'ubicaciones' | 'cargos' | 'puestos' | 'departamentos' | 'areas';

export const ORGANIZATION_CATALOG_KINDS: readonly OrganizationCatalogKind[] = [
  'subsidiarias',
  'ubicaciones',
  'cargos',
  'puestos',
  'departamentos',
  'areas',
];

/**
 * Catálogos organizacionales COMPLETOS del Core Service — `GET /catalogs/subsidiarias`,
 * `/ubicaciones`, `/cargos`, `/puestos`, `/departamentos` y `/areas`. Alimentan los
 * combos de alta y de la sección "Organización" del detalle de usuario; cada opción
 * trae el `id` que luego viaja en `POST /users` / `PATCH /users/{id}`.
 *
 * Distinto de `CatalogService` (mismo directorio): ese expone las subsidiarias/
 * ubicaciones a las que tiene acceso QUIEN inició sesión (vienen en el login) y
 * sigue siendo la fuente de los filtros de pantallas operativas; este es el
 * catálogo global para ASIGNAR organización a otra persona.
 *
 * Permiso: ninguno en particular, basta una sesión válida. Listas cortas, sin
 * paginar, ya filtradas a `enabled = TRUE` y ordenadas por nombre por el backend.
 * En una base nueva cargos/puestos/departamentos/áreas llegan vacíos (`[]`): el
 * cliente aún no entrega las listas reales — la UI debe tolerarlo.
 *
 * Carga perezosa (`ensureLoaded`, la llama la pantalla que los usa) y una sola vez
 * por sesión; cada catálogo se pide por separado (un `rxResource` cada uno) para que la falla de uno no deje
 * vacíos a los otros cinco (el aviso del error lo da `httpErrorAlertInterceptor`).
 * Se limpian al cerrar sesión.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationCatalogService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  // Se vuelve `true` la primera vez que una pantalla llama a `ensureLoaded`.
  private readonly requested = signal(false);

  // Un `rxResource` por catálogo (ADR-0002, punto 3): pide cuando ya se solicitó y
  // hay sesión; al cerrar sesión `params` es `undefined`, el resource queda en
  // reposo y su valor vuelve a `[]` — sin `effect` que limpie a mano.
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

  // Algún catálogo con una petición en vuelo / que falló en el último intento.
  readonly loading = computed(() => ORGANIZATION_CATALOG_KINDS.some((kind) => this.resources[kind].isLoading()));
  readonly loadFailed = computed(() => ORGANIZATION_CATALOG_KINDS.some((kind) => !!this.resources[kind].error()));

  // Pide los catálogos la primera vez; después solo reintenta los que fallaron.
  ensureLoaded(): void {
    if (!this.requested()) {
      this.requested.set(true);
      return;
    }
    for (const kind of ORGANIZATION_CATALOG_KINDS) {
      if (this.resources[kind].error()) this.resources[kind].reload();
    }
  }

  // Vuelve a pedir los seis (p. ej. tras cargar datos nuevos en el backend).
  reload(): void {
    if (!this.requested()) {
      this.requested.set(true);
      return;
    }
    for (const kind of ORGANIZATION_CATALOG_KINDS) this.resources[kind].reload();
  }

  // Un resource en error lanza al leer `value()`: se usa `hasValue()`.
  options(kind: OrganizationCatalogKind): readonly CatalogEntry[] {
    const resource = this.resources[kind];
    return resource.hasValue() ? resource.value() : [];
  }

  find(kind: OrganizationCatalogKind, id: number): CatalogEntry | null {
    return this.options(kind).find((entry) => entry.id === id) ?? null;
  }

  // Ubicaciones de las subsidiarias indicadas; sin subsidiarias elegidas, todas.
  ubicacionesFor(subsidiariaIds: readonly number[]): readonly UbicacionCatalogEntry[] {
    const all = this.ubicaciones();
    return subsidiariaIds.length ? all.filter((u) => subsidiariaIds.includes(u.subsidiariaId)) : all;
  }

  // Quita de `ubicacionIds` las que no pertenecen a ninguna de `subsidiariaIds` —
  // para cuando la persona deselecciona una subsidiaria. Sin subsidiarias elegidas
  // (o sin catálogo cargado) no toca nada.
  pruneUbicaciones(ubicacionIds: readonly number[], subsidiariaIds: readonly number[]): number[] {
    if (!subsidiariaIds.length || !this.ubicaciones().length) return [...ubicacionIds];
    return ubicacionIds.filter((id) => {
      const ubicacion = this.ubicaciones().find((u) => u.id === id);
      return !ubicacion || subsidiariaIds.includes(ubicacion.subsidiariaId);
    });
  }
}
