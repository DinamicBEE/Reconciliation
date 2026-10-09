import { Catalog, CatalogRow } from './catalogs.model';

// Catálogos que dependen del país — Colombia (DIAN). Ver
// `country-catalogs.ts` y `environment.country`.

const DOCUMENT_TYPES: CatalogRow[] = [
  { code: '11', name: 'Registro civil' },
  { code: '12', name: 'Tarjeta de identidad' },
  { code: '13', name: 'Cédula de ciudadanía' },
  { code: '21', name: 'Tarjeta de extranjería' },
  { code: '22', name: 'Cédula de extranjería' },
  { code: '31', name: 'NIT' },
  { code: '41', name: 'Pasaporte' },
  { code: '42', name: 'Documento de identificación extranjero' },
  { code: '47', name: 'PEP (Permiso Especial de Permanencia)' },
  { code: '48', name: 'PPT (Permiso por Protección Temporal)' },
  { code: '50', name: 'NIT de otro país' },
  { code: '91', name: 'NUIP' },
];

const TAX_REGIMES: CatalogRow[] = [
  { code: '48', name: 'Responsable del impuesto sobre las ventas (IVA)', group: 'Régimen' },
  { code: '49', name: 'No responsable de IVA', group: 'Régimen' },
  { code: 'O-13', name: 'Gran contribuyente', group: 'Responsabilidad fiscal' },
  { code: 'O-15', name: 'Autorretenedor', group: 'Responsabilidad fiscal' },
  { code: 'O-23', name: 'Agente de retención IVA', group: 'Responsabilidad fiscal' },
  { code: 'O-47', name: 'Régimen simple de tributación', group: 'Responsabilidad fiscal' },
  { code: 'R-99-PN', name: 'No aplica – Otros', group: 'Responsabilidad fiscal' },
];

const TAXES: CatalogRow[] = [
  { code: '01', name: 'IVA', description: 'Impuesto sobre la ventas' },
  { code: '02', name: 'IC', description: 'Impuesto al consumo departamental' },
  { code: '03', name: 'ICA', description: 'Impuesto de industria, comercio y aviso' },
  { code: '04', name: 'INC', description: 'Impuesto nacional al consumo' },
  { code: '05', name: 'ReteIVA', description: 'Retención sobre el IVA' },
  { code: '06', name: 'ReteRenta', description: 'Retención sobre renta' },
  { code: '07', name: 'ReteICA', description: 'Retención sobre el ICA' },
  { code: '22', name: 'INC Bolsas', description: 'Impuesto nacional al consumo de bolsa plástica' },
  { code: 'ZZ', name: 'No aplica', description: 'No causa tributo' },
];

const PAYMENT_MEANS: CatalogRow[] = [
  { code: '1', name: 'Instrumento no definido' },
  { code: '10', name: 'Efectivo' },
  { code: '20', name: 'Cheque' },
  { code: '42', name: 'Consignación bancaria' },
  { code: '47', name: 'Transferencia débito bancaria' },
  { code: '48', name: 'Tarjeta crédito' },
  { code: '49', name: 'Tarjeta débito' },
  { code: '71', name: 'Bonos' },
  { code: '72', name: 'Vales' },
  { code: 'ZZZ', name: 'Acuerdo mutuo' },
];

const DEPARTMENTS: CatalogRow[] = [
  ['05', 'Antioquia'],
  ['08', 'Atlántico'],
  ['11', 'Bogotá, D.C.'],
  ['13', 'Bolívar'],
  ['15', 'Boyacá'],
  ['17', 'Caldas'],
  ['18', 'Caquetá'],
  ['19', 'Cauca'],
  ['20', 'Cesar'],
  ['23', 'Córdoba'],
  ['25', 'Cundinamarca'],
  ['27', 'Chocó'],
  ['41', 'Huila'],
  ['44', 'La Guajira'],
  ['47', 'Magdalena'],
  ['50', 'Meta'],
  ['52', 'Nariño'],
  ['54', 'Norte de Santander'],
  ['63', 'Quindío'],
  ['66', 'Risaralda'],
  ['68', 'Santander'],
  ['70', 'Sucre'],
  ['73', 'Tolima'],
  ['76', 'Valle del Cauca'],
  ['81', 'Arauca'],
  ['85', 'Casanare'],
  ['86', 'Putumayo'],
  ['88', 'Archipiélago de San Andrés, Providencia y Santa Catalina'],
  ['91', 'Amazonas'],
  ['94', 'Guainía'],
  ['95', 'Guaviare'],
  ['97', 'Vaupés'],
  ['99', 'Vichada'],
].map(([code, name]) => ({ code, name }));

const CURRENCIES: CatalogRow[] = [
  { code: 'COP', name: 'Peso colombiano' },
  { code: 'USD', name: 'Dólar estadounidense' },
  { code: 'EUR', name: 'Euro' },
];

const TAX_MAP: CatalogRow[] = [
  { tax: '01 IVA', rate: '0 %', code: 'IVA_0' },
  { tax: '01 IVA', rate: '5 %', code: 'IVA_5' },
  { tax: '01 IVA', rate: '19 %', code: 'IVA_19' },
  { tax: '04 INC', rate: '8 %', code: 'INC_8' },
  { tax: '22 INC Bolsas', rate: '$22 por unidad', code: 'INC_BOLSAS' },
];

const NS_TAX_CODES: CatalogRow[] = [
  { code: 'IVA_0', name: 'IVA exento 0 %', rate: '0 %', account: '240805 IVA por pagar' },
  { code: 'IVA_5', name: 'IVA 5 %', rate: '5 %', account: '240805 IVA por pagar' },
  { code: 'IVA_19', name: 'IVA 19 %', rate: '19 %', account: '240805 IVA por pagar' },
  { code: 'INC_8', name: 'Impuesto al consumo 8 %', rate: '8 %', account: '246405 INC por pagar' },
  { code: 'INC_BOLSAS', name: 'INC bolsas plásticas', rate: '$22 por unidad', account: '246405 INC por pagar' },
];

export const CO_FISCAL_CATALOGS: Catalog[] = [
  {
    id: 'dian-document-types',
    name: 'Tipos de documento de identificación',
    description: 'Documento con el que se identifica al cliente en la factura electrónica.',
    kind: 'fiscal',
    source: 'Normativa DIAN · plantilla de carga inicial',
    updatedAt: '2026-09-15T10:00:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
    ],
    rows: DOCUMENT_TYPES,
  },
  {
    id: 'dian-tax-regimes',
    name: 'Regímenes y responsabilidades fiscales',
    description: 'Régimen de IVA y responsabilidades tributarias del adquiriente.',
    kind: 'fiscal',
    source: 'Normativa DIAN · plantilla de carga inicial',
    updatedAt: '2026-09-15T10:00:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'group', label: 'Tipo' },
    ],
    rows: TAX_REGIMES,
  },
  {
    id: 'dian-taxes',
    name: 'Tributos',
    description: 'Tributos DIAN que pueden llegar en las líneas o en la cabecera del documento.',
    kind: 'fiscal',
    source: 'Normativa DIAN · plantilla de carga inicial',
    updatedAt: '2026-09-15T10:00:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'description', label: 'Descripción' },
    ],
    rows: TAXES,
  },
  {
    id: 'dian-payment-means',
    name: 'Medios de pago',
    description: 'Medios de pago del estándar de facturación electrónica.',
    kind: 'fiscal',
    source: 'Normativa DIAN · plantilla de carga inicial',
    updatedAt: '2026-09-15T10:00:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
    ],
    rows: PAYMENT_MEANS,
  },
  {
    id: 'dian-departments',
    name: 'Departamentos',
    description: 'División político-administrativa de Colombia (codificación DANE).',
    kind: 'fiscal',
    source: 'Normativa DIAN · plantilla de carga inicial',
    updatedAt: '2026-09-15T10:00:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
    ],
    rows: DEPARTMENTS,
  },
  {
    id: 'dian-currencies',
    name: 'Monedas',
    description: 'Monedas admitidas en los documentos electrónicos.',
    kind: 'fiscal',
    source: 'Normativa DIAN · plantilla de carga inicial',
    updatedAt: '2026-09-15T10:00:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
    ],
    rows: CURRENCIES,
  },
];

export const CO_TAX_MAP_CATALOG: Catalog = {
  id: 'map-tax',
  name: 'Tributo → código de impuesto',
  description: 'Tributo DIAN y tasa al código de impuesto configurado en NetSuite.',
  kind: 'homologation',
  source: 'Parametrización de la solución',
  updatedAt: '2026-09-22T17:30:00',
  columns: [
    { key: 'tax', label: 'Tributo' },
    { key: 'rate', label: 'Tasa' },
    { key: 'code', label: 'Código NetSuite', mono: true },
  ],
  rows: TAX_MAP,
};

export const CO_NS_TAX_CODES_CATALOG: Catalog = {
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
