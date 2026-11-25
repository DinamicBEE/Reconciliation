import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_HTTP_ERROR_ALERT } from '../../../core/interceptors/http-error-alert.interceptor';
import { ReconciliationRun, ReconciliationRunStatus } from './reconciliation-run.model';

/**
 * Conciliación de `GET /reconciliations` y `POST /reconciliations` (Core Service).
 *
 * @see docs/codigo/conciliacion.md#api-de-conciliaciones
 */
export interface ReconciliationDto {
  id: number;
  code?: string; // 'CON-0011'; ausente en backends anteriores a la rama conciliations
  createdAt: string; // instante ISO (UTC)
  company: { id: number; name: string };
  store: { id: number; name: string };
  periodStart: string; // yyyy-MM-dd
  periodEnd: string;
  status: { id: number; code: string; description: string };
  comments: string | null;
  salesCount: number;
  filesCount?: number; // reportes del banco cargados
  matched?: boolean; // true si ya se cruzó
}

/** Página de `GET /reconciliations`. */
export interface ReconciliationListPage {
  data: ReconciliationDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Filtros de `GET /reconciliations`; `page` empieza en 1 y `pageSize` va de 1 a 100.
 *
 * @remarks `status` es el id del catálogo de estados; las fechas son días en la zona del backend.
 */
export interface ReconciliationListParams {
  status?: number;
  createdFrom?: string; // yyyy-MM-dd
  createdTo?: string;
  page?: number;
  pageSize?: number;
}

/** Cuerpo de `POST /reconciliations`; `store` es el id de la tienda. */
export interface ReconciliationCreateRequest {
  store: number;
  periodStart: string;
  periodEnd: string;
  comments?: string;
}

/** Código del catálogo de estados de conciliación → estado de la corrida en el front. */
export const RUN_STATUS_BY_CODE: Record<string, ReconciliationRunStatus> = {
  por_conciliar: 'pendiente',
  conciliado: 'conciliado',
  desconciliado: 'desconciliado',
};

/** Estado de la corrida → código del catálogo de estados de conciliación. */
export const CODE_BY_RUN_STATUS: Record<ReconciliationRunStatus, string> = {
  pendiente: 'por_conciliar',
  conciliado: 'conciliado',
  desconciliado: 'desconciliado',
};

/** Conciliaciones del Core Service: lista paginada y alta. */
@Injectable({ providedIn: 'root' })
export class ReconciliationApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(params: ReconciliationListParams): Observable<ReconciliationListPage> {
    return this.http.get<ReconciliationListPage>(`${this.apiUrl}/reconciliations`, { params: toHttpParams(params) });
  }

  /**
   * Crea la conciliación sin la alerta genérica (`SKIP_HTTP_ERROR_ALERT`).
   *
   * @returns Falla con `HttpErrorResponse`; quien llama lo traduce con {@link describeCreateReconciliationError}.
   */
  create(request: ReconciliationCreateRequest): Observable<ReconciliationDto> {
    return this.http.post<ReconciliationDto>(`${this.apiUrl}/reconciliations`, request, {
      context: new HttpContext().set(SKIP_HTTP_ERROR_ALERT, true),
    });
  }
}

/** Convierte la conciliación del backend en la fila de la tabla; un código de estado desconocido queda `pendiente`. */
export function toReconciliationRun(dto: ReconciliationDto): ReconciliationRun {
  return {
    id: String(dto.id),
    code: dto.code ?? reconciliationCode(dto.id),
    createdAt: dto.createdAt,
    companyName: dto.company.name,
    storeName: dto.store.name,
    periodStart: dto.periodStart,
    periodEnd: dto.periodEnd,
    status: RUN_STATUS_BY_CODE[dto.status.code] ?? 'pendiente',
    comments: dto.comments ?? '',
    salesCount: dto.salesCount,
  };
}

/** Código que muestra el portal para una conciliación: 'CON-' y el id con 4 dígitos (como el backend). */
export function reconciliationCode(id: number | string): string {
  return `CON-${String(id).padStart(4, '0')}`;
}

/**
 * Aviso para un error de `POST /reconciliations`: `level` es el tipo de `NzMessageService`.
 *
 * @remarks El 409 (sin ventas en el periodo o ya conciliadas) es un resultado esperado: advertencia, no error.
 * @see docs/codigo/conciliacion.md#api-de-conciliaciones
 */
export function describeCreateReconciliationError(err: unknown): { level: 'warning' | 'error'; text: string } {
  if (err instanceof HttpErrorResponse) {
    const detail = typeof err.error?.detail === 'string' ? err.error.detail : null;
    if (err.status === 409) {
      return { level: 'warning', text: detail ?? 'No hay ventas en ese periodo o alguna ya está en otra conciliación.' };
    }
    if (err.status === 403) {
      return { level: 'error', text: 'Tu cuenta no tiene el permiso para crear conciliaciones (create_reconciliation).' };
    }
    if (err.status === 0) {
      return { level: 'error', text: 'No se pudo conectar con el servidor. Intenta de nuevo.' };
    }
    if (detail) return { level: 'error', text: detail };
  }
  return { level: 'error', text: 'No se pudo crear la conciliación. Intenta de nuevo.' };
}

// Solo los parámetros con valor: el backend trata la ausencia como "sin filtro".
function toHttpParams(params: ReconciliationListParams): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') httpParams = httpParams.set(key, String(value));
  }
  return httpParams;
}
