import { MatchStatus, TenderMedia } from './reconciliation-item.model';

// Sucursal donde se registró la venta — filtro de la tabla de "Resumen de
// venta" (columna "Tienda"). Único consumidor hoy (sales-dashboard); si un
// segundo feature lo necesita, sube a reconciliation-item.model.ts junto a
// TenderMedia (mismo criterio de siempre, ver MASTER.md).
export type Store = 'polanco' | 'condesa' | 'roma' | 'centro';

export const STORE_LABEL: Record<Store, string> = {
  polanco: 'Sucursal Polanco',
  condesa: 'Sucursal Condesa',
  roma: 'Sucursal Roma',
  centro: 'Sucursal Centro',
};

export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

// Tipo de persona del cliente — la etiqueta depende del país
// (`CountryProfile.personType`: física/moral en MX, natural/jurídica en CO).
// Opcional: un receptor genérico sin registro (`Cliente mostrador`) no lo
// trae y el Drawer cae al fallback "Sin tipo de persona registrado".
export type PersonType = 'natural' | 'juridica';

export interface SaleCustomer {
  name: string;
  email?: string;
  phone?: string;
  // Identificación fiscal del cliente — RFC (MX) / NIT o cédula (CO). Un
  // cliente sin identificar lleva el id genérico del país
  // (`CountryProfile.taxId.genericId`: XAXX010101000 / 222222222222).
  taxId: string;
  personType?: PersonType;
  // Código del régimen fiscal en el catálogo del país activo
  // (`CountryProfile.taxRegime.options`: c_RegimenFiscal del SAT o
  // responsabilidad de IVA de la DIAN). Opcional, igual que `personType`.
  taxRegime?: string;
}

// Comprobante fiscal de la venta — CFDI (México, SAT) o factura electrónica
// (Colombia, DIAN). Distinto de `Sale.folio` (el folio interno del POS, sin
// validez fiscal). Nombres de campo neutros; la etiqueta de cada uno sale de
// `CountryProfile.invoice`:
// - `series` + `number`: serie y folio del CFDI / prefijo y consecutivo de
//   la resolución de facturación DIAN.
// - `fiscalId`: folio fiscal (UUID) que asigna el SAT al timbrar / CUFE
//   (Código Único de Facturación Electrónica) de la DIAN. Es lo que trae
//   codificado el QR del documento y permite consultarlo ante la autoridad
//   (`CountryProfile.invoice.queryUrl`).
// NO es opcional: la facturación electrónica es obligatoria en ambos países
// para toda venta, sin importar quién compre.
export interface ElectronicInvoice {
  series: string;
  number: string;
  fiscalId: string;
  issuedAt: string; // ISO datetime con el offset fiscal del país
  // Solo CFDI (México): uso del CFDI (c_UsoCFDI) y método de pago
  // (c_MetodoPago). Ausentes en Colombia (`CountryProfile.invoice.hasCfdiFields`).
  cfdiUse?: string;
  paymentMethod?: string;
}

// Un pago aplicado a la venta — normalmente uno solo, pero se modela como
// arreglo para no bloquear pagos divididos (p. ej. parte efectivo + parte
// tarjeta) el día que exista esa necesidad real.
export interface SalePayment {
  id: string;
  method: TenderMedia;
  amount: number;
  reference: string;
  authCode?: string;
}

export type SaleStatus = 'completada' | 'cancelada';

export interface Sale {
  id: string;
  folio: string;
  // Referencia principal de la venta para la tabla — normalmente coincide
  // con la del pago único; existe a nivel Sale (no solo en SalePayment) para
  // no forzar a la tabla a asumir "el primer pago" si algún día hay varios.
  reference: string;
  date: string; // ISO date
  time: string; // HH:mm
  store: Store;
  tenderMedia: TenderMedia;
  // Estado de conciliación de esta venta contra el medio de pago, a nivel de
  // ORDEN — reusa MatchStatus (mismo tipo/tag que difference-management; NO
  // el mismo que la tabla de reconciliation-dashboard, que agrupa por
  // día+medio de pago con un `ReconciliationStatus` de 3 estados — ver
  // `saleReconciliationStatus()` en `sale.util.ts`, que deriva ESE
  // vocabulario a partir de este campo para la columna "Estado" de la
  // tabla). Sigue viva aquí para el Drawer ("Estado de conciliación"),
  // que sí necesita la granularidad de 4 estados por orden.
  reconciliationStatus: MatchStatus;
  customer: SaleCustomer;
  invoice: ElectronicInvoice;
  items: SaleItem[];
  payments: SalePayment[];
  discountAmount: number;
  discountReason: string | null;
  tipAmount: number;
  status: SaleStatus;
}
