import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AuditLogEntryDto, AuditLogPage, AuditLogParams, AuthService } from '../../auth/data/auth.service';
import { AuditLogEntry } from './user-management.model';

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
 * `view_audit_log` (independiente de `manage_users`).
 */
@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly auth = inject(AuthService);

  // Historial global ("Historial y auditoría de usuarios").
  listAll(params: AuditLogParams = {}): Observable<AuditEntriesPage> {
    return this.auth.listAuditLog(params).pipe(map(toEntriesPage));
  }

  // Historial de una persona (pestaña "Historial" del detalle).
  listForUser(backendUserId: number, params: Omit<AuditLogParams, 'userId'> = {}): Observable<AuditEntriesPage> {
    return this.auth.listUserAuditLog(backendUserId, params).pipe(map(toEntriesPage));
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
