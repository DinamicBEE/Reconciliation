// "Importar movimientos bancarios" (DED, CU5 — carga de estados de cuenta y
// liquidaciones). El frontend NO lee ni normaliza el archivo: solo valida
// que la extensión sea una de las admitidas y lo envía tal cual al backend,
// junto con el origen y la cuenta/lote. La normalización (parser por
// origen, duplicados, rechazo con línea y motivo) es del backend
// (Reconciliation Service) — ver `bank-import.api.ts`.

// Origen del archivo — los cuatro formatos de la versión inicial del DED
// (CU5 paso 1, sección 7.24). Cada origen se carga contra una CUENTA
// bancaria (extractos de banco/adquirencia) o contra un LOTE (liquidación
// de agregador).
export type ImportOriginId = 'bancolombia' | 'davivienda' | 'qr_caja_social' | 'rappi';

export type ImportTargetKind = 'account' | 'batch';

export interface ImportOrigin {
  id: ImportOriginId;
  label: string;
  targetKind: ImportTargetKind;
  // Banco dueño de las cuentas que aplican a este origen (solo `account`).
  bankName?: string;
}

export const IMPORT_ORIGINS: ImportOrigin[] = [
  { id: 'bancolombia', label: 'Bancolombia — Reporte Conciliar', targetKind: 'account', bankName: 'Bancolombia' },
  { id: 'davivienda', label: 'Davivienda — Datáfono', targetKind: 'account', bankName: 'Davivienda' },
  { id: 'qr_caja_social', label: 'QR Caja Social — BREB', targetKind: 'account', bankName: 'Banco Caja Social' },
  { id: 'rappi', label: 'Rappi — Liquidación', targetKind: 'batch' },
];

// Opción del selector "Cuenta/lote" — una cuenta bancaria o un lote de
// liquidación, según el `targetKind` del origen elegido.
export interface ImportTarget {
  id: string;
  label: string;
}

// Formatos admitidos por el input de carga (punto 2): CSV, Excel o TXT. El
// separador (coma o punto y coma) y la estructura los valida el backend.
export const ACCEPTED_IMPORT_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.txt'] as const;

// `accept` del <input type="file"> — extensiones + tipos MIME, para que el
// selector del sistema filtre bien en todos los navegadores.
export const IMPORT_FILE_ACCEPT = [
  ...ACCEPTED_IMPORT_EXTENSIONS,
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

export function isAcceptedImportFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Lo que el frontend envía (multipart/form-data, ver `buildBankImportFormData`).
export interface BankImportRequest {
  origin: ImportOriginId;
  targetKind: ImportTargetKind;
  targetId: string;
  file: File;
}

// Respuesta del backend al aceptar el archivo (contrato propuesto en
// docs/api-endpoints.csv, `POST /bank-imports`).
export interface BankImportResponse {
  importId: string;
  origin: ImportOriginId;
  targetId: string;
  rowsProcessed: number;
  rowsImported: number;
  rowsDuplicated: number;
  rowsRejected: number;
  rejections: { row: number; reason: string }[];
}

// Rechazo del archivo completo (estructura que no corresponde al origen) —
// mismo formato de error de negocio que el resto del backend
// (`{ error, code }`, ver auth-errors.ts) más la línea y el motivo (CU5
// paso 4). Llega como error del Observable, con la forma de
// `HttpErrorResponse` (`status` + `error`).
export const STATEMENT_REJECTED_CODE = 'STATEMENT_REJECTED';

export interface BankImportRejectionBody {
  error: string;
  code: typeof STATEMENT_REJECTED_CODE;
  line: number;
  reason: string;
}

export interface BankImportRejection {
  line: number;
  reason: string;
}

export function extractImportRejection(err: unknown): BankImportRejection | null {
  const body = (err as { error?: Partial<BankImportRejectionBody> } | null)?.error;
  if (body?.code !== STATEMENT_REJECTED_CODE || body.line === undefined || !body.reason) return null;
  return { line: body.line, reason: body.reason };
}

// Resumen que muestra el modal (incorporados / duplicados / con error).
export interface BankImportSummary {
  incorporated: number;
  duplicates: number;
  errors: number;
}

export function summaryFromResponse(res: BankImportResponse): BankImportSummary {
  return { incorporated: res.rowsImported, duplicates: res.rowsDuplicated, errors: res.rowsRejected };
}
