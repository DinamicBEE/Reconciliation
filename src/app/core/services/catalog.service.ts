import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../features/auth/data/auth.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';

/**
 * Catálogos REALES de subsidiaria/ubicación — deriva de `AuthService`
 * (la sesión ya trae las listas del login, ver `AuthUser.subsidiarias`/
 * `.ubicaciones`), mismo criterio que `AccessControlService` derivando de
 * `AuthService` en vez de duplicar el dato.
 *
 * REGLA GENERAL (ver MASTER.md, "Catálogos reales: subsidiaria/ubicación"):
 * todo select cuyo campo represente una SUBSIDIARIA (negocio, marca,
 * empresa) o una UBICACIÓN (tienda, store, punto de venta, sucursal) debe
 * leer sus opciones de `subsidiarias()`/`ubicaciones()` aquí — nunca un
 * array hardcodeado ni un enum propio del frontend. Aplica también a
 * cualquier select NUEVO que se agregue más adelante para alguno de esos
 * dos campos.
 *
 * Las listas son las de la sesión ACTUAL (a qué subsidiarias/ubicaciones
 * tiene acceso quien inició sesión) — no un catálogo global de "todas las
 * que existen"; el backend no expone hoy un endpoint así (ver
 * `docs/api-endpoints.csv`, no hay `GET /subsidiarias`/`GET /ubicaciones`
 * sueltos, solo lo que trae `/auth/login`/`/auth/me`).
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly auth = inject(AuthService);

  readonly subsidiarias = computed<readonly CatalogEntry[]>(() => this.auth.currentUser()?.subsidiarias ?? []);
  readonly ubicaciones = computed<readonly CatalogEntry[]>(() => this.auth.currentUser()?.ubicaciones ?? []);

  findSubsidiaria(id: number | null): CatalogEntry | null {
    return id === null ? null : (this.subsidiarias().find((s) => s.id === id) ?? null);
  }

  findUbicacion(id: number | null): CatalogEntry | null {
    return id === null ? null : (this.ubicaciones().find((u) => u.id === id) ?? null);
  }
}
