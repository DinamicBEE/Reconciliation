import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuditLogEntry } from './user-management.model';

/** Persona citada en la bitácora; `id` es `app_user.id`. */
export interface AuditPersonDto {
  id: number;
  displayName: string;
}

/**
 * Entrada de `GET /audit-log` y `GET /users/{id}/audit-log`, de la más reciente a la más antigua.
 *
 * @see docs/codigo/usuarios.md#bitacora
 */
export interface AuditLogEntryDto {
  id: number;
  /** `null` cuando actuó el sistema (bloqueo/desbloqueo automático). */
  actor: AuditPersonDto | null;
  target: AuditPersonDto;
  action: string;
  detail: string | null;
  createdAt: string;
}

/** Página cruda de la bitácora del backend. */
export interface AuditLogPage {
  content: AuditLogEntryDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Filtros y página de la bitácora; `page` empieza en 0 y `size` es 20 por defecto. */
export interface AuditLogParams {
  /** Solo para `GET /audit-log`; el de una persona lo lleva en la ruta. */
  userId?: number;
  action?: string;
  /** Texto libre sobre el detalle y el nombre o correo de actor y afectado. */
  search?: string;
  page?: number;
  size?: number;
}

/** Página de la bitácora mapeada para la UI; `page` es la del backend (desde 0). */
export interface AuditEntriesPage {
  entries: AuditLogEntry[];
  page: number;
  size: number;
  totalElements: number;
}

/**
 * Bitácora de administración de usuarios que registra el backend; filtros y paginación en el servidor.
 *
 * @remarks Ambos endpoints exigen `view_audit_log`, independiente de `manage_users`.
 * @see docs/codigo/usuarios.md#bitacora
 */
@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** `GET /audit-log`: historial global ("Historial y auditoría de usuarios"). */
  listAll(params: AuditLogParams = {}): Observable<AuditEntriesPage> {
    return this.listAuditLog(params).pipe(map(toEntriesPage));
  }

  /**
   * `GET /users/{id}/audit-log`: historial de una persona, también dada de baja.
   *
   * @returns Observable con la página; falla con 404 solo si la persona nunca existió.
   */
  listForUser(backendUserId: number, params: Omit<AuditLogParams, 'userId'> = {}): Observable<AuditEntriesPage> {
    return this.listUserAuditLog(backendUserId, params).pipe(map(toEntriesPage));
  }

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
