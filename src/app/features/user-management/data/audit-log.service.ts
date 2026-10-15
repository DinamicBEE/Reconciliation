import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuditLogEntry } from './user-management.model';

// Bitácora (`GET /audit-log`, `GET /users/{id}/audit-log`) — exigen
// `view_audit_log` (independiente de `manage_users`). `actor` es `null` cuando lo
// hizo el sistema (bloqueo/desbloqueo automático). Siempre de la más reciente a
// la más antigua.
export interface AuditPersonDto {
  id: number;
  displayName: string;
}

export interface AuditLogEntryDto {
  id: number;
  actor: AuditPersonDto | null;
  target: AuditPersonDto;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  content: AuditLogEntryDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AuditLogParams {
  // Solo `GET /audit-log` (el de un usuario ya lo lleva en la ruta).
  userId?: number;
  action?: string;
  // Texto libre: detalle y nombre o correo de quien actuó o sobre quien se actuó.
  search?: string;
  page?: number;
  size?: number;
}

// Una página de la bitácora ya mapeada para la UI. `page` es la del backend
// (desde 0).
export interface AuditEntriesPage {
  entries: AuditLogEntry[];
  page: number;
  size: number;
  totalElements: number;
}

/**
 * Bitácora REAL de administración de usuarios (`GET /audit-log` y `GET
 * /users/{id}/audit-log`) — el backend registra cada acción (alta, edición,
 * estado, roles, contraseña, sesiones, baja...) por su cuenta, así que el front
 * ya NO lleva una bitácora local ni la alimenta desde las mutaciones. Filtros y
 * paginación son del lado del servidor. Ambos endpoints exigen
 * `view_audit_log` (independiente de `manage_users`). Es además el cliente HTTP
 * de esos endpoints (antes en `AuthService`, ADR-0001 punto 4).
 */
@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Historial global ("Historial y auditoría de usuarios").
  listAll(params: AuditLogParams = {}): Observable<AuditEntriesPage> {
    return this.listAuditLog(params).pipe(map(toEntriesPage));
  }

  // Historial de una persona (pestaña "Historial" del detalle).
  listForUser(backendUserId: number, params: Omit<AuditLogParams, 'userId'> = {}): Observable<AuditEntriesPage> {
    return this.listUserAuditLog(backendUserId, params).pipe(map(toEntriesPage));
  }

  // `GET /audit-log` (historial global) y `GET /users/{id}/audit-log` (de una
  // persona, también si ya fue dada de baja; 404 solo si nunca existió). Filtros
  // y paginación del lado del servidor (`page` desde 0, `size` 20 por defecto).
  private listAuditLog(params: AuditLogParams = {}): Observable<AuditLogPage> {
    return this.http.get<AuditLogPage>(`${this.apiUrl}/audit-log`, { params: this.auditHttpParams(params) });
  }

  private listUserAuditLog(backendUserId: number, params: Omit<AuditLogParams, 'userId'> = {}): Observable<AuditLogPage> {
    return this.http.get<AuditLogPage>(`${this.apiUrl}/users/${backendUserId}/audit-log`, {
      params: this.auditHttpParams(params),
    });
  }

  private auditHttpParams(params: AuditLogParams): HttpParams {
    let httpParams = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? 20));
    if (params.userId !== undefined) httpParams = httpParams.set('userId', String(params.userId));
    if (params.action) httpParams = httpParams.set('action', params.action);
    if (params.search?.trim()) httpParams = httpParams.set('search', params.search.trim());
    return httpParams;
  }
}

function toEntry(dto: AuditLogEntryDto): AuditLogEntry {
  return {
    id: dto.id,
    timestamp: dto.createdAt,
    actorName: dto.actor?.displayName ?? 'Sistema',
    targetBackendUserId: dto.target.id,
    targetUserName: dto.target.displayName,
    action: dto.action,
    detail: dto.detail ?? '',
  };
}

function toEntriesPage(page: AuditLogPage): AuditEntriesPage {
  return { entries: page.content.map(toEntry), page: page.page, size: page.size, totalElements: page.totalElements };
}
