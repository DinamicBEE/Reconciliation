import { ReconciliationStatus, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { Sale, Store } from '../../../shared/models/sale.model';
import { saleReconciliationStatus, saleSubtotal, saleTaxAmount, saleTotal } from './sale.util';

// Mismo orden/contenido que las columnas de la tabla de "Resumen de venta"
// (ver sales-dashboard.html) — "Acciones" no es dato, se excluye.
const CSV_HEADER = ['Fecha', 'Tienda', 'Cliente', 'Medio de pago', 'Estado', 'Subtotal', 'Impuestos', 'Total'];

// Escapado CSV (RFC 4180): solo se envuelve en comillas el campo que
// realmente las necesita (coma, comilla o salto de línea) — comillas
// internas se duplican.
function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY', mismo formato que `sale.date | date:
// 'dd/MM/yyyy'` en la tabla.
function formatCsvDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

// Los labels (tienda/medio de pago/estado) se inyectan en vez de vivir aquí
// para no duplicar los mismos `Record` que ya usa la plantilla
// (`storeLabel`/`tenderMediaLabel`/`statusLabel` en sales-dashboard.ts).
export interface SalesCsvLabels {
  store: Record<Store, string>;
  tenderMedia: Record<TenderMedia, string>;
  status: Record<ReconciliationStatus, string>;
}

// Genera el CSV para el botón "Exportar" del toolbar — recibe las ventas ya
// filtradas (`service.filteredSales()`): exporta lo que el usuario está
// viendo (los 5 filtros aplicados), no el catálogo completo ni solo la
// página actual de la tabla. Números en crudo (sin `$`/separador de miles)
// para que Excel los reconozca como numéricos al abrir el archivo.
export function buildSalesCsv(sales: Sale[], labels: SalesCsvLabels): string {
  const rows = sales.map((sale) => [
    formatCsvDate(sale.date),
    labels.store[sale.store],
    sale.customer.name,
    labels.tenderMedia[sale.tenderMedia],
    labels.status[saleReconciliationStatus(sale)],
    saleSubtotal(sale).toFixed(2),
    saleTaxAmount(sale).toFixed(2),
    saleTotal(sale).toFixed(2),
  ]);

  return [CSV_HEADER, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
}
