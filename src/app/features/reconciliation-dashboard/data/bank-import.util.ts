// Parseo/simulación del import masivo de "Importar movimientos bancarios"
// (modal de reconciliation-dashboard) — mismo formato de archivo que
// `difference-management/data/csv-import.util.ts`
// (referencia,descripcion,monto,fecha), pero sin atar el resultado a UNA
// orden puntual: aquí se procesa el archivo completo y se resume en 3
// números (incorporados/duplicados/con error), no en filas seleccionables.
// No se reutiliza `parseSettlementsCsv` porque ese sí construye
// `SettlementTransaction[]` listos para inyectarse al pool de una orden —
// este import es un resumen desconectado del resto de la data (ver
// MASTER.md, "no hay backend real todavía").

const EXPECTED_COLUMNS = ['referencia', 'descripcion', 'monto', 'fecha'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface BankImportRow {
  lineNumber: number;
  referencia: string;
  descripcion: string;
  monto: number;
  fecha: string;
}

export interface BankImportLineError {
  line: number;
  reason: string;
}

export interface BankImportParseResult {
  rows: BankImportRow[];
  errors: BankImportLineError[];
}

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

export interface BankImportSummary {
  incorporated: number;
  duplicates: number;
  errors: number;
}

// Ambas funciones reciben el `BankImportParseResult` YA calculado (no el
// texto crudo) — el componente parsea el archivo UNA sola vez (lo que
// también loguea en consola) y reutiliza ese mismo resultado aquí, en vez de
// volver a leer/parsear el archivo por cada función.

// "Duplicado" se simula contra las referencias que YA existen en
// `MOCK_SETTLEMENTS` del medio de pago elegido (ver
// sales-settlements.mock-data.ts) — así el resumen queda anclado a data real
// de la app en vez de un número inventado sin relación con nada.
export function summarizeBankImport(parsed: BankImportParseResult, existingReferences: ReadonlySet<string>): BankImportSummary {
  let duplicates = 0;
  for (const row of parsed.rows) {
    if (existingReferences.has(row.referencia)) duplicates++;
  }
  return { incorporated: parsed.rows.length - duplicates, duplicates, errors: parsed.errors.length };
}

export interface BankImportRejection {
  line: number;
  reason: string;
}

// Rechazo simulado del intento #2 en adelante (ver reconciliation-dashboard.ts,
// que decide CUÁNDO llamar a esto — no depende de si el archivo en verdad
// está mal formado). Si el parser ya encontró un error real se usa ese (más
// creíble); si el archivo era válido, se sintetiza uno sobre la última línea
// con datos para no dejar el caso sin un mensaje.
export function simulateBankImportRejection(parsed: BankImportParseResult): BankImportRejection {
  if (parsed.errors.length > 0) return parsed.errors[0];

  return {
    line: parsed.rows.at(-1)?.lineNumber ?? 1,
    reason: 'el separador de columnas no coincide con el formato esperado (se esperaba "referencia,descripcion,monto,fecha" separado por comas).',
  };
}
