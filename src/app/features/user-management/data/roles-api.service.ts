import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RoleDto } from '../../../core/auth/access-catalog.service';

// `POST /roles` (requiere `manage_roles`). El `code` lo deriva el backend del
// nombre ("Contabilidad Sur" → `CONTABILIDAD_SUR`) y no cambia después.
// `permissions` puede ir vacío. 409 `ROLE_ALREADY_EXISTS` si el código ya existe
// (aunque el rol esté dado de baja).
export interface CreateRoleRequest {
  name: string;
  permissions: string[];
}

// `PATCH /roles/{code}` (requiere `manage_roles`): `undefined` = no tocar; la
// lista de permisos REEMPLAZA la del rol y el cambio se propaga a las personas
// que lo tienen (lo agregado se suma; lo quitado se quita salvo que otro rol suyo
// lo otorgue o sea un permiso especial de la persona).
export interface UpdateRoleRequest {
  name?: string;
  permissions?: string[];
}

/**
 * Cliente HTTP del CRUD de roles (`POST/GET/PATCH/DELETE /roles`). Los
 * catálogos de solo lectura (`GET /roles`, `GET /permissions`) los pide
 * `AccessCatalogService` (core/auth), porque los usan el layout y varias
 * features (ADR-0001, punto 4).
 */
@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // `POST /roles` (ver `CreateRoleRequest`) — 201 con el rol creado.
  createRole(request: CreateRoleRequest): Observable<RoleDto> {
    return this.http.post<RoleDto>(`${this.apiUrl}/roles`, request);
  }

  // `GET /roles/{code}` — 404 `ROLE_NOT_FOUND` si no existe o está dado de baja.
  getRole(code: string): Observable<RoleDto> {
    return this.http.get<RoleDto>(`${this.apiUrl}/roles/${encodeURIComponent(code)}`);
  }

  // `PATCH /roles/{code}` (ver `UpdateRoleRequest`).
  updateRole(code: string, request: UpdateRoleRequest): Observable<RoleDto> {
    return this.http.patch<RoleDto>(`${this.apiUrl}/roles/${encodeURIComponent(code)}`, request);
  }

  // `DELETE /roles/{code}` — baja lógica (204). 409 `ROLE_IN_USE` si alguna
  // persona habilitada tiene el rol.
  deleteRole(code: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/roles/${encodeURIComponent(code)}`);
  }
}
