// Importación masiva simulada de movimientos bancarios (`referencia,descripcion,monto,fecha`).
// Ver docs/codigo/conciliacion.md#importacion-masiva

const EXPECTED_COLUMNS = ['referencia', 'descripcion', 'monto', 'fecha'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fila válida del archivo; `lineNumber` es la línea en el archivo (1 = primera). */
export interface BankImportRow {
  lineNumber: number;
  referencia: string;
  descripcion: string;
  monto: number;
  fecha: string;
}

/** Error de una línea del archivo, con el motivo que se muestra. */
export interface BankImportLineError {
  line: number;
  reason: string;
}

/** Filas válidas y errores de un archivo de importación. */
export interface BankImportParseResult {
  rows: BankImportRow[];
  errors: BankImportLineError[];
}

/**
 * Parsea el archivo de importación; el encabezado es opcional.
 *
 * @returns Filas válidas y errores por línea; un archivo vacío da un error en la línea 1.
 * @see docs/codigo/conciliacion.md#importacion-masiva
 */
export function parseBankImportFile(text: string): BankImportParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, reason: 'el archivo está vacío.' }] };
  }

  const firstColumns = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const hasHeader = EXPECTED_COLUMNS.every((col, i) => firstColumns[i] === col);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: BankImportRow[] = [];
  const errors: BankImportLineError[] = [];

  dataLines.forEach((line, index) => {
    const lineNumber = index + (hasHeader ? 2 : 1);
    const columns = line.split(',').map((c) => c.trim());

    if (columns.length < 4) {
      errors.push({ line: lineNumber, reason: 'se esperaban 4 columnas (referencia,descripcion,monto,fecha).' });
      return;
    }

    const [referencia, descripcion, montoRaw, fecha] = columns;
    const monto = Number(montoRaw);

    if (!referencia) {
      errors.push({ line: lineNumber, reason: 'falta la referencia.' });
      return;
    }
    if (Number.isNaN(monto)) {
      errors.push({ line: lineNumber, reason: `"${montoRaw}" no es un monto válido.` });
      return;
    }
    if (!ISO_DATE.test(fecha)) {
      errors.push({ line: lineNumber, reason: `"${fecha}" no es una fecha válida (usa AAAA-MM-DD).` });
      return;
    }

    rows.push({ lineNumber, referencia, descripcion, monto, fecha });
  });

  return { rows, errors };
}

/** Resumen del modal: movimientos incorporados, duplicados y líneas con error. */
export interface BankImportSummary {
  incorporated: number;
  duplicates: number;
  errors: number;
}

/**
 * Resume un archivo ya parseado.
 *
 * @param existingReferences - Referencias de las liquidaciones mock del medio elegido; coincidir cuenta como duplicado.
 * @see docs/codigo/conciliacion.md#importacion-masiva
 */
export function summarizeBankImport(parsed: BankImportParseResult, existingReferences: ReadonlySet<string>): BankImportSummary {
  let duplicates = 0;
  for (const row of parsed.rows) {
    if (existingReferences.has(row.referencia)) duplicates++;
  }
  return { incorporated: parsed.rows.length - duplicates, duplicates, errors: parsed.errors.length };
}

/** Rechazo simulado de una importación: línea y motivo. */
export interface BankImportRejection {
  line: number;
  reason: string;
}

/**
 * Arma el rechazo simulado; el componente decide cuándo rechazar.
 *
 * @returns El primer error real del parser o, si no hay, uno sintético sobre la última línea con datos.
 * @see docs/codigo/conciliacion.md#importacion-masiva
 */
export function simulateBankImportRejection(parsed: BankImportParseResult): BankImportRejection {
  if (parsed.errors.length > 0) return parsed.errors[0];

  return {
    line: parsed.rows.at(-1)?.lineNumber ?? 1,
    reason: 'el separador de columnas no coincide con el formato esperado (se esperaba "referencia,descripcion,monto,fecha" separado por comas).',
  };
}
