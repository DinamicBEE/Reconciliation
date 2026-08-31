import { SettlementTransaction, TenderMedia } from '../../../shared/models/reconciliation-item.model';

const EXPECTED_COLUMNS = ['referencia', 'descripcion', 'monto', 'fecha'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CsvImportResult {
  rows: SettlementTransaction[];
  errors: string[];
}

// Parser deliberadamente simple (split por coma, sin soporte de comillas ni
// comas dentro de un campo) — suficiente para el CSV de referencia,
// referencia/descripcion/monto/fecha. El día que esto sea un import real
// contra backend, esto se reemplaza por el parseo/validación del servidor.
export function parseSettlementsCsv(csvText: string, tenderMedia: TenderMedia): CsvImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ['El archivo está vacío.'] };
  }

  const firstColumns = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const hasHeader = EXPECTED_COLUMNS.every((col, i) => firstColumns[i] === col);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: SettlementTransaction[] = [];
  const errors: string[] = [];

  dataLines.forEach((line, index) => {
    const lineNumber = index + (hasHeader ? 2 : 1);
    const columns = line.split(',').map((c) => c.trim());

    if (columns.length < 4) {
      errors.push(`Línea ${lineNumber}: se esperaban 4 columnas (referencia,descripcion,monto,fecha).`);
      return;
    }

    const [referencia, descripcion, montoRaw, fecha] = columns;
    const amount = Number(montoRaw);

    if (!referencia) {
      errors.push(`Línea ${lineNumber}: falta la referencia.`);
      return;
    }
    if (Number.isNaN(amount)) {
      errors.push(`Línea ${lineNumber}: "${montoRaw}" no es un monto válido.`);
      return;
    }
    if (!ISO_DATE.test(fecha)) {
      errors.push(`Línea ${lineNumber}: "${fecha}" no es una fecha válida (usa AAAA-MM-DD).`);
      return;
    }

    rows.push({
      id: `IMP-${tenderMedia}-${lineNumber}-${referencia}`,
      date: fecha,
      orderId: referencia,
      tenderMedia,
      amount,
      batchId: 'CSV-IMPORTADO',
      description: descripcion || 'Transacción importada por CSV',
    });
  });

  return { rows, errors };
}
