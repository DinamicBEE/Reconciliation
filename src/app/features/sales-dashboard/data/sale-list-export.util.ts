import { SaleListItem } from './sales-api.service';

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  INVOICE: 'Factura',
  CREDIT_NOTE: 'Nota crédito',
};

function escapeCsv(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Arma el CSV de "Resumen de venta" con las filas de `GET /sales` (todas las páginas filtradas).
 *
 * @param labels - Etiqueta de la columna de ubicación, que depende del país.
 * @see docs/codigo/ventas.md#exportacion
 */
export function buildSaleListCsv(rows: readonly SaleListItem[], labels: { location: string }): string {
  const header = [
    'Folio',
    'Tipo',
    'Fecha',
    'Hora',
    labels.location,
    'Cliente',
    'Documento del cliente',
    'Medio de pago',
    'Pagos',
    'Estado',
    'Subtotal',
    'Impuestos',
    'Total',
  ];
  const lines = rows.map((row) =>
    [
      row.folio,
      DOCUMENT_TYPE_LABEL[row.documentType] ?? row.documentType,
      row.date,
      row.time ?? '',
      row.store.name,
      row.customer?.name ?? '',
      row.customer?.document ?? '',
      row.tenderMedia?.description ?? '',
      row.tenderMedia?.paymentCount ?? 0,
      row.reconciliationStatus.description,
      row.subtotal.toFixed(2),
      row.taxes.toFixed(2),
      row.total.toFixed(2),
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [header.map(escapeCsv).join(','), ...lines].join('\n');
}
