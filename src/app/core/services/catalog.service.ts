import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';

/**
 * Subsidiarias y ubicaciones a las que tiene acceso la sesión, derivadas de {@link AuthService}.
 *
 * @remarks Fuente obligada de todo select de subsidiaria o ubicación en pantallas operativas.
 * @see docs/codigo/catalogos.md#catalogos-de-sesion
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly auth = inject(AuthService);

  readonly subsidiarias = computed<readonly CatalogEntry[]>(() => this.auth.currentUser()?.subsidiarias ?? []);
  readonly ubicaciones = computed<readonly CatalogEntry[]>(() => this.auth.currentUser()?.ubicaciones ?? []);

  /** @returns `null` si `id` es `null` o no está entre las subsidiarias de la sesión. */
  findSubsidiaria(id: number | null): CatalogEntry | null {
    return id === null ? null : (this.subsidiarias().find((s) => s.id === id) ?? null);
  }

  /** @returns `null` si `id` es `null` o no está entre las ubicaciones de la sesión. */
  findUbicacion(id: number | null): CatalogEntry | null {
    return id === null ? null : (this.ubicaciones().find((u) => u.id === id) ?? null);
  }
}
