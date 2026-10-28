import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RoleDto } from '../../../core/auth/access-catalog.service';

/**
 * Cuerpo de `POST /roles`, permiso `manage_roles`; `permissions` puede ir vacío.
 *
 * @remarks El backend deriva el `code` del nombre y no lo cambia después.
 * @see docs/codigo/roles-y-permisos.md#crud-de-roles
 */
export interface CreateRoleRequest {
  name: string;
  permissions: string[];
}

/**
 * Cuerpo de `PATCH /roles/{code}`, permiso `manage_roles`; un campo `undefined` no se modifica.
 *
 * @remarks `permissions` reemplaza la lista del rol y el cambio se propaga a quienes lo tienen.
 * @see docs/codigo/roles-y-permisos.md#crud-de-roles
 */
export interface UpdateRoleRequest {
  name?: string;
  permissions?: string[];
}

/**
 * Cliente HTTP del CRUD de roles (`POST/GET/PATCH/DELETE /roles`).
 *
 * @remarks Los catálogos de lectura (`GET /roles`, `GET /permissions`) los pide `AccessCatalogService` (ADR-0001, punto 4).
 * @see docs/codigo/roles-y-permisos.md#crud-de-roles
 */
@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** @returns Observable con el rol creado (201); falla con 409 `ROLE_ALREADY_EXISTS` aunque el rol esté dado de baja. */
  createRole(request: CreateRoleRequest): Observable<RoleDto> {
    return this.http.post<RoleDto>(`${this.apiUrl}/roles`, request);
  }

  /** @returns Observable con el rol; falla con 404 `ROLE_NOT_FOUND` si no existe o está dado de baja. */
  getRole(code: string): Observable<RoleDto> {
    return this.http.get<RoleDto>(`${this.apiUrl}/roles/${encodeURIComponent(code)}`);
  }

  /** `PATCH /roles/{code}` (ver {@link UpdateRoleRequest}). */
  updateRole(code: string, request: UpdateRoleRequest): Observable<RoleDto> {
    return this.http.patch<RoleDto>(`${this.apiUrl}/roles/${encodeURIComponent(code)}`, request);
  }

  /** Baja lógica (204); falla con 409 `ROLE_IN_USE` si alguna persona habilitada tiene el rol. */
  deleteRole(code: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/roles/${encodeURIComponent(code)}`);
  }
}
