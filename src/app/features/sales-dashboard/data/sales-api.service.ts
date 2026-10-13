import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, reduce } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Contrato de `GET /sales` (Core Service, Guia_Integracion_Frontend §8.1).
// Una fila = un documento (factura o nota crédito). Los importes llegan tal como
// están guardados: en una nota crédito son positivos.
export type SaleDocumentType = 'INVOICE' | 'CREDIT_NOTE';

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

// Filtros: `store`, `tenderMedia` y `status` son IDS de los combos (login /
// `GET /sales/catalogs/...`), no códigos ni nombres. `page` empieza en 1;
// `pageSize` de 1 a 100.
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

export interface SalesListPage {
  data: SaleListItem[];
  total: number; // todas las páginas
  page: number;
  pageSize: number;
}

export const SALES_MAX_PAGE_SIZE = 100;

/**
 * `GET /sales` — listado paginado de ventas del Core Service (permiso
 * `view_dashboard`). Solo lee lo ya capturado; traer ventas nuevas de Facturiza
 * es `POST /sales/capture` (Capture Service).
 */
@Injectable({ providedIn: 'root' })
export class SalesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(params: SalesListParams): Observable<SalesListPage> {
    return this.http.get<SalesListPage>(`${this.apiUrl}/sales`, { params: toHttpParams(params) });
  }

  // Recorre TODAS las páginas con los mismos filtros (páginas de 100, el máximo
  // del backend) — para la exportación CSV, que debe incluir todo lo filtrado y no
  // solo la página visible (no existe `GET /sales/export` todavía).
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
