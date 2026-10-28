import { MatchStatus, TenderMedia } from './reconciliation-item.model';

/** Sucursal donde se registró la venta (columna y filtro "Tienda"). */
export type Store = 'polanco' | 'condesa' | 'roma' | 'centro';

/** Etiqueta visible de cada {@link Store}. */
export const STORE_LABEL: Record<Store, string> = {
  polanco: 'Sucursal Polanco',
  condesa: 'Sucursal Condesa',
  roma: 'Sucursal Roma',
  centro: 'Sucursal Centro',
};

/** Línea de producto de una venta. */
export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Tipo de persona del cliente; la etiqueta sale de `CountryProfile.personType`.
 *
 * @remarks Ausente en un receptor genérico (`Cliente mostrador`): el Drawer muestra un texto de respaldo.
 */
export type PersonType = 'natural' | 'juridica';

/** Cliente (receptor fiscal) de la venta. */
export interface SaleCustomer {
  name: string;
  email?: string;
  phone?: string;
  /** RFC (MX) o NIT/cédula (CO); sin identificar, `CountryProfile.taxId.genericId`. */
  taxId: string;
  personType?: PersonType;
  /** Código de `CountryProfile.taxRegime.options` (régimen SAT o responsabilidad de IVA DIAN). */
  taxRegime?: string;
}

/**
 * Comprobante fiscal obligatorio de la venta: CFDI (SAT) o factura electrónica (DIAN).
 *
 * @remarks Campos neutros por país; las etiquetas salen de `CountryProfile.invoice`. No es `Sale.folio`.
 * @see docs/codigo/ventas.md#modelo-de-venta
 */
export interface ElectronicInvoice {
  series: string;
  number: string;
  /** UUID del timbre SAT o CUFE de la DIAN; es lo que codifica el QR. */
  fiscalId: string;
  issuedAt: string; // ISO datetime con el offset fiscal del país
  // Solo CFDI (`c_UsoCFDI`, `c_MetodoPago`); ausentes en Colombia
  // (`CountryProfile.invoice.hasCfdiFields`).
  cfdiUse?: string;
  paymentMethod?: string;
}

/** Pago aplicado a la venta; es arreglo para admitir pagos divididos. */
export interface SalePayment {
  id: string;
  method: TenderMedia;
  amount: number;
  reference: string;
  authCode?: string;
}

/** Estado comercial de la venta (no el de conciliación). */
export type SaleStatus = 'completada' | 'cancelada';

/** Asiento NetSuite de una venta contabilizada (CU4/CU11 del DED). */
export interface NetSuiteReference {
  entryId: string; // Id del asiento contable en NetSuite
  postedAt: string; // ISO datetime en que se contabilizó
}

/** Conciliación registrada de una venta ya conciliada (CU4/CU7 del DED). */
export interface SaleReconciliationReference {
  id: string; // Id de la conciliación relacionada
  date: string; // ISO date en que se concilió
}

/**
 * Venta del POS tal como la muestra "Resumen de venta".
 *
 * @see docs/codigo/ventas.md#modelo-de-venta
 */
export interface Sale {
  id: string;
  /** Folio interno del POS, sin validez fiscal (ver {@link ElectronicInvoice}). */
  folio: string;
  /** Referencia principal; evita que la tabla asuma "el primer pago" con pagos divididos. */
  reference: string;
  date: string; // ISO date
  time: string; // HH:mm
  store: Store;
  /** Id de subsidiaria del catálogo de sesión (filtro "Empresa"); `null` si no aplica. */
  subsidiariaId: number | null;
  tenderMedia: TenderMedia;
  /**
   * Estado por orden, de 4 valores; lo usa el Drawer.
   *
   * @see docs/codigo/ventas.md#estado-de-conciliacion-de-venta
   */
  reconciliationStatus: MatchStatus;
  /** `null` mientras la venta no esté contabilizada. */
  netsuite: NetSuiteReference | null;
  /** `null` si sigue por conciliar o fue desconciliada. */
  reconciliation: SaleReconciliationReference | null;
  customer: SaleCustomer;
  invoice: ElectronicInvoice;
  items: SaleItem[];
  payments: SalePayment[];
  discountAmount: number;
  discountReason: string | null;
  tipAmount: number;
  status: SaleStatus;
}
