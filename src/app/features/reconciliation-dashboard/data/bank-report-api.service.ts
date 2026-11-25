import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, mergeMap, of, range, switchMap, toArray } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_HTTP_ERROR_ALERT } from '../../../core/interceptors/http-error-alert.interceptor';
import { BankStatementResult } from './bank-statement.util';
import {
  ReconciliationBankMovement,
  ReconciliationResult,
  ReconciliationResultRow,
  ReconciliationResultStatus,
} from './reconciliation-result.model';

/** Filas ilegibles o que no cuadran del reporte (`row` 1 es el encabezado). */
export interface BankReportProblem {
  row: number;
  message: string;
}

/** Totales de control del reporte del banco. */
export interface BankReportTotals {
  purchase: number;
  tip: number;
  vat: number;
  consumptionTax: number;
  total: number;
  commission: number;
  withholdingTax: number;
  withholdingVat: number;
  withholdingIca: number;
  net: number;
}

/**
 * Vista previa de `POST /reconciliation/bank-reports/read`: cifras de control, sin guardar nada.
 *
 * @see docs/codigo/conciliacion.md#reportes-del-banco
 */
export interface BankReportRead {
  bank: string;
  fileName: string;
  sheetName: string;
  transactions: number;
  transactionDateFrom: string | null; // yyyy-MM-dd
  transactionDateTo: string | null;
  duplicateTransactions: number;
  totals: BankReportTotals;
  byDay: { transactionDate: string; transactions: number; total: number; net: number }[];
  byEstablishment: { establishmentCode: string; transactions: number; total: number; net: number }[];
  byNetwork: { network: string; transactions: number; total: number; net: number }[];
  problems: BankReportProblem[];
}

/** Respuesta de `POST /reconciliation/bank-reports`; `alreadyLoaded` = el mismo archivo ya estaba cargado. */
export interface BankReportImport {
  fileId: number;
  bank: string;
  fileName: string;
  alreadyLoaded: boolean;
  transactionsRead: number;
  inserted: number;
  skipped: number;
  transactionDateFrom: string | null;
  transactionDateTo: string | null;
  problems: BankReportProblem[];
}

/** Conteo y porcentaje (0–100) de una tarjeta del cruce. */
export interface BankMatchCount {
  count: number;
  percent: number;
}

/** Las 4 tarjetas del cruce (`POST /{fileId}/match` y `summary` de los resultados). */
export interface BankMatchSummary {
  total: number;
  matches: BankMatchCount;
  differences: BankMatchCount;
  unmatched: BankMatchCount;
  toManage: BankMatchCount;
}

/** Estado de una fila del cruce. */
export type BankMatchStatus = 'MATCH' | 'DIFFERENCE' | 'UNMATCHED';

/** Fila del cruce: `pos` o `bank` es `null` cuando ese lado no tiene pareja. */
export interface BankMatchItem {
  id: number;
  date: string; // yyyy-MM-dd
  reference: string;
  description: string | null;
  pos: number | null;
  bank: number | null;
  difference: number | null;
  status: BankMatchStatus;
  rule: string | null;
  /** `true` en las filas MATCH de una conciliación ya confirmada ("Conciliado" en vez de "Coincide"). */
  reconciled?: boolean;
}

/**
 * Encabezado de la conciliación en el resultado y en la confirmación.
 *
 * @remarks `status.code` es `por_conciliar` hasta confirmarla y `conciliado` después.
 */
export interface ReconciliationHeader {
  id: number;
  code: string; // 'CON-0011'
  store: { id: number; name: string };
  periodStart: string;
  periodEnd: string;
  status: { code: string; description: string };
  files: { fileId: number; bank: string; fileName: string }[];
}

/** Página de `GET /reconciliation/reconciliations/{id}/results`; antes de cruzar, las tarjetas salen en cero. */
export interface BankMatchResults {
  reconciliation: ReconciliationHeader;
  summary: BankMatchSummary;
  data: BankMatchItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Respuesta de `POST /reconciliation/reconciliations/{id}/confirm`: cómo quedaron las ventas. */
export interface ReconciliationConfirm {
  reconciliation: ReconciliationHeader;
  summary: BankMatchSummary;
  reconciledSales: number; // todos sus pagos coinciden → conciliado
  differenceSales: number; // algún pago con diferencia → diferencia
  unmatchedSales: number; // algún pago sin transacción del banco → sin_coincidencia
}

/** Máximo `pageSize` que acepta `GET .../results`. */
export const BANK_RESULTS_MAX_PAGE_SIZE = 100;
// Páginas del resultado pedidas a la vez al recorrerlo completo.
const RESULTS_CONCURRENCY = 6;

const STATUS_BY_MATCH: Record<BankMatchStatus, ReconciliationResultStatus> = {
  MATCH: 'coincide',
  DIFFERENCE: 'diferencia',
  UNMATCHED: 'sin_coincidencia',
};

// Regla con la que el back emparejó la fila; una regla nueva se muestra tal cual.
const RULE_COMMENT: Record<string, string> = {
  AUTH_DATE_AMOUNT: 'Coincide por autorización, fecha e importe.',
  AUTH_DATE: 'Misma autorización y fecha, pero el importe es distinto.',
  AUTH_AMOUNT_NEAR_DATE: 'Misma autorización e importe, pero la fecha es distinta.',
  STORE_DATE_AMOUNT: 'Coincide por tienda, fecha e importe.',
};

/**
 * Reportes del banco del Reconciliation Service: vista previa y, dentro de una conciliación, carga, cruce, resultado y confirmación.
 *
 * @remarks Las llamadas que muestran su propio error llevan `SKIP_HTTP_ERROR_ALERT`.
 * @see docs/codigo/conciliacion.md#reportes-del-banco
 */
@Injectable({ providedIn: 'root' })
export class BankReportApiService {
  private readonly http = inject(HttpClient);
  private readonly reportsUrl = `${environment.apiUrl}/reconciliation/bank-reports`;
  private readonly reconciliationsUrl = `${environment.apiUrl}/reconciliation/reconciliations`;

  /** Lee el reporte sin guardarlo (paso 1). Falla con 400 si no es un reporte legible del banco. */
  read(bank: string, file: File): Observable<BankReportRead> {
    return this.http.post<BankReportRead>(`${this.reportsUrl}/read`, reportForm(bank, file), { context: skipAlert() });
  }

  /** Guarda el reporte y lo liga a la conciliación; si ya estaba cargado responde con `alreadyLoaded` y solo lo liga. */
  uploadFile(reconciliationId: string, bank: string, file: File): Observable<BankReportImport> {
    return this.http.post<BankReportImport>(`${this.reconciliationsUrl}/${reconciliationId}/files`, reportForm(bank, file), {
      context: skipAlert(),
    });
  }

  /** Cruza los reportes de la conciliación contra sus ventas (su tienda y su periodo); reemplaza el cruce anterior. */
  match(reconciliationId: string): Observable<BankMatchSummary> {
    return this.http.post<BankMatchSummary>(`${this.reconciliationsUrl}/${reconciliationId}/match`, null, { context: skipAlert() });
  }

  results(reconciliationId: string, page = 1, pageSize = BANK_RESULTS_MAX_PAGE_SIZE): Observable<BankMatchResults> {
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    return this.http.get<BankMatchResults>(`${this.reconciliationsUrl}/${reconciliationId}/results`, {
      params,
      context: skipAlert(),
    });
  }

  /**
   * Recorre todas las páginas del resultado del cruce.
   *
   * @remarks La tabla del paso 2 filtra, ordena y marca líneas en el front, así que necesita todas.
   */
  allResults(reconciliationId: string): Observable<{ summary: BankMatchSummary; items: BankMatchItem[] }> {
    return this.results(reconciliationId, 1).pipe(
      switchMap((first) => {
        const pages = first.pageSize > 0 ? Math.ceil(first.total / first.pageSize) : 1;
        if (pages <= 1) return of({ summary: first.summary, items: first.data });
        // El resto de las páginas se pide en paralelo y se reordena.
        return range(2, pages - 1).pipe(
          mergeMap((page) => this.results(reconciliationId, page), RESULTS_CONCURRENCY),
          toArray(),
          map((rest) => ({
            summary: first.summary,
            items: [first, ...rest.sort((a, b) => a.page - b.page)].flatMap((page) => page.data),
          })),
        );
      }),
    );
  }

  /** Confirma la conciliación: pasa a conciliado y sus ventas cambian de estatus. 409 si ya estaba confirmada. */
  confirm(reconciliationId: string): Observable<ReconciliationConfirm> {
    return this.http.post<ReconciliationConfirm>(`${this.reconciliationsUrl}/${reconciliationId}/confirm`, null, {
      context: skipAlert(),
    });
  }
}

function skipAlert(): HttpContext {
  return new HttpContext().set(SKIP_HTTP_ERROR_ALERT, true);
}

function reportForm(bank: string, file: File): FormData {
  const form = new FormData();
  form.append('bank', bank);
  form.append('file', file, file.name);
  return form;
}

/**
 * Convierte la vista previa del back en el resumen del card del paso 1.
 *
 * @remarks Sin transacciones el archivo es inválido; con filas que no cuadran queda en "Campos faltantes".
 * @see docs/codigo/conciliacion.md#reportes-del-banco
 */
export function toStatementResult(read: BankReportRead): BankStatementResult {
  const invalidRows = read.problems.map((problem) => ({ row: problem.row, fields: [problem.message] }));
  if (read.transactions === 0 || !read.transactionDateFrom || !read.transactionDateTo) {
    return { state: 'invalid', summary: null, reason: 'El archivo no trae transacciones.', missingColumns: [], invalidRows };
  }
  const summary = {
    totalRecords: read.transactions,
    totalAmount: read.totals.total,
    dateFrom: read.transactionDateFrom,
    dateTo: read.transactionDateTo,
  };
  if (invalidRows.length > 0) {
    return { state: 'missing_fields', summary, reason: 'Hay filas ilegibles o que no cuadran.', missingColumns: [], invalidRows };
  }
  return { state: 'valid', summary, reason: null, missingColumns: [], invalidRows: [] };
}

/** Resultado del paso 1 cuando el back no pudo leer el archivo (400 = no es un reporte del banco). */
export function statementErrorResult(err: unknown): BankStatementResult {
  const detail = err instanceof HttpErrorResponse && typeof err.error?.detail === 'string' ? err.error.detail : null;
  if (err instanceof HttpErrorResponse && err.status === 400) {
    return { state: 'invalid', summary: null, reason: detail ?? 'El archivo no es un reporte del banco legible.', missingColumns: [], invalidRows: [] };
  }
  return { state: 'error', summary: null, reason: detail ?? 'No se pudo leer el archivo.', missingColumns: [], invalidRows: [] };
}

/** Convierte una fila del cruce en la línea de la tabla; el subtítulo es la franquicia o, sin ella, el banco. */
export function toResultRow(item: BankMatchItem, bankName: string): ReconciliationResultRow {
  const concept = item.description ?? '';
  const channel = item.description || bankName;
  const bank: ReconciliationBankMovement[] =
    item.bank === null
      ? []
      : [{ id: `banco-${item.id}`, date: item.date, reference: item.reference, amount: item.bank, concept, paymentMethod: channel }];
  const status = STATUS_BY_MATCH[item.status] ?? 'sin_coincidencia';
  return {
    id: String(item.id),
    date: item.date,
    reference: item.reference,
    tenderMedia: null,
    channel,
    pos: item.pos === null ? null : { reference: item.reference, amount: item.pos, concept, paymentMethod: channel },
    bank,
    candidates: [],
    difference: item.difference ?? round2((item.pos ?? 0) - (item.bank ?? 0)),
    comment: commentFor(item),
    status,
  };
}

/** Arma el resultado del paso 2 con las tarjetas del back y todas las filas del cruce. */
export function toReconciliationResult(summary: BankMatchSummary, items: readonly BankMatchItem[], bankName: string): ReconciliationResult {
  const rows = items.map((item) => toResultRow(item, bankName));
  const kpi = (count: BankMatchCount) => ({ count: count.count, percentage: count.percent });
  return {
    total: summary.total,
    totals: {
      pos: round2(items.reduce((sum, item) => sum + (item.pos ?? 0), 0)),
      bank: round2(items.reduce((sum, item) => sum + (item.bank ?? 0), 0)),
    },
    kpis: {
      coincidencias: kpi(summary.matches),
      diferencias: kpi(summary.differences),
      sinCoincidencias: kpi(summary.unmatched),
    },
    rows,
  };
}

/** Texto de error del paso 2 (carga, cruce o resultado). */
export function describeBankReportError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const detail = typeof err.error?.detail === 'string' ? err.error.detail : null;
    if (err.status === 403) return 'Tu cuenta no tiene el permiso para cargar reportes del banco (import_settlements).';
    if (err.status === 0) return 'No se pudo conectar con el servidor. Intenta de nuevo.';
    if (detail) return detail;
  }
  return 'No se pudo procesar el reporte del banco. Intenta de nuevo.';
}

function commentFor(item: BankMatchItem): string {
  if (item.rule) return RULE_COMMENT[item.rule] ?? item.rule;
  if (item.status !== 'UNMATCHED') return '';
  return item.pos === null ? 'Solo está en el banco: no hay venta con esa autorización.' : 'Solo está en el POS: el banco no reporta ese pago.';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
