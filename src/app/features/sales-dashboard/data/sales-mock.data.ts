import { Sale } from '../../../shared/models/sale.model';

// Datos de ejemplo — reemplazar por llamadas HTTP reales cuando exista el
// backend de punto de venta. Cubre "hoy" (27 ago, con detalle rico para la
// demo del Drawer) más varios días previos de agosto, para que el resumen
// "Este mes" sume a algo distinto de "Hoy".
export const MOCK_SALES: Sale[] = [
  // --- Hoy: 2026-08-27 ---
  {
    id: 'V-2001',
    folio: 'F-100501',
    date: '2026-08-27',
    time: '08:12',
    tenderMedia: 'efectivo',
    customer: { name: 'Cliente mostrador' },
    items: [
      { id: 'I-1', productName: 'Café americano', quantity: 2, unitPrice: 45 },
      { id: 'I-2', productName: 'Croissant', quantity: 1, unitPrice: 38 },
    ],
    discountAmount: 0,
    discountReason: null,
    status: 'completada',
  },
  {
    id: 'V-2002',
    folio: 'F-100502',
    date: '2026-08-27',
    time: '09:04',
    tenderMedia: 'rappi',
    customer: { name: 'Diego Salinas', phone: '55 1234 8890' },
    items: [
      { id: 'I-1', productName: 'Sándwich club', quantity: 1, unitPrice: 95 },
      { id: 'I-2', productName: 'Refresco 600ml', quantity: 1, unitPrice: 32 },
      { id: 'I-3', productName: 'Papas a la francesa', quantity: 1, unitPrice: 42 },
    ],
    discountAmount: 0,
    discountReason: null,
    status: 'completada',
  },
  {
    id: 'V-2003',
    folio: 'F-100503',
    date: '2026-08-27',
    time: '10:47',
    tenderMedia: 'bbva',
    customer: { name: 'María Fernanda Ruiz', email: 'mf.ruiz@correo.com' },
    items: [
      { id: 'I-1', productName: 'Ensalada césar', quantity: 1, unitPrice: 110 },
      { id: 'I-2', productName: 'Agua embotellada', quantity: 2, unitPrice: 25 },
    ],
    discountAmount: 16,
    discountReason: 'Cliente frecuente (10%)',
    status: 'completada',
  },
  {
    id: 'V-2004',
    folio: 'F-100504',
    date: '2026-08-27',
    time: '11:20',
    tenderMedia: 'didi_food',
    customer: { name: 'Jorge Ibáñez', phone: '55 9902 1147' },
    items: [
      { id: 'I-1', productName: 'Latte', quantity: 1, unitPrice: 52 },
      { id: 'I-2', productName: 'Pay de queso', quantity: 1, unitPrice: 68 },
    ],
    discountAmount: 0,
    discountReason: null,
    status: 'completada',
  },
  {
    id: 'V-2005',
    folio: 'F-100505',
    date: '2026-08-27',
    time: '12:35',
    tenderMedia: 'efectivo',
    customer: { name: 'Cliente mostrador' },
    items: [
      { id: 'I-1', productName: 'Té helado', quantity: 3, unitPrice: 38 },
      { id: 'I-2', productName: 'Sándwich club', quantity: 2, unitPrice: 95 },
    ],
    discountAmount: 0,
    discountReason: null,
    status: 'cancelada',
  },
  {
    id: 'V-2006',
    folio: 'F-100506',
    date: '2026-08-27',
    time: '13:10',
    tenderMedia: 'rappi',
    customer: { name: 'Ana Paola Cortés', phone: '55 4471 0032' },
    items: [
      { id: 'I-1', productName: 'Ensalada césar', quantity: 1, unitPrice: 110 },
      { id: 'I-2', productName: 'Refresco 600ml', quantity: 1, unitPrice: 32 },
      { id: 'I-3', productName: 'Croissant', quantity: 1, unitPrice: 38 },
    ],
    discountAmount: 18,
    discountReason: 'Cupón de bienvenida app',
    status: 'completada',
  },
  {
    id: 'V-2007',
    folio: 'F-100507',
    date: '2026-08-27',
    time: '14:02',
    tenderMedia: 'bbva',
    customer: { name: 'Roberto Nieto', email: 'r.nieto@correo.com' },
    items: [{ id: 'I-1', productName: 'Café americano', quantity: 4, unitPrice: 45 }],
    discountAmount: 0,
    discountReason: null,
    status: 'completada',
  },

  // --- Días previos de agosto (para el acumulado "Este mes") ---
  ...buildDay('2026-08-26', 6100),
  ...buildDay('2026-08-25', 5400),
  ...buildDay('2026-08-24', 7200),
  ...buildDay('2026-08-22', 4800),
  ...buildDay('2026-08-20', 5950),
];

// Genera un puñado de ventas simples para un día previo, ajustando cantidades
// para que la suma del día se acerque al monto objetivo (para el trend del
// sparkline) sin escribir a mano cada renglón de artículos.
function buildDay(date: string, targetTotal: number): Sale[] {
  const perSale = Math.round(targetTotal / 4);
  const tenderCycle: Sale['tenderMedia'][] = ['bbva', 'rappi', 'efectivo', 'didi_food'];

  return Array.from({ length: 4 }, (_, i) => ({
    id: `V-H${date}-${i}`,
    folio: `F-${date.replace(/-/g, '')}${i}`,
    date,
    time: `${9 + i * 2}:00`,
    tenderMedia: tenderCycle[i],
    customer: { name: 'Cliente mostrador' },
    items: [{ id: 'I-1', productName: 'Venta del día', quantity: 1, unitPrice: perSale }],
    discountAmount: 0,
    discountReason: null,
    status: 'completada' as const,
  }));
}
