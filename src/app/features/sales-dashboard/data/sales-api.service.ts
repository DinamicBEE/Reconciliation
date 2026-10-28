import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, reduce } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_HTTP_ERROR_ALERT } from '../../../core/interceptors/http-error-alert.interceptor';

/** Tipo de documento de una fila de `GET /sales`. */
export type SaleDocumentType = 'INVOICE' | 'CREDIT_NOTE';

/**
 * Fila de `GET /sales` (Guia_Integracion_Frontend §8.1): un documento, factura o nota crédito.
 *
 * @remarks Los importes llegan como están guardados: en una nota crédito son positivos.
 * @see docs/codigo/ventas.md#api-de-ventas
 */
export interface SaleListItem {
  id: number;
  folio: string; // prefijo + folio
  documentType: SaleDocumentType;
  date: string; // yyyy-MM-dd (fecha de negocio)
  time: string | null; // HH:mm; null en documentos capturados antes de guardar la hora
  store: { id: number; name: string };
  customer: { id: number; document: string; name: string; finalConsumer: boolean } | null;
  // Medio de pago principal (el de mayor monto); null si no hay pagos.
  tenderMedia: { id: number; code: string; description: string; mixed: boolean; paymentCount: number } | null;
  reconciliationStatus: { id: number; code: string; description: string };
  subtotal: number;
  taxes: number;
  total: number;
}

/**
 * Filtros de `GET /sales`; `page` empieza en 1 y `pageSize` va de 1 a 100.
 *
 * @remarks `store`, `tenderMedia` y `status` son ids de los combos, no códigos ni nombres.
 */
export interface SalesListParams {
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string;
  store?: number;
  tenderMedia?: number;
  status?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Página de `GET /sales`. */
export interface SalesListPage {
  data: SaleListItem[];
  total: number; // todas las páginas
  page: number;
  pageSize: number;
}

/** Máximo `pageSize` que acepta `GET /sales`. */
export const SALES_MAX_PAGE_SIZE = 100;

/**
 * Cuerpo de `POST /sales/capture` (Capture Service, permiso `capture_sales`).
 *
 * @remarks Captura síncrona e idempotente; el front la pide para un día y una tienda.
 * @see docs/codigo/ventas.md#reprocesar
 */
export interface CaptureRequest {
  ubicacionIds: number[];
  dateFrom: string; // yyyy-MM-dd
  dateTo?: string; // inclusive; omitido = solo dateFrom
}

/**
 * `OK` completo; `INCOMPLETE` faltan o fallaron documentos, o hay conflicto de folio;
 * `ERROR` Facturiza no respondió o se interrumpió; `RUNNING` ya se estaba capturando.
 */
export type CaptureStatus = 'OK' | 'INCOMPLETE' | 'ERROR' | 'RUNNING';

interface CaptureCounts {
  status: CaptureStatus;
  capturedCount: number; // documentos recibidos
  insertedCount: number; // nuevos guardados
  skippedCount: number; // ya existían
  failedCount: number; // no se pudieron guardar
  capturedAmount: number;
}

/** Resultado de un día de una tienda (una corrida de la bitácora). */
export interface CaptureDayResult extends CaptureCounts {
  captureLogId: number; // 0 si ya se estaba capturando (no se volvió a capturar)
  ubicacionId: number;
  businessDate: string;
  declaredCount: number | null; // lo que Facturiza declara; null si no respondió
  pages: number;
  errorMessage: string | null;
}

/** Resultado de una tienda en el rango pedido. */
export interface CaptureLocationResult extends CaptureCounts {
  ubicacionId: number;
  dateFrom: string;
  dateTo: string;
  daysRequested: number;
  declaredCount: number;
  days: CaptureDayResult[];
}

/** Respuesta de `POST /sales/capture`: 200 todo OK, 207 mixto y 502 (con este mismo cuerpo) si Facturiza no respondió. */
export interface CaptureBatchResult extends CaptureCounts {
  dateFrom: string;
  dateTo: string;
  locationsRequested: number;
  daysRequested: number;
  declaredCount: number;
  locations: CaptureLocationResult[];
}

/**
 * Cliente de `GET /sales` (Core Service, permiso `view_dashboard`) y `POST /sales/capture`.
 *
 * @remarks `GET /sales` solo lee lo ya capturado; traer ventas de Facturiza es `POST /sales/capture`.
 * @see docs/codigo/ventas.md#api-de-ventas
 */
@Injectable({ providedIn: 'root' })
export class SalesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Captura desde Facturiza sin la alerta genérica (`SKIP_HTTP_ERROR_ALERT`).
   *
   * @returns Observable con el resultado; falla con `HttpErrorResponse` (502 con resultado, o `ProblemDetail`) que quien llama traduce con `describeCaptureError`.
   * @see docs/codigo/ventas.md#reprocesar
   */
  capture(request: CaptureRequest): Observable<CaptureBatchResult> {
    return this.http.post<CaptureBatchResult>(`${this.apiUrl}/sales/capture`, request, {
      context: new HttpContext().set(SKIP_HTTP_ERROR_ALERT, true),
    });
  }

  list(params: SalesListParams): Observable<SalesListPage> {
    return this.http.get<SalesListPage>(`${this.apiUrl}/sales`, { params: toHttpParams(params) });
  }

  /**
   * Recorre todas las páginas de los filtros en páginas de {@link SALES_MAX_PAGE_SIZE}.
   *
   * @remarks Alimenta la exportación CSV; el backend no tiene `GET /sales/export`.
   * @see docs/codigo/ventas.md#exportacion
   */
  listAll(filters: Omit<SalesListParams, 'page' | 'pageSize'>): Observable<SaleListItem[]> {
    const fetchPage = (page: number) => this.list({ ...filters, page, pageSize: SALES_MAX_PAGE_SIZE });
    return fetchPage(1).pipe(
      expand((res) => (res.page * res.pageSize < res.total ? fetchPage(res.page + 1) : EMPTY)),
      reduce((rows, res) => rows.concat(res.data), [] as SaleListItem[]),
    );
  }
}

function toHttpParams(params: SalesListParams): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    httpParams = httpParams.set(key, String(value));
  }
  return httpParams;
}
