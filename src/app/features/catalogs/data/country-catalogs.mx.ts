import { Catalog, CatalogRow } from './catalogs.model';

// Catálogos que dependen del país — México (SAT, CFDI 4.0). Ver
// `catalogs-mock.data.ts` y `environment.country`. Los códigos son los de
// los catálogos oficiales del Anexo 20; solo se incluyen los que usa la
// operación de venta al público.

const REGIMES: CatalogRow[] = [
  ['601', 'General de Ley Personas Morales', 'Moral'],
  ['603', 'Personas Morales con Fines no Lucrativos', 'Moral'],
  ['605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios', 'Física'],
  ['606', 'Arrendamiento', 'Física'],
  ['608', 'Demás ingresos', 'Física'],
  ['612', 'Personas Físicas con Actividades Empresariales y Profesionales', 'Física'],
  ['616', 'Sin obligaciones fiscales', 'Física'],
  ['621', 'Incorporación Fiscal', 'Física'],
  ['625', 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', 'Física'],
  ['626', 'Régimen Simplificado de Confianza', 'Física y moral'],
].map(([code, name, applies]) => ({ code, name, applies }));

const CFDI_USES: CatalogRow[] = [
  ['G01', 'Adquisición de mercancías'],
  ['G02', 'Devoluciones, descuentos o bonificaciones'],
  ['G03', 'Gastos en general'],
  ['I01', 'Construcciones'],
  ['I02', 'Mobiliario y equipo de oficina por inversiones'],
  ['D01', 'Honorarios médicos, dentales y gastos hospitalarios'],
  ['S01', 'Sin efectos fiscales'],
  ['CP01', 'Pagos'],
].map(([code, name]) => ({ code, name }));

const TAXES: CatalogRow[] = [
  { code: '001', name: 'ISR', description: 'Impuesto sobre la renta (retención)' },
  { code: '002', name: 'IVA', description: 'Impuesto al valor agregado' },
  { code: '003', name: 'IEPS', description: 'Impuesto especial sobre producción y servicios' },
];

const PAYMENT_FORMS: CatalogRow[] = [
  ['01', 'Efectivo'],
  ['02', 'Cheque nominativo'],
  ['03', 'Transferencia electrónica de fondos'],
  ['04', 'Tarjeta de crédito'],
  ['05', 'Monedero electrónico'],
  ['06', 'Dinero electrónico'],
  ['08', 'Vales de despensa'],
  ['28', 'Tarjeta de débito'],
  ['29', 'Tarjeta de servicios'],
  ['30', 'Aplicación de anticipos'],
  ['31', 'Intermediario pagos'],
  ['99', 'Por definir'],
].map(([code, name]) => ({ code, name }));

const PAYMENT_METHODS: CatalogRow[] = [
  { code: 'PUE', name: 'Pago en una sola exhibición' },
  { code: 'PPD', name: 'Pago en parcialidades o diferido' },
];

const STATES: CatalogRow[] = [
  ['AGU', 'Aguascalientes'],
  ['BCN', 'Baja California'],
  ['BCS', 'Baja California Sur'],
  ['CAM', 'Campeche'],
  ['CHP', 'Chiapas'],
  ['CHH', 'Chihuahua'],
  ['CMX', 'Ciudad de México'],
  ['COA', 'Coahuila'],
  ['COL', 'Colima'],
  ['DUR', 'Durango'],
  ['GUA', 'Guanajuato'],
  ['GRO', 'Guerrero'],
  ['HID', 'Hidalgo'],
  ['JAL', 'Jalisco'],
  ['MEX', 'Estado de México'],
  ['MIC', 'Michoacán'],
  ['MOR', 'Morelos'],
  ['NAY', 'Nayarit'],
  ['NLE', 'Nuevo León'],
  ['OAX', 'Oaxaca'],
  ['PUE', 'Puebla'],
  ['QUE', 'Querétaro'],
  ['ROO', 'Quintana Roo'],
  ['SLP', 'San Luis Potosí'],
  ['SIN', 'Sinaloa'],
  ['SON', 'Sonora'],
  ['TAB', 'Tabasco'],
  ['TAM', 'Tamaulipas'],
  ['TLA', 'Tlaxcala'],
  ['VER', 'Veracruz'],
  ['YUC', 'Yucatán'],
  ['ZAC', 'Zacatecas'],
].map(([code, name]) => ({ code, name }));

const CURRENCIES: CatalogRow[] = [
  { code: 'MXN', name: 'Peso mexicano' },
  { code: 'USD', name: 'Dólar estadounidense' },
  { code: 'EUR', name: 'Euro' },
];

const TAX_MAP: CatalogRow[] = [
  { tax: '002 IVA', rate: '16 %', code: 'IVA_16' },
  { tax: '002 IVA', rate: '8 % (región fronteriza)', code: 'IVA_8_FRONTERA' },
  { tax: '002 IVA', rate: '0 %', code: 'IVA_0' },
  { tax: '002 IVA', rate: 'Exento', code: 'IVA_EXENTO' },
  { tax: '003 IEPS', rate: '8 %', code: 'IEPS_8' },
];

const NS_TAX_CODES: CatalogRow[] = [
  { code: 'IVA_16', name: 'IVA trasladado 16 %', rate: '16 %', account: '208.01 IVA trasladado cobrado' },
  { code: 'IVA_8_FRONTERA', name: 'IVA trasladado 8 % frontera', rate: '8 %', account: '208.01 IVA trasladado cobrado' },
  { code: 'IVA_0', name: 'IVA tasa 0 %', rate: '0 %', account: '208.01 IVA trasladado cobrado' },
  { code: 'IVA_EXENTO', name: 'IVA exento', rate: '—', account: '—' },
  { code: 'IEPS_8', name: 'IEPS trasladado 8 %', rate: '8 %', account: '208.03 IEPS trasladado cobrado' },
];

const SAT_SOURCE = 'Anexo 20 SAT · plantilla de carga inicial';
const SAT_UPDATED_AT = '2026-09-15T10:00:00';

export const MX_FISCAL_CATALOGS: Catalog[] = [
  {
    id: 'sat-regimes',
    name: 'Régimen fiscal',
    description: 'Régimen fiscal del emisor y del receptor del CFDI (c_RegimenFiscal).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Descripción' },
      { key: 'applies', label: 'Aplica a persona' },
    ],
    rows: REGIMES,
  },
  {
    id: 'sat-cfdi-uses',
    name: 'Uso del CFDI',
    description: 'Uso que el receptor dará al comprobante (c_UsoCFDI).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Descripción' },
    ],
    rows: CFDI_USES,
  },
  {
    id: 'sat-taxes',
    name: 'Impuestos',
    description: 'Impuestos trasladados o retenidos en el CFDI (c_Impuesto).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'description', label: 'Descripción' },
    ],
    rows: TAXES,
  },
  {
    id: 'sat-payment-forms',
    name: 'Forma de pago',
    description: 'Forma en que se liquida el comprobante (c_FormaPago).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Descripción' },
    ],
    rows: PAYMENT_FORMS,
  },
  {
    id: 'sat-payment-methods',
    name: 'Método de pago',
    description: 'Pago en una sola exhibición o en parcialidades (c_MetodoPago).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Descripción' },
    ],
    rows: PAYMENT_METHODS,
  },
  {
    id: 'sat-states',
    name: 'Estados',
    description: 'Entidades federativas de México (c_Estado).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Nombre' },
    ],
    rows: STATES,
  },
  {
    id: 'sat-currencies',
    name: 'Monedas',
    description: 'Monedas admitidas en el CFDI (c_Moneda).',
    kind: 'fiscal',
    source: SAT_SOURCE,
    updatedAt: SAT_UPDATED_AT,
    columns: [
      { key: 'code', label: 'Clave', mono: true },
      { key: 'name', label: 'Nombre' },
    ],
    rows: CURRENCIES,
  },
];

export const MX_TAX_MAP_CATALOG: Catalog = {
  id: 'map-tax',
  name: 'Impuesto → código de impuesto',
  description: 'Impuesto del SAT y tasa al código de impuesto configurado en NetSuite.',
  kind: 'homologation',
  source: 'Parametrización de la solución',
  updatedAt: '2026-09-22T17:30:00',
  columns: [
    { key: 'tax', label: 'Impuesto' },
    { key: 'rate', label: 'Tasa' },
    { key: 'code', label: 'Código NetSuite', mono: true },
  ],
  rows: TAX_MAP,
};

export const MX_NS_TAX_CODES_CATALOG: Catalog = {
  id: 'ns-tax-codes',
  name: 'Códigos de impuesto',
  description: 'Códigos de impuesto configurados en NetSuite.',
  kind: 'netsuite',
  source: 'Sincronización con NetSuite',
  updatedAt: '2026-09-28T06:00:00',
  columns: [
    { key: 'code', label: 'Código', mono: true },
    { key: 'name', label: 'Nombre' },
    { key: 'rate', label: 'Tasa' },
    { key: 'account', label: 'Cuenta' },
  ],
  rows: NS_TAX_CODES,
};
