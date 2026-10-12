import { HttpClient } from '@angular/common/http';
import { Injectable, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/auth/data/auth.service';
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
 * por sesión; cada catálogo se pide por separado para que la falla de uno no deje
 * vacíos a los otros cinco (el aviso del error lo da `httpErrorAlertInterceptor`).
 * Se limpian al cerrar sesión.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationCatalogService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  private readonly store: Record<OrganizationCatalogKind, WritableSignal<readonly CatalogEntry[]>> = {
    subsidiarias: signal([]),
    ubicaciones: signal([]),
    cargos: signal([]),
    puestos: signal([]),
    departamentos: signal([]),
    areas: signal([]),
  };

  readonly subsidiarias = this.store.subsidiarias.asReadonly();
  readonly ubicaciones = computed(() => this.store.ubicaciones() as readonly UbicacionCatalogEntry[]);
  readonly cargos = this.store.cargos.asReadonly();
  readonly puestos = this.store.puestos.asReadonly();
  readonly departamentos = this.store.departamentos.asReadonly();
  readonly areas = this.store.areas.asReadonly();

  // Catálogos con una petición en vuelo / que fallaron en el último intento.
  private readonly pending = signal<ReadonlySet<OrganizationCatalogKind>>(new Set());
  private readonly failed = signal<ReadonlySet<OrganizationCatalogKind>>(new Set());
  private readonly loaded = new Set<OrganizationCatalogKind>();

  readonly loading = computed(() => this.pending().size > 0);
  readonly loadFailed = computed(() => this.failed().size > 0);

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) untracked(() => this.clear());
    });
  }

  // Pide los catálogos que aún no se tienen (o que fallaron la vez anterior).
  ensureLoaded(): void {
    for (const kind of ORGANIZATION_CATALOG_KINDS) {
      if (!this.loaded.has(kind) && !this.pending().has(kind)) this.fetch(kind);
    }
  }

  // Vuelve a pedir los seis (p. ej. tras cargar datos nuevos en el backend).
  reload(): void {
    this.loaded.clear();
    this.ensureLoaded();
  }

  options(kind: OrganizationCatalogKind): readonly CatalogEntry[] {
    return this.store[kind]();
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

  private fetch(kind: OrganizationCatalogKind): void {
    this.pending.update((set) => new Set(set).add(kind));
    this.request(kind)
      .pipe(
        tap((entries) => {
          this.store[kind].set(entries);
          this.loaded.add(kind);
          this.failed.update((set) => without(set, kind));
        }),
        catchError(() => {
          this.failed.update((set) => new Set(set).add(kind));
          return of(null);
        }),
      )
      .subscribe(() => this.pending.update((set) => without(set, kind)));
  }

  private request(kind: OrganizationCatalogKind): Observable<CatalogEntry[]> {
    return this.http.get<CatalogEntry[]>(`${this.apiUrl}/catalogs/${kind}`);
  }

  private clear(): void {
    for (const kind of ORGANIZATION_CATALOG_KINDS) {
      this.store[kind].set([]);
    }
    this.loaded.clear();
    this.failed.set(new Set());
  }
}

function without<T>(set: ReadonlySet<T>, item: T): ReadonlySet<T> {
  const next = new Set(set);
  next.delete(item);
  return next;
}
