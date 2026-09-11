import { ReconciliationStatus } from '../../../shared/models/reconciliation-item.model';
import { ElectronicInvoice, Sale } from '../../../shared/models/sale.model';

// IVA estándar México — hasta que exista una tasa por producto/categoría,
// una sola tasa global es suficiente para la demo.
export const SALE_TAX_RATE = 0.16;

export function saleSubtotal(sale: Sale): number {
  return sale.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

// Base gravable: subtotal ya con el descuento aplicado.
export function saleTaxableBase(sale: Sale): number {
  return saleSubtotal(sale) - sale.discountAmount;
}

export function saleTaxAmount(sale: Sale): number {
  return saleTaxableBase(sale) * SALE_TAX_RATE;
}

// Total real cobrado al cliente: subtotal - descuento + impuestos + propina.
export function saleTotal(sale: Sale): number {
  return saleTaxableBase(sale) + saleTaxAmount(sale) + sale.tipAmount;
}

// Traduce el MatchStatus de la venta (4 estados, a nivel de orden) al mismo
// vocabulario de 3 estados que usa la columna "Estado" de la tabla de
// Conciliación (`ReconciliationStatus`) — para que la columna "Estado" de
// "Resumen de venta" hable el mismo idioma en toda la app, en vez de mezclar
// "Cruzado"/"Por liquidar" (MatchStatus) con "Conciliado"/"Por conciliar"
// (ReconciliationStatus) según la pantalla. Mismo criterio de mapeo que
// `statusFor()` en `group-by-tender-day.util.ts` (soldAmount vs.
// settledAmount), aplicado aquí a una sola orden en vez de un grupo:
// coincide → conciliado; aún no hay liquidación → por conciliar; cualquier
// otra discrepancia (monto distinto, o una liquidación sin venta) →
// desconciliado.
export function saleReconciliationStatus(sale: Sale): ReconciliationStatus {
  switch (sale.reconciliationStatus) {
    case 'matched':
      return 'conciliado';
    case 'sale_only':
      return 'por_conciliar';
    default:
      return 'desconciliado';
  }
}

// Catálogo público de documentos electrónicos de la DIAN — el mismo enlace
// de consulta que trae codificado el QR de una factura electrónica
// colombiana real. `sales-dashboard` lo usa en "Documento electrónico" del
// Drawer ("Consultar en la DIAN"), armado a partir del CUFE del documento.
const DIAN_CATALOG_URL = 'https://catalogo-vpfe.dian.gov.co/document/searchqr';

export function dianQueryUrl(invoice: ElectronicInvoice): string {
  return `${DIAN_CATALOG_URL}?documentkey=${invoice.cufe}`;
}
