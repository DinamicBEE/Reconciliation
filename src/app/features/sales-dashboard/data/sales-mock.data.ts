import { MatchStatus, TenderMedia } from '../../../shared/models/reconciliation-item.model';
import { Sale } from '../../../shared/models/sale.model';
import { saleTotal } from './sale.util';

// Ventas "en bruto" — `payments` es opcional aquí: si no se especifica,
// `withPayment()` deriva DOS pagos (método principal + secundario) a partir
// del total ya calculado (subtotal - descuento + impuestos + propina), para
// que el pago registrado siempre cuadre con el total real en vez de
// mantener números a mano por separado. Una venta puede declarar `payments`
// explícito cuando el reparto entre métodos es una decisión propia de esa
// venta y no un simple split derivado — ver V-2007 (tarjeta cubre cuenta+IVA,
// efectivo cubre la propina).
type RawSale = Omit<Sale, 'payments'> & { payments?: Sale['payments'] };

// Invariantes de negocio de TODA venta del mock (a mano o generada, ver
// `buildDay` abajo) — pedidas explícitamente para la demo del Drawer de
// detalle: total > $1,000 MXN, al menos 2 métodos de pago y al menos 5
// productos. Antes de esta iteración solo V-2007 tenía pago mixto y el resto
// de las ventas de "hoy" (`TODAY_SALES`) eran tickets chicos de 1-3
// productos con un solo método — ya no: `withPayment()` (abajo) ahora
// separa el total en 2 métodos para CUALQUIER venta sin `payments` explícito,
// y tanto `TODAY_SALES` como `buildDay()` arman siempre 5-6 líneas de
// producto con un subtotal que deja el total muy por encima de $1,000 tras
// el 16% de IVA.
//
// 7 ventas de "hoy" (27 ago) con detalle a mano — ricas a propósito, para la
// demo del Drawer (cliente con contacto + datos fiscales, descuento, pago
// mixto en V-2007). El resto del mes (`buildDay`, abajo) es generado: existe
// para tener volumen real con el que probar paginación y los filtros de
// fecha/cliente/medio de pago, no para ver el detalle de cada una en el
// Drawer.
const TODAY_SALES: RawSale[] = [
  {
    id: 'V-2001',
    folio: 'F-100501',
    reference: 'CORTE-0827-01',
    date: '2026-08-27',
    time: '08:12',
    tenderMedia: 'efectivo',
    reconciliationStatus: 'matched',
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
    tenderMedia: 'rappi',
    reconciliationStatus: 'sale_only',
    customer: {
      name: 'Diego Salinas',
      phone: '55 1234 8890',
      rfc: 'SAGD850312AB1',
      businessName: 'Diego Salinas Gómez',
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
    tenderMedia: 'bbva',
    reconciliationStatus: 'matched',
    customer: {
      name: 'María Fernanda Ruiz',
      email: 'mf.ruiz@correo.com',
      rfc: 'RUFM900125CD2',
      businessName: 'María Fernanda Ruiz Ortega',
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
    tenderMedia: 'didi_food',
    reconciliationStatus: 'sale_only',
    customer: {
      name: 'Jorge Ibáñez',
      phone: '55 9902 1147',
      rfc: 'IBJO880714EF3',
      businessName: 'Jorge Ibáñez Contreras',
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
    tenderMedia: 'efectivo',
    reconciliationStatus: 'amount_mismatch',
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
    tenderMedia: 'rappi',
    reconciliationStatus: 'sale_only',
    customer: {
      name: 'Ana Paola Cortés',
      phone: '55 4471 0032',
      rfc: 'COAP930528GH4',
      businessName: 'Comercializadora Cortés SA de CV',
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
    tenderMedia: 'bbva', // método "principal" para la tabla/filtros — la cuenta se pagó mixto
    reconciliationStatus: 'matched',
    customer: {
      name: 'Roberto Nieto',
      email: 'r.nieto@correo.com',
      rfc: 'NIRO870903IJ5',
      businessName: 'Roberto Nieto Delgado',
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

// --- Generador de días previos --------------------------------------------
// Catálogo/pool chicos, cicla por índice (no Math.random()) para que la
// data sea determinística entre builds — no importa reproducir un total
// exacto por día (a diferencia de la versión anterior de este generador),
// lo que importa ahora es variedad real de cliente/producto/medio de pago
// para poder probar los 3 filtros nuevos con resultados distintos, MÁS las
// 3 invariantes de arriba (total > $1,000, ≥2 métodos, ≥5 productos).
//
// Este bloque (pools + `buildDay`) va ANTES de `RAW_SALES`: `RAW_SALES` llama
// a `buildDay(...)` en su propio inicializador, que se ejecuta de inmediato
// al evaluar el módulo — si los pools de abajo estuvieran declarados después
// (como estaban antes), `buildDay` los leería antes de que existieran
// (`const` no se hoistea con su valor) y `TENDER_CYCLE`/etc. llegarían como
// `undefined`, exactamente el bug que causaba
// "Cannot read properties of undefined (reading 'length')" al cargar la app.
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
  // 3 productos de ticket más alto — sin ellos, alcanzar >$1,000 con solo
  // 5-6 líneas de producto habría necesitado cantidades poco realistas de
  // los productos de cafetería de arriba.
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

// Método de pago SECUNDARIO por cada método principal — usado por
// `withPayment()` para separar el total en 2 métodos cuando la venta no trae
// `payments` explícito (ver invariante "≥2 métodos de pago" arriba). Efectivo
// es el secundario natural para los 3 medios electrónicos (representa la
// propina cobrada aparte, en mano); para una venta ya cobrada en efectivo, el
// secundario es BBVA (representa la parte de la cuenta cobrada con tarjeta).
const SECONDARY_TENDER: Record<TenderMedia, TenderMedia> = {
  bbva: 'efectivo',
  rappi: 'efectivo',
  didi_food: 'efectivo',
  efectivo: 'bbva',
};

// Días previos ya reconciliados en su mayoría (son historia, no "hoy") —
// solo 1 de cada 6 queda `sale_only`, como recordatorio de que el cruce
// tarda 1-2 días incluso para movimientos viejos que aún no cerraron.
const RECONCILIATION_CYCLE: MatchStatus[] = ['matched', 'matched', 'matched', 'matched', 'matched', 'sale_only'];

const REFERENCE_PREFIX: Record<TenderMedia, string> = {
  bbva: 'SPEI',
  rappi: 'RAPPI-LIQ',
  efectivo: 'CORTE',
  didi_food: 'DIDI',
};

// Piso de subtotal (antes de descuento/IVA) que garantiza, incluso con el
// máximo descuento posible del generador (10%), un total tras el 16% de IVA
// por arriba de $1,000 con margen de sobra: (1150 * 0.9) * 1.16 ≈ $1,200.6.
const MIN_SEED_SUBTOTAL = 1150;

// El paso 7 es coprimo con el tamaño del catálogo (15) — para hasta 6
// productos por venta (`itemCount`), los índices `(idx + p*7) % 15` no se
// repiten dentro de la misma venta, a diferencia de un paso como 3 o 15 que
// sí colisionaría.
const CATALOG_STEP = 7;

function buildDay(date: string, count: number): RawSale[] {
  const daySeed = Number(date.replace(/-/g, ''));

  return Array.from({ length: count }, (_, i) => {
    const idx = daySeed + i;
    const tenderMedia = TENDER_CYCLE[idx % TENDER_CYCLE.length];
    const hasDiscount = idx % 7 === 0;

    // Al menos 5 productos por venta (5 o 6, alternando por índice) — ver
    // invariante "≥5 productos" arriba.
    const itemCount = 5 + (idx % 2);
    const picks = Array.from(
      { length: itemCount },
      (_, p) => PRODUCT_CATALOG[(idx + p * CATALOG_STEP) % PRODUCT_CATALOG.length],
    );

    // Cantidad por línea: se calcula un multiplicador a partir de la suma a
    // cantidad 1 de los productos elegidos, para que el subtotal quede
    // SIEMPRE por arriba de `MIN_SEED_SUBTOTAL`, sin importar qué tan
    // baratos hayan tocado esos productos en este índice — ver invariante
    // "total > $1,000" arriba.
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
      tenderMedia,
      reconciliationStatus: RECONCILIATION_CYCLE[idx % RECONCILIATION_CYCLE.length],
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

  // --- Resto de agosto — generadas, para tener volumen real de cara a
  // paginación y a los filtros de fecha/cliente/medio de pago. ---
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

export const MOCK_SALES: Sale[] = RAW_SALES.map(withPayment);

// Si la venta ya trae `payments` explícito (pago mixto con reparto propio,
// ver V-2007), se respeta tal cual. Si no, se deriva un pago PRINCIPAL +
// uno SECUNDARIO (`SECONDARY_TENDER`) a partir del total ya calculado — 20%
// del total va al método secundario y el resto al principal, sin mantener
// dos números a mano por separado. Garantiza la invariante "≥2 métodos de
// pago" para cualquier venta del mock, generada o a mano.
function withPayment(sale: RawSale): Sale {
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
