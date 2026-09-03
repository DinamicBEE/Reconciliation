import { Sale } from '../../../shared/models/sale.model';
import { saleTotal } from './sale.util';

// Ventas "en bruto" — `payments` es opcional aquí: si no se especifica,
// `withPayment()` deriva un único pago a partir del total ya calculado
// (subtotal - descuento + impuestos + propina), para que el pago registrado
// siempre cuadre con el total real en vez de mantener dos números a mano por
// separado. Una venta con pago MIXTO (más de un método) sí declara
// `payments` explícito — ver V-2007 — porque ahí no hay un único monto que
// derivar automáticamente, el reparto entre métodos es una decisión propia
// de esa venta.
type RawSale = Omit<Sale, 'payments'> & { payments?: Sale['payments'] };

// Datos de ejemplo — reemplazar por llamadas HTTP reales cuando exista el
// backend de punto de venta. Cubre "hoy" (27 ago, con detalle rico para la
// demo del Drawer) más varios días previos de agosto, para que el resumen
// "Este mes" sume a algo distinto de "Hoy".
const RAW_SALES: RawSale[] = [
  // --- Hoy: 2026-08-27 ---
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
      { id: 'I-1', productName: 'Café americano', quantity: 2, unitPrice: 45 },
      { id: 'I-2', productName: 'Croissant', quantity: 1, unitPrice: 38 },
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
    customer: { name: 'Diego Salinas', phone: '55 1234 8890' },
    items: [
      { id: 'I-1', productName: 'Sándwich club', quantity: 1, unitPrice: 95 },
      { id: 'I-2', productName: 'Refresco 600ml', quantity: 1, unitPrice: 32 },
      { id: 'I-3', productName: 'Papas a la francesa', quantity: 1, unitPrice: 42 },
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
    customer: { name: 'María Fernanda Ruiz', email: 'mf.ruiz@correo.com' },
    items: [
      { id: 'I-1', productName: 'Ensalada césar', quantity: 1, unitPrice: 110 },
      { id: 'I-2', productName: 'Agua embotellada', quantity: 2, unitPrice: 25 },
    ],
    discountAmount: 16,
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
    customer: { name: 'Jorge Ibáñez', phone: '55 9902 1147' },
    items: [
      { id: 'I-1', productName: 'Latte', quantity: 1, unitPrice: 52 },
      { id: 'I-2', productName: 'Pay de queso', quantity: 1, unitPrice: 68 },
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
      { id: 'I-1', productName: 'Té helado', quantity: 3, unitPrice: 38 },
      { id: 'I-2', productName: 'Sándwich club', quantity: 2, unitPrice: 95 },
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
    customer: { name: 'Ana Paola Cortés', phone: '55 4471 0032' },
    items: [
      { id: 'I-1', productName: 'Ensalada césar', quantity: 1, unitPrice: 110 },
      { id: 'I-2', productName: 'Refresco 600ml', quantity: 1, unitPrice: 32 },
      { id: 'I-3', productName: 'Croissant', quantity: 1, unitPrice: 38 },
    ],
    discountAmount: 18,
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
    customer: { name: 'Roberto Nieto', email: 'r.nieto@correo.com' },
    items: [{ id: 'I-1', productName: 'Café americano', quantity: 4, unitPrice: 45 }],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 20,
    status: 'completada',
    // Pago mixto: cuenta + IVA con tarjeta, propina en efectivo — los dos
    // montos deben sumar exactamente el total (180 + 28.80 + 20 = 228.80).
    payments: [
      { id: 'PAY-V-2007-1', method: 'bbva', amount: 208.8, reference: 'SPEI0000129990' },
      { id: 'PAY-V-2007-2', method: 'efectivo', amount: 20, reference: 'EFE-PROPINA-0827' },
    ],
  },

  // --- Días previos de agosto (para el acumulado "Este mes") ---
  ...buildDay('2026-08-26', 6100),
  ...buildDay('2026-08-25', 5400),
  ...buildDay('2026-08-24', 7200),
  ...buildDay('2026-08-22', 4800),
  ...buildDay('2026-08-20', 5950),
];

export const MOCK_SALES: Sale[] = RAW_SALES.map(withPayment);

// Si la venta ya trae `payments` explícito (pago mixto, ver V-2007), se
// respeta tal cual. Si no, se deriva un único pago a partir del total ya
// calculado (no se mantiene un número aparte a mano).
function withPayment(sale: RawSale): Sale {
  if (sale.payments) {
    return sale as Sale;
  }

  return {
    ...sale,
    payments: [
      {
        id: `PAY-${sale.id}`,
        method: sale.tenderMedia,
        amount: saleTotal(sale as Sale),
        reference: sale.reference,
      },
    ],
  };
}

// Genera un puñado de ventas simples para un día previo, ajustando cantidades
// para que la suma del día se acerque al monto objetivo (para el trend del
// sparkline) sin escribir a mano cada renglón de artículos. Ya reconciliadas
// (son de días anteriores) y sin propina, para no complicar el mock.
function buildDay(date: string, targetTotal: number): RawSale[] {
  const perSale = Math.round(targetTotal / 4 / 1.16); // objetivo es el total con IVA incluido
  const tenderCycle: Sale['tenderMedia'][] = ['bbva', 'rappi', 'efectivo', 'didi_food'];

  return Array.from({ length: 4 }, (_, i) => ({
    id: `V-H${date}-${i}`,
    folio: `F-${date.replace(/-/g, '')}${i}`,
    reference: `REF-${date.replace(/-/g, '')}${i}`,
    date,
    time: `${9 + i * 2}:00`,
    tenderMedia: tenderCycle[i],
    reconciliationStatus: 'matched' as const,
    customer: { name: 'Cliente mostrador' },
    items: [{ id: 'I-1', productName: 'Venta del día', quantity: 1, unitPrice: perSale }],
    discountAmount: 0,
    discountReason: null,
    tipAmount: 0,
    status: 'completada' as const,
  }));
}
