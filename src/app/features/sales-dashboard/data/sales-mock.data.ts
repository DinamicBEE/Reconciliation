import { MatchStatus, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { ACTIVE_COUNTRY } from '../../../core/country/active-country';
import { CountryProfile } from '../../../core/country/country.model';
import { ElectronicInvoice, Sale, SaleCustomer, Store } from '../../../shared/models/sale.model';
import { saleTotal } from './sale.util';

// Id 1: única subsidiaria sembrada en el backend; todas las ventas del mock le pertenecen.
const DEFAULT_SUBSIDIARIA_ID = 1;

// Venta "en bruto": `withFiscalData()` completa comprobante e identificación fiscal
// (desde `vatResponsible`) y `withPayment()` deriva los pagos si no vienen.
type MockCustomer = Omit<SaleCustomer, 'taxId' | 'taxRegime'> & { vatResponsible?: boolean };
type RawSale = Omit<Sale, 'payments' | 'invoice' | 'customer'> & { customer: MockCustomer; payments?: Sale['payments'] };

// 7 ventas de "hoy" (27 ago) a mano para la demo del Drawer; invariantes en
// MASTER.md "Invariantes del mock de ventas (`sales-mock.data.ts`)".
const TODAY_SALES: RawSale[] = [
  {
    id: 'V-2001',
    folio: 'F-100501',
    reference: 'CORTE-0827-01',
    date: '2026-08-27',
    time: '08:12',
    store: 'polanco',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'efectivo',
    reconciliationStatus: 'matched',
    // Contabilizada y conciliada, coherente con `matched`.
    netsuite: { entryId: 'JE-2026-08-27-0041', postedAt: '2026-08-27T18:30:00-06:00' },
    reconciliation: { id: 'CONC-2026-08-27-EFECTIVO', date: '2026-08-27' },
    customer: { name: 'Cliente mostrador' },
    items: [
      { id: 'I-1', productName: 'Café americano', quantity: 4, unitPrice: 45 },
      { id: 'I-2', productName: 'Croissant', quantity: 3, unitPrice: 38 },
      { id: 'I-3', productName: 'Jugo de naranja', quantity: 3, unitPrice: 35 },
      { id: 'I-4', productName: 'Muffin de arándano', quantity: 4, unitPrice: 40 },
      { id: 'I-5', productName: 'Pay de queso', quantity: 3, unitPrice: 68 },
      { id: 'I-6', productName: 'Té helado', quantity: 4, unitPrice: 38 },
    ],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 0,
    status: 'completada',
  },
  {
    id: 'V-2002',
    folio: 'F-100502',
    reference: 'RAPPI-LIQ-901',
    date: '2026-08-27',
    time: '09:04',
    store: 'condesa',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'rappi',
    reconciliationStatus: 'sale_only',
    // Contabilizada pero sin conciliar (`sale_only`): la contabilización es
    // independiente de la conciliación, por eso no lleva `reconciliation`.
    netsuite: { entryId: 'JE-2026-08-27-0042', postedAt: '2026-08-27T18:30:00-06:00' },
    reconciliation: null,
    customer: {
      name: 'Diego Salinas',
      phone: '55 1234 8890',
      personType: 'natural',
      vatResponsible: false,
    },
    items: [
      { id: 'I-1', productName: 'Sándwich club', quantity: 3, unitPrice: 95 },
      { id: 'I-2', productName: 'Refresco 600ml', quantity: 3, unitPrice: 32 },
      { id: 'I-3', productName: 'Papas a la francesa', quantity: 3, unitPrice: 42 },
      { id: 'I-4', productName: 'Ensalada césar', quantity: 2, unitPrice: 110 },
      { id: 'I-5', productName: 'Latte', quantity: 3, unitPrice: 52 },
      { id: 'I-6', productName: 'Pay de queso', quantity: 2, unitPrice: 68 },
    ],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 15,
    status: 'completada',
  },
  {
    id: 'V-2003',
    folio: 'F-100503',
    reference: 'SPEI0000129981',
    date: '2026-08-27',
    time: '10:47',
    store: 'roma',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'bbva',
    reconciliationStatus: 'matched',
    netsuite: { entryId: 'JE-2026-08-27-0043', postedAt: '2026-08-27T18:30:00-06:00' },
    reconciliation: { id: 'CONC-2026-08-27-BBVA', date: '2026-08-27' },
    customer: {
      name: 'María Fernanda Ruiz',
      email: 'mf.ruiz@correo.com',
      personType: 'natural',
      vatResponsible: true,
    },
    items: [
      { id: 'I-1', productName: 'Ensalada césar', quantity: 3, unitPrice: 110 },
      { id: 'I-2', productName: 'Agua embotellada', quantity: 4, unitPrice: 25 },
      { id: 'I-3', productName: 'Plato del día', quantity: 3, unitPrice: 145 },
      { id: 'I-4', productName: 'Copa de vino', quantity: 2, unitPrice: 120 },
      { id: 'I-5', productName: 'Postre de la casa', quantity: 3, unitPrice: 65 },
    ],
    discountAmount: 130,
    discountReason: 'Cliente frecuente (10%)',
    tipAmount: 15,
    status: 'completada',
  },
  {
    id: 'V-2004',
    folio: 'F-100504',
    reference: 'DIDI-041',
    date: '2026-08-27',
    time: '11:20',
    store: 'centro',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'didi_food',
    reconciliationStatus: 'sale_only',
    netsuite: null,
    reconciliation: null,
    customer: {
      name: 'Jorge Ibáñez',
      phone: '55 9902 1147',
      personType: 'natural',
      vatResponsible: false,
    },
    items: [
      { id: 'I-1', productName: 'Latte', quantity: 4, unitPrice: 52 },
      { id: 'I-2', productName: 'Pay de queso', quantity: 4, unitPrice: 68 },
      { id: 'I-3', productName: 'Muffin de arándano', quantity: 3, unitPrice: 40 },
      { id: 'I-4', productName: 'Té helado', quantity: 3, unitPrice: 38 },
      { id: 'I-5', productName: 'Croissant', quantity: 3, unitPrice: 38 },
      { id: 'I-6', productName: 'Jugo de naranja', quantity: 3, unitPrice: 35 },
    ],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 0,
    status: 'completada',
  },
  {
    id: 'V-2005',
    folio: 'F-100505',
    reference: 'CORTE-0827-02',
    date: '2026-08-27',
    time: '12:35',
    store: 'polanco',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'efectivo',
    reconciliationStatus: 'amount_mismatch',
    netsuite: null,
    reconciliation: null,
    customer: { name: 'Cliente mostrador' },
    items: [
      { id: 'I-1', productName: 'Té helado', quantity: 4, unitPrice: 38 },
      { id: 'I-2', productName: 'Sándwich club', quantity: 3, unitPrice: 95 },
      { id: 'I-3', productName: 'Café americano', quantity: 3, unitPrice: 45 },
      { id: 'I-4', productName: 'Croissant', quantity: 3, unitPrice: 38 },
      { id: 'I-5', productName: 'Refresco 600ml', quantity: 3, unitPrice: 32 },
      { id: 'I-6', productName: 'Papas a la francesa', quantity: 3, unitPrice: 42 },
    ],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 0,
    status: 'cancelada',
  },
  {
    id: 'V-2006',
    folio: 'F-100506',
    reference: 'RAPPI-LIQ-902',
    date: '2026-08-27',
    time: '13:10',
    store: 'condesa',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'rappi',
    reconciliationStatus: 'sale_only',
    netsuite: null,
    reconciliation: null,
    customer: {
      name: 'Ana Paola Cortés',
      phone: '55 4471 0032',
      personType: 'juridica',
      vatResponsible: true,
    },
    items: [
      { id: 'I-1', productName: 'Ensalada césar', quantity: 3, unitPrice: 110 },
      { id: 'I-2', productName: 'Refresco 600ml', quantity: 3, unitPrice: 32 },
      { id: 'I-3', productName: 'Croissant', quantity: 3, unitPrice: 38 },
      { id: 'I-4', productName: 'Plato del día', quantity: 2, unitPrice: 145 },
      { id: 'I-5', productName: 'Copa de vino', quantity: 2, unitPrice: 120 },
    ],
    discountAmount: 50,
    discountReason: 'Cupón de bienvenida app',
    tipAmount: 10,
    status: 'completada',
  },
  {
    id: 'V-2007',
    folio: 'F-100507',
    reference: 'SPEI0000129990',
    date: '2026-08-27',
    time: '14:02',
    store: 'roma',
    subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
    tenderMedia: 'bbva', // método "principal" para la tabla/filtros — la cuenta se pagó mixto
    reconciliationStatus: 'matched',
    netsuite: null,
    reconciliation: null,
    customer: {
      name: 'Roberto Nieto',
      email: 'r.nieto@correo.com',
      personType: 'natural',
      vatResponsible: true,
    },
    items: [
      { id: 'I-1', productName: 'Café americano', quantity: 4, unitPrice: 45 },
      { id: 'I-2', productName: 'Latte', quantity: 3, unitPrice: 52 },
      { id: 'I-3', productName: 'Pay de queso', quantity: 3, unitPrice: 68 },
      { id: 'I-4', productName: 'Muffin de arándano', quantity: 3, unitPrice: 40 },
      { id: 'I-5', productName: 'Plato del día', quantity: 2, unitPrice: 145 },
      { id: 'I-6', productName: 'Copa de vino', quantity: 2, unitPrice: 120 },
    ],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 20,
    status: 'completada',
    // Pago mixto: cuenta + IVA con tarjeta, propina en efectivo — los dos
    // montos deben sumar exactamente el total (1190 + 190.40 + 20 = 1400.40).
    payments: [
      { id: 'PAY-V-2007-1', method: 'bbva', amount: 1380.4, reference: 'SPEI0000129990' },
      { id: 'PAY-V-2007-2', method: 'efectivo', amount: 20, reference: 'EFE-PROPINA-0827' },
    ],
  },
];

// --- Generador de días previos (determinístico por índice) -----------------
// Debe declararse antes de `RAW_SALES`, que llama a `buildDay` al evaluar el módulo.
const PRODUCT_CATALOG: { name: string; price: number }[] = [
  { name: 'Café americano', price: 45 },
  { name: 'Croissant', price: 38 },
  { name: 'Sándwich club', price: 95 },
  { name: 'Refresco 600ml', price: 32 },
  { name: 'Papas a la francesa', price: 42 },
  { name: 'Ensalada césar', price: 110 },
  { name: 'Agua embotellada', price: 25 },
  { name: 'Latte', price: 52 },
  { name: 'Pay de queso', price: 68 },
  { name: 'Té helado', price: 38 },
  { name: 'Muffin de arándano', price: 40 },
  { name: 'Jugo de naranja', price: 35 },
  // Ticket alto: permiten superar $1,000 con cantidades realistas.
  { name: 'Plato del día', price: 145 },
  { name: 'Copa de vino', price: 120 },
  { name: 'Postre de la casa', price: 65 },
];

const CUSTOMER_POOL: string[] = [
  'Cliente mostrador',
  'Diego Salinas',
  'María Fernanda Ruiz',
  'Jorge Ibáñez',
  'Ana Paola Cortés',
  'Roberto Nieto',
  'Luis Ángel Torres',
  'Fernanda Camacho',
  'Ricardo Ponce',
  'Sofía Reyes',
  'Carlos Medina',
  'Valeria Sánchez',
  'Pablo Herrera',
  'Daniela Gómez',
];

const TENDER_CYCLE: TenderMedia[] = ['bbva', 'rappi', 'efectivo', 'didi_food'];

const STORE_CYCLE: Store[] = ['polanco', 'condesa', 'roma', 'centro'];

// Método secundario de `withPayment()`: efectivo (propina en mano) para los
// electrónicos; BBVA (parte con tarjeta) para efectivo.
const SECONDARY_TENDER: Record<TenderMedia, TenderMedia> = {
  bbva: 'efectivo',
  rappi: 'efectivo',
  didi_food: 'efectivo',
  efectivo: 'bbva',
};

// Días previos conciliados en su mayoría; 1 de cada 6 queda `sale_only` (el cruce tarda 1-2 días).
const RECONCILIATION_CYCLE: MatchStatus[] = ['matched', 'matched', 'matched', 'matched', 'matched', 'sale_only'];

const REFERENCE_PREFIX: Record<TenderMedia, string> = {
  bbva: 'SPEI',
  rappi: 'RAPPI-LIQ',
  efectivo: 'CORTE',
  didi_food: 'DIDI',
};

// Piso de subtotal: con el 10 % de descuento máximo y 16 % de IVA, (1150 × 0.9) × 1.16 ≈ $1,200.
const MIN_SEED_SUBTOTAL = 1150;

// Coprimo con el tamaño del catálogo (15): hasta 6 productos por venta sin repetir índice.
const CATALOG_STEP = 7;

function buildDay(date: string, count: number): RawSale[] {
  const daySeed = Number(date.replace(/-/g, ''));

  return Array.from({ length: count }, (_, i) => {
    const idx = daySeed + i;
    const tenderMedia = TENDER_CYCLE[idx % TENDER_CYCLE.length];
    const hasDiscount = idx % 7 === 0;

    // Invariante "≥5 productos": 5 o 6 según el índice.
    const itemCount = 5 + (idx % 2);
    const picks = Array.from(
      { length: itemCount },
      (_, p) => PRODUCT_CATALOG[(idx + p * CATALOG_STEP) % PRODUCT_CATALOG.length],
    );

    // Invariante "total > $1,000": el multiplicador lleva el subtotal sobre
    // `MIN_SEED_SUBTOTAL` aunque los productos elegidos sean baratos.
    const baseSubtotal = picks.reduce((sum, p) => sum + p.price, 0);
    const qtyMultiplier = Math.max(2, Math.ceil(MIN_SEED_SUBTOTAL / baseSubtotal));

    const items = picks.map((p, p_i) => ({
      id: `I-${p_i + 1}`,
      productName: p.name,
      quantity: qtyMultiplier + (p_i % 2),
      unitPrice: p.price,
    }));

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const discountAmount = hasDiscount ? Math.round(subtotal * 0.1) : 0;

    return {
      id: `V-H${date}-${i}`,
      folio: `F-${date.replace(/-/g, '')}${i}`,
      reference: `${REFERENCE_PREFIX[tenderMedia]}-${date.replace(/-/g, '')}${i}`,
      date,
      time: `${8 + ((idx % 5) * 2)}:${idx % 2 === 0 ? '00' : '30'}`,
      store: STORE_CYCLE[idx % STORE_CYCLE.length],
      subsidiariaId: DEFAULT_SUBSIDIARIA_ID,
      tenderMedia,
      reconciliationStatus: RECONCILIATION_CYCLE[idx % RECONCILIATION_CYCLE.length],
      // Solo V-2001/2/3 de `TODAY_SALES` traen NetSuite.
      netsuite: null,
      reconciliation: null,
      customer: { name: CUSTOMER_POOL[idx % CUSTOMER_POOL.length] },
      items,
      discountAmount,
      discountReason: hasDiscount ? 'Promoción de temporada' : null,
      tipAmount: 0,
      status: 'completada' as const,
    };
  });
}

const RAW_SALES: RawSale[] = [
  ...TODAY_SALES,

  // --- Resto de agosto: volumen para paginación y filtros (sin 16 ni 23) ---
  ...buildDay('2026-08-26', 6),
  ...buildDay('2026-08-25', 5),
  ...buildDay('2026-08-24', 6),
  ...buildDay('2026-08-22', 5),
  ...buildDay('2026-08-21', 4),
  ...buildDay('2026-08-20', 5),
  ...buildDay('2026-08-19', 4),
  ...buildDay('2026-08-18', 5),
  ...buildDay('2026-08-17', 4),
  ...buildDay('2026-08-15', 5),
  ...buildDay('2026-08-14', 4),
];

// Una serie CFDI / prefijo DIAN global para las 4 sucursales; el consecutivo es por venta.
const INVOICE_SERIES: Record<CountryProfile['code'], string> = { MX: 'A', CO: 'SETP' };

// Consecutivo inicial "ya usado"; cada venta suma su índice en `RAW_SALES`.
const INVOICE_NUMBER_SEED = 84210;

// Hex estable por id (FNV-1a + LCG): sin backend que timbre, el folio fiscal no
// cambia entre builds.
function deterministicHex(seed: string, length: number): string {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let hex = '';
  let x = (hash >>> 0) || 1;
  while (hex.length < length) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    hex += x.toString(16).padStart(8, '0');
  }
  return hex.slice(0, length);
}

// Folio fiscal del país: UUID que asigna el SAT al timbrar (MX) / CUFE, un
// SHA-384 hex de 96 caracteres (CO) — mismo largo y forma que el real.
function buildFiscalId(seed: string, country: CountryProfile): string {
  if (country.code === 'CO') {
    return deterministicHex(seed, 96);
  }
  const h = deterministicHex(seed, 32).toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-A${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// RFC (MX) o cédula/NIT (CO) ficticio con formato real, derivado del id.
function buildTaxId(seed: string, personType: SaleCustomer['personType'], country: CountryProfile): string {
  const digits = parseInt(deterministicHex(seed, 12), 16).toString().padStart(12, '0');
  if (country.code === 'CO') {
    return personType === 'juridica' ? `${digits.slice(0, 9)}-${digits[9]}` : digits.slice(0, 10);
  }
  const letters = deterministicHex(`${seed}-rfc`, 8)
    .toUpperCase()
    .replace(/[0-9]/g, (d) => 'ABCDEFGHJK'[Number(d)]);
  const initials = personType === 'juridica' ? letters.slice(0, 3) : letters.slice(0, 4);
  // Fecha de nacimiento / constitución en formato AAMMDD, siempre válida.
  const n = Number(digits.slice(0, 6));
  const date = `${digits.slice(0, 2)}${String((n % 12) + 1).padStart(2, '0')}${String((n % 28) + 1).padStart(2, '0')}`;
  return `${initials}${date}${letters.slice(4, 7)}`;
}

// SAT: 601 moral, 612 física con actividad empresarial, 616 sin obligaciones.
// DIAN: 48 responsable de IVA, 49 no responsable.
function taxRegimeFor(customer: MockCustomer, country: CountryProfile): string | undefined {
  if (!customer.personType || customer.vatResponsible === undefined) return undefined;
  if (country.code === 'CO') {
    return customer.vatResponsible ? '48' : '49';
  }
  if (customer.personType === 'juridica') return '601';
  return customer.vatResponsible ? '612' : '616';
}

// Comprobante y datos fiscales del país activo para toda venta. Sin `personType`
// es receptor genérico (id genérico del país). Ver docs/codigo/ventas.md#mock-de-ventas.
function withFiscalData(
  sale: RawSale,
  seq: number,
  country: CountryProfile = ACTIVE_COUNTRY,
): Omit<Sale, 'payments'> & { payments?: Sale['payments'] } {
  const { vatResponsible, ...customer } = sale.customer;
  const identified = customer.personType !== undefined;
  const offset = `${country.fiscalTimezone.slice(0, 3)}:${country.fiscalTimezone.slice(3)}`;
  const invoice: ElectronicInvoice = {
    series: INVOICE_SERIES[country.code],
    number: String(INVOICE_NUMBER_SEED + seq),
    fiscalId: buildFiscalId(sale.id, country),
    issuedAt: `${sale.date}T${sale.time}:00${offset}`,
  };
  if (country.invoice.hasCfdiFields) {
    // Receptor identificado → "G03 Gastos en general"; público en general →
    // "S01 Sin efectos fiscales". Pago en una sola exhibición (PUE).
    invoice.cfdiUse = identified ? 'G03 · Gastos en general' : 'S01 · Sin efectos fiscales';
    invoice.paymentMethod = 'PUE · Pago en una sola exhibición';
  }

  return {
    ...sale,
    customer: {
      ...customer,
      taxId: identified ? buildTaxId(sale.id, customer.personType, country) : country.taxId.genericId,
      taxRegime: taxRegimeFor({ ...customer, vatResponsible }, country),
    },
    invoice,
  };
}

/**
 * Ventas mock del POS (27 ago a mano + resto de agosto generado), con datos fiscales y pagos completos.
 *
 * @see design-system/conciliation/MASTER.md "Invariantes del mock de ventas (`sales-mock.data.ts`)"
 * @see docs/codigo/ventas.md#mock-de-ventas
 */
export const MOCK_SALES: Sale[] = RAW_SALES.map((sale, index) => withPayment(withFiscalData(sale, index)));

// Respeta `payments` explícito (V-2007); si no, reparte el total 80/20 entre el
// método principal y `SECONDARY_TENDER`.
function withPayment(sale: Omit<Sale, 'payments'> & { payments?: Sale['payments'] }): Sale {
  if (sale.payments) {
    return sale as Sale;
  }

  const total = saleTotal(sale as Sale);
  const secondaryMethod = SECONDARY_TENDER[sale.tenderMedia];
  const secondaryAmount = Math.round(total * 0.2 * 100) / 100;
  const primaryAmount = Math.round((total - secondaryAmount) * 100) / 100;

  return {
    ...sale,
    payments: [
      { id: `PAY-${sale.id}-1`, method: sale.tenderMedia, amount: primaryAmount, reference: sale.reference },
      { id: `PAY-${sale.id}-2`, method: secondaryMethod, amount: secondaryAmount, reference: `${sale.reference}-2` },
    ],
  };
}
