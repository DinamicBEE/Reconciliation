// Revisión del "Reporte Conciliar" de Bancolombia (único formato soportado).
// Ver docs/codigo/conciliacion.md#extracto-bancario

/** Encabezados del reporte de Bancolombia en su orden (columnas A a AA). */
export const BANCOLOMBIA_COLUMNS = [
  'NIT',
  'CODIGO ESTABLECIMIENTO',
  'ORIGEN DE LA COMPRA',
  'TIPO TRANSACCION',
  'FRANQUICIA',
  'IDENTIFICADOR DE RED',
  'FECHA DE TRANSACCION',
  'FECHA DE CANJE',
  'CUENTA DE CONSIGNACION',
  'VALOR COMPRA',
  'VALOR PROPINA',
  'VALOR IVA',
  'VALOR IMPOCONSUMO',
  'VALOR TOTAL',
  'VALOR COMISION',
  'VALOR RETEFUENTE',
  'VALOR RETE IVA',
  'VALOR RTE ICA',
  'VALOR PROVISION',
  'VALOR NETO',
  'CODIGO AUTORIZACION',
  'TIPO TARJETA',
  'NO TERMINAL',
  'TARJETA',
  'COMISION PORCENTUAL',
  'COMISION BASE',
  'FECHA DE COMPENSACION',
] as const;

const TOTAL_COLUMN = BANCOLOMBIA_COLUMNS.indexOf('VALOR TOTAL'); // N
// El periodo del nombre del archivo es el de la FECHA DE CANJE (abono), no el de la venta.
const DATE_COLUMN = BANCOLOMBIA_COLUMNS.indexOf('FECHA DE CANJE');

/**
 * Resultado de revisar el archivo: `invalid` no cumple el formato (columnas o sin movimientos),
 * `missing_fields` trae filas con campos ilegibles y `error` no se pudo leer.
 */
export type BankStatementState = 'valid' | 'invalid' | 'missing_fields' | 'error';

/** Etiqueta de la leyenda del card para cada {@link BankStatementState}. */
export const BANK_STATEMENT_STATE_LABEL: Record<BankStatementState, string> = {
  valid: 'Archivo válido',
  invalid: 'Archivo inválido',
  missing_fields: 'Campos faltantes',
  error: 'Error en el archivo',
};

/** Resumen del extracto que muestra el card del paso 1. */
export interface BankStatementSummary {
  totalRecords: number; // líneas de movimientos (sin el encabezado)
  totalAmount: number; // suma de "VALOR TOTAL"
  dateFrom: string; // 'yyyy-MM-dd' — menor FECHA DE CANJE
  dateTo: string; // 'yyyy-MM-dd' — mayor FECHA DE CANJE
}

/** Fila de la hoja con campos ilegibles (`row` es el número de fila, 1 = encabezado). */
export interface BankStatementInvalidRow {
  row: number;
  fields: string[];
}

/** Estado de la revisión; el resumen solo existe con `valid`. */
export interface BankStatementResult {
  state: BankStatementState;
  summary: BankStatementSummary | null;
  reason: string | null;
  /** Todas las columnas esperadas que no están en el encabezado. */
  missingColumns: string[];
  /** Todas las filas con algún campo ilegible. */
  invalidRows: BankStatementInvalidRow[];
}

type SheetRow = readonly unknown[];

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toUpperCase();
}

function isEmptyRow(row: SheetRow): boolean {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
}

// 'yyyyMMdd' → 'yyyy-MM-dd' (null si no es una fecha de calendario real).
function parseCompactDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const valid =
    date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
  return valid ? `${year}-${month}-${day}` : null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function invalid(reason: string, missingColumns: string[] = []): BankStatementResult {
  return { state: 'invalid', summary: null, reason, missingColumns, invalidRows: [] };
}

/**
 * Revisa las filas de la hoja (la primera es el encabezado) y calcula el resumen del card.
 *
 * @returns `invalid` si el encabezado no coincide o no hay movimientos; `missing_fields` si una fila trae "VALOR TOTAL" o "FECHA DE CANJE" ilegibles.
 * @see docs/codigo/conciliacion.md#extracto-bancario
 */
export function analyzeBancolombiaReport(rows: readonly SheetRow[]): BankStatementResult {
  const header = rows[0];
  if (!header || isEmptyRow(header)) return invalid('El archivo está vacío.');

  const present = new Set(header.map(normalizeHeader));
  const missingColumns = BANCOLOMBIA_COLUMNS.filter((name) => !present.has(name));
  if (missingColumns.length > 0) {
    return invalid('No coincide con el formato del reporte de Bancolombia: faltan columnas.', missingColumns);
  }
  const misplaced = BANCOLOMBIA_COLUMNS.filter((name, index) => normalizeHeader(header[index]) !== name);
  if (misplaced.length > 0) {
    return invalid(`Las columnas están fuera de orden: ${misplaced.join(', ')}.`);
  }

  let totalRecords = 0;
  let totalCents = 0;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  const invalidRows: BankStatementInvalidRow[] = [];

  rows.slice(1).forEach((row, index) => {
    if (isEmptyRow(row)) return;
    totalRecords++;
    const amount = parseAmount(row[TOTAL_COLUMN]);
    const date = parseCompactDate(row[DATE_COLUMN]);
    if (amount === null || date === null) {
      const fields = [amount === null ? 'VALOR TOTAL' : '', date === null ? 'FECHA DE CANJE' : ''].filter(Boolean);
      invalidRows.push({ row: index + 2, fields });
      return;
    }
    // En centavos enteros: sumar miles de decimales en flotante acumula error.
    totalCents += Math.round(amount * 100);
    if (dateFrom === null || date < dateFrom) dateFrom = date;
    if (dateTo === null || date > dateTo) dateTo = date;
  });

  if (totalRecords === 0) return invalid('El archivo no contiene movimientos.');
  if (invalidRows.length > 0) {
    return {
      state: 'missing_fields',
      summary: null,
      reason: `${invalidRows.length} fila(s) con campos inválidos.`,
      missingColumns: [],
      invalidRows,
    };
  }

  return {
    state: 'valid',
    summary: { totalRecords, totalAmount: totalCents / 100, dateFrom: dateFrom!, dateTo: dateTo! },
    reason: null,
    missingColumns: [],
    invalidRows: [],
  };
}
