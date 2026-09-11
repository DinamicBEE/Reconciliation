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

// Tipo de persona ante la DIAN — parte de la "identificación del cliente"
// en el Drawer de detalle de venta (`sales-dashboard`). Opcional: un
// consumidor final sin registro (`Cliente mostrador`) no lo trae y el
// Drawer cae al fallback "Sin tipo de persona registrado".
export type PersonType = 'natural' | 'juridica';

export const PERSON_TYPE_LABEL: Record<PersonType, string> = {
  natural: 'Persona natural',
  juridica: 'Persona jurídica',
};

// Responsabilidad de IVA del cliente — terminología vigente de la DIAN
// (reemplazó "Régimen común"/"Régimen simplificado" tras la Ley 2010 de
// 2019). Mismo criterio opcional que `personType`.
export type TaxRegime = 'responsable_iva' | 'no_responsable';

export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  responsable_iva: 'Responsable de IVA',
  no_responsable: 'No responsable de IVA',
};

export interface SaleCustomer {
  name: string;
  email?: string;
  phone?: string;
  // Identificación fiscal básica del cliente — opcional: ver `PersonType`/
  // `TaxRegime` arriba.
  personType?: PersonType;
  taxRegime?: TaxRegime;
}

// Factura electrónica de venta (DIAN) — el documento FISCAL de la venta,
// distinto de `Sale.folio` (el folio interno del POS, sin validez ante la
// DIAN). `prefix` + `number` son el consecutivo autorizado por la
// resolución de facturación vigente; `cufe` (Código Único de Facturación
// Electrónica) identifica el documento de forma inequívoca ante la DIAN — es
// lo que trae codificado el QR de una factura electrónica real, y lo que
// permite consultarla en el catálogo público de la DIAN (ver `dianQueryUrl`
// en `sale.util.ts`). A diferencia de `personType`/`taxRegime` del cliente,
// NO es opcional: la facturación electrónica es un requisito legal de la
// DIAN para toda venta, sin importar quién compre.
export interface ElectronicInvoice {
  prefix: string;
  number: string;
  cufe: string;
  issuedAt: string; // ISO datetime, con offset -05:00 (Colombia no observa horario de verano)
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
