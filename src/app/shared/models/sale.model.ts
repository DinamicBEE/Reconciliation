import { MatchStatus, TenderMedia } from './reconciliation-item.model';

export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface SaleCustomer {
  name: string;
  email?: string;
  phone?: string;
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
  tenderMedia: TenderMedia;
  // Estado de conciliación de esta venta contra el medio de pago — reusa
  // MatchStatus (mismo tipo/tag que reconciliation-dashboard y
  // difference-management), no un enum nuevo: es literalmente el mismo
  // concepto, "¿ya se cruzó esta venta contra lo que liquidó el proveedor?".
  reconciliationStatus: MatchStatus;
  customer: SaleCustomer;
  items: SaleItem[];
  payments: SalePayment[];
  discountAmount: number;
  discountReason: string | null;
  tipAmount: number;
  status: SaleStatus;
}
