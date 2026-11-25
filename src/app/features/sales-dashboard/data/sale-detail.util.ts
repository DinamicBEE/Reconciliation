import { DianCode, SaleDetail } from './sales-api.service';

// Tributos más comunes del catálogo 23 de la DIAN; un código nuevo se muestra tal cual.
const DIAN_TAX_NAMES: Record<string, string> = {
  '01': 'IVA',
  '02': 'IC',
  '03': 'ICA',
  '04': 'INC',
  '22': 'Impuesto a las bolsas',
};

/**
 * Documento del cliente para el panel: tipo, número y dígito de verificación (NIT).
 *
 * @see docs/codigo/ventas.md#detalle-de-venta
 */
export function customerDocumentLabel(customer: NonNullable<SaleDetail['customer']>): string {
  const number = customer.checkDigit ? `${customer.document}-${customer.checkDigit}` : customer.document;
  return customer.documentType ? `${customer.documentType.description} ${number}` : number;
}

/** Códigos DIAN como "10 Efectivo, 48 Tarjeta Crédito"; `'—'` si no hay. */
export function dianCodesLabel(codes: readonly DianCode[]): string {
  return codes.length ? codes.map((c) => `${c.code} ${c.description}`).join(', ') : '—';
}

/** Franquicia y adquirente de un pago con tarjeta; `'—'` si no es tarjeta. */
export function cardLabel(cardNetwork: string | null, acquirer: string | null): string {
  return [cardNetwork, acquirer].filter(Boolean).join(' · ') || '—';
}

/** Nombre del tributo DIAN (catálogo 23) con su código. */
export function taxLabel(code: string): string {
  const name = DIAN_TAX_NAMES[code];
  return name ? `${name} (${code})` : code;
}
