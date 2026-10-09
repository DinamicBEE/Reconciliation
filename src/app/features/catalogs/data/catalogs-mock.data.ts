import { ACTIVE_COUNTRY } from '../../../core/country/active-country';
import { CountryCode } from '../../../core/country/country.model';
import { Catalog, CatalogRow } from './catalogs.model';
import { CO_FISCAL_CATALOGS, CO_NS_TAX_CODES_CATALOG, CO_TAX_MAP_CATALOG } from './country-catalogs.co';
import { MX_FISCAL_CATALOGS, MX_NS_TAX_CODES_CATALOG, MX_TAX_MAP_CATALOG } from './country-catalogs.mx';

// Mock de los catálogos cargados — no hay backend todavía (el DED los sirve
// desde el Core / Ventas Service). Los valores salen del propio DED:
// tender media, Major/Family Group, prefijos de ubicación y cuentas
// homologadas (7.21 y 7.23). Los números de cuenta contable, los códigos de
// establecimiento y los ids de tienda Rappi son ILUSTRATIVOS (el cliente
// todavía no entrega su plan de cuentas ni sus homologaciones, ver supuestos
// del DED en la sección 3.1).
//
// Lo que depende del país (`environment.country`) vive aparte: los
// catálogos fiscales de la autoridad (SAT / DIAN), la homologación de
// impuestos y los códigos de impuesto de NetSuite — ver
// `country-catalogs.mx.ts` y `country-catalogs.co.ts`. El resto
// (homologaciones de tender, grupos, ubicaciones, adquirencia, Rappi y los
// maestros) es el mismo en ambos países.

// Las 8 ubicaciones que expone hoy el API del facturador (DED 7.23), cada
// una con su prefijo fiscal. Reutilizadas por varias homologaciones.
const HIPERMAR_PREFIXES = ['HCJE', 'H84E', 'H23E', 'HSBE', 'H69E', 'H26E', 'HPVE', 'HUSE'];

const hipermarName = (prefix: string): string => `Hipermar Fish ${prefix}`;

// --- Homologaciones (parametrización de la solución, DED 7.14 paso 5) --------

const TENDER_MAP: CatalogRow[] = [
  { tender: '100', name: 'Efectivo', account: '110510 Puente efectivo' },
  { tender: '102', name: 'Rappi', account: '138095 Puente Rappi' },
  { tender: '108', name: 'Transferencia', account: '138096 Puente transferencias' },
  { tender: '201', name: 'Tarjeta Crédito', account: '138097 Puente tarjeta crédito' },
  { tender: '205', name: 'Tarjeta Débito', account: '138098 Puente tarjeta débito' },
];

// 27 Family Group con mapeo uno a uno (DED 7.23): 1–20 retail, 501–506
// restaurante y 700 ingresos diferidos, más la cuenta por defecto para
// grupos no homologados.
const RETAIL_FAMILIES = [
  'Pescados',
  'Mariscos',
  'Salmón',
  'Atún',
  'Camarón',
  'Pulpo',
  'Calamar',
  'Langostinos',
  'Enlatados',
  'Congelados',
  'Salsas y aderezos',
  'Especias',
  'Bebidas',
  'Vinos',
  'Cervezas',
  'Abarrotes',
  'Lácteos',
  'Frutas y verduras',
  'Panadería',
  'Desechables',
];
const RESTAURANT_FAMILIES = ['Entradas', 'Cócteles', 'Ceviches', 'Platos fuertes', 'Bebidas restaurante', 'Postres'];

const GROUP_MAP: CatalogRow[] = [
  ...RETAIL_FAMILIES.map((name, i) => ({
    major: '1 Retail',
    family: String(i + 1),
    name,
    account: '413505 Ventas retail',
    isDefault: 'No',
  })),
  ...RESTAURANT_FAMILIES.map((name, i) => ({
    major: '2 Restaurante',
    family: String(501 + i),
    name,
    account: '413005 Ventas restaurante',
    isDefault: 'No',
  })),
  { major: '3 Bono de regalo', family: '700', name: 'Ingresos diferidos', account: '280505 Ingresos diferidos bonos', isDefault: 'No' },
  { major: '—', family: '—', name: 'Grupo sin homologar', account: '413595 Otras ventas', isDefault: 'Sí' },
];

const STORE_MAP: CatalogRow[] = HIPERMAR_PREFIXES.map((prefix, i) => ({
  storeId: String(i + 1),
  prefix,
  location: hipermarName(prefix),
  subsidiary: 'Hipermar Fish',
}));

const ACQUIRER_MAP: CatalogRow[] = HIPERMAR_PREFIXES.map((prefix, i) => {
  const bancolombia = i % 3 !== 2;
  return {
    establishment: bancolombia ? `0010${4521 + i * 7}` : `DV-${8800 + i}`,
    bank: bancolombia ? 'Bancolombia' : 'Davivienda',
    location: hipermarName(prefix),
    account: bancolombia ? 'Bancolombia ahorros ****4521' : 'Davivienda corriente ****7730',
    parser: bancolombia ? 'Bancolombia Reporte Conciliar' : 'Davivienda datáfono',
  };
});

const RAPPI_STORE_MAP: CatalogRow[] = [
  { rappiId: '900114', fileName: 'HIPERMAR FISH CJ', profile: 'Hipermercado', location: hipermarName('HCJE') },
  { rappiId: '900127', fileName: 'HIPERMAR 84', profile: 'Hipermercado', location: hipermarName('H84E') },
  { rappiId: '900133', fileName: 'Hipermar Fish - 23', profile: 'Hipermercado', location: hipermarName('H23E') },
  { rappiId: '712045', fileName: 'COCTEL DEL MAR USAQUEN', profile: 'Restaurante', location: 'Cóctel del Mar Usaquén' },
  { rappiId: '712052', fileName: 'Coctel del Mar Chapinero', profile: 'Restaurante', location: 'Cóctel del Mar Chapinero' },
];

// --- Catálogos sincronizados desde NetSuite (DED 7.14 paso 1) ----------------

const NS_SUBSIDIARIES: CatalogRow[] = [
  { internalId: '2', name: 'Hipermar Fish', operation: 'Supermercados' },
  { internalId: '3', name: 'Cóctel del Mar', operation: 'Restaurantes' },
];

// 21 ubicaciones creadas en NetSuite (DED 1.3): las 8 del facturador, 10
// restaurantes y 3 centros de distribución.
const RESTAURANT_LOCATIONS = [
  'Usaquén',
  'Chapinero',
  'Zona T',
  'Cedritos',
  'Salitre',
  'Unicentro',
  'Andino',
  'Santa Fe',
  'Colina',
  'Calle 93',
];
const NS_LOCATIONS: CatalogRow[] = [
  ...HIPERMAR_PREFIXES.map((prefix, i) => ({
    internalId: String(101 + i),
    name: hipermarName(prefix),
    subsidiary: 'Hipermar Fish',
    type: 'Tienda',
  })),
  ...RESTAURANT_LOCATIONS.map((name, i) => ({
    internalId: String(201 + i),
    name: `Cóctel del Mar ${name}`,
    subsidiary: 'Cóctel del Mar',
    type: 'Restaurante',
  })),
  ...['CEDI Bogotá', 'CEDI Medellín', 'Planta de procesamiento'].map((name, i) => ({
    internalId: String(301 + i),
    name,
    subsidiary: 'Hipermar Fish',
    type: 'Bodega',
  })),
];

const NS_ACCOUNTS: CatalogRow[] = [
  ['110510', 'Puente efectivo', 'Activo'],
  ['111005', 'Bancolombia ahorros ****4521', 'Banco'],
  ['111010', 'Davivienda corriente ****7730', 'Banco'],
  ['111015', 'Banco Caja Social ****2208', 'Banco'],
  ['138090', 'Puente de ventas', 'Activo'],
  ['138095', 'Puente Rappi', 'Activo'],
  ['138096', 'Puente transferencias', 'Activo'],
  ['138097', 'Puente tarjeta crédito', 'Activo'],
  ['138098', 'Puente tarjeta débito', 'Activo'],
  ['135515', 'Retención en la fuente', 'Activo'],
  ['135517', 'Retención de IVA', 'Activo'],
  ['135518', 'Retención de ICA', 'Activo'],
  ['240805', 'IVA por pagar', 'Pasivo'],
  ['246405', 'Impuesto nacional al consumo por pagar', 'Pasivo'],
  ['280505', 'Ingresos diferidos bonos', 'Pasivo'],
  ['413005', 'Ventas restaurante', 'Ingreso'],
  ['413505', 'Ventas retail', 'Ingreso'],
  ['413595', 'Otras ventas', 'Ingreso'],
  ['530515', 'Comisiones bancarias', 'Gasto'],
  ['530520', 'Comisión plataforma Rappi', 'Gasto'],
].map(([number, name, type]) => ({ number, name, type }));

// --- Datos maestros (carga inicial por plantilla, DED 7.17) ------------------

const ITEMS: CatalogRow[] = [
  ['10021', 'Filete de salmón', 'kg', '1', '3', 'Sí'],
  ['10034', 'Camarón tigre U15', 'kg', '1', '5', 'Sí'],
  ['10047', 'Pulpo cocido', 'kg', '1', '6', 'Sí'],
  ['10052', 'Anillos de calamar', 'kg', '1', '7', 'Sí'],
  ['10068', 'Atún en lomo', 'kg', '1', '4', 'Sí'],
  ['10075', 'Langostino jumbo', 'kg', '1', '8', 'Sí'],
  ['10110', 'Atún en lata 170 g', 'und', '1', '9', 'Sí'],
  ['10220', 'Salsa tártara 250 ml', 'und', '1', '11', 'Sí'],
  ['10410', 'Vino blanco Sauvignon 750 ml', 'und', '1', '14', 'Sí'],
  ['10990', 'Bolsa plástica', 'und', '1', '20', 'No'],
  ['50012', 'Cóctel de camarón', 'und', '2', '502', 'No'],
  ['50025', 'Ceviche mixto', 'und', '2', '503', 'No'],
  ['50031', 'Cazuela de mariscos', 'und', '2', '504', 'No'],
  ['50044', 'Limonada de coco', 'und', '2', '505', 'No'],
  ['70001', 'Bono de regalo', 'und', '3', '700', 'No'],
].map(([code, name, unit, major, family, inventory]) => ({ code, name, unit, major, family, inventory }));

// Homologaciones — parametrización de la solución.
const SHARED_HOMOLOGATIONS: Catalog[] = [
  {
    id: 'map-tender',
    name: 'Medio de pago → cuenta puente',
    description: 'Tender media del punto de venta a la cuenta puente del asiento de reclasificación.',
    kind: 'homologation',
    source: 'Parametrización de la solución',
    updatedAt: '2026-09-22T17:30:00',
    columns: [
      { key: 'tender', label: 'Tender media', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'account', label: 'Cuenta puente' },
    ],
    rows: TENDER_MAP,
  },
  {
    id: 'map-product-group',
    name: 'Clasificación de producto → cuenta de ingreso',
    description: 'Major y Family Group del punto de venta a la cuenta de ingreso de la Cash Sale.',
    kind: 'homologation',
    source: 'Parametrización de la solución',
    updatedAt: '2026-09-22T17:30:00',
    columns: [
      { key: 'major', label: 'Major Group' },
      { key: 'family', label: 'Family Group', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'account', label: 'Cuenta de ingreso' },
      { key: 'isDefault', label: 'Por defecto' },
    ],
    rows: GROUP_MAP,
  },
  {
    id: 'map-store',
    name: 'Ubicación del facturador → NetSuite',
    description: 'storeId del facturador a la ubicación y subsidiaria de NetSuite, con su prefijo fiscal.',
    kind: 'homologation',
    source: 'Parametrización de la solución',
    updatedAt: '2026-09-22T17:30:00',
    columns: [
      { key: 'storeId', label: 'storeId', mono: true },
      { key: 'prefix', label: 'Prefijo fiscal', mono: true },
      { key: 'location', label: 'Ubicación NetSuite' },
      { key: 'subsidiary', label: 'Subsidiaria' },
    ],
    rows: STORE_MAP,
  },
  {
    id: 'map-acquirer',
    name: 'Establecimiento de adquirencia → ubicación',
    description: 'Código de establecimiento Bancolombia o comercio Davivienda a ubicación, cuenta y parser vigente.',
    kind: 'homologation',
    source: 'Parametrización de la solución',
    updatedAt: '2026-09-24T11:15:00',
    columns: [
      { key: 'establishment', label: 'Establecimiento', mono: true },
      { key: 'bank', label: 'Banco' },
      { key: 'location', label: 'Ubicación' },
      { key: 'account', label: 'Cuenta bancaria' },
      { key: 'parser', label: 'Parser vigente' },
    ],
    rows: ACQUIRER_MAP,
  },
  {
    id: 'map-rappi-store',
    name: 'Tienda Rappi → ubicación',
    description: 'Identificador de tienda Rappi a la ubicación del facturador y de NetSuite.',
    kind: 'homologation',
    source: 'Parametrización de la solución',
    updatedAt: '2026-09-24T11:15:00',
    columns: [
      { key: 'rappiId', label: 'Id tienda Rappi', mono: true },
      { key: 'fileName', label: 'Nombre en la liquidación' },
      { key: 'profile', label: 'Perfil' },
      { key: 'location', label: 'Ubicación' },
    ],
    rows: RAPPI_STORE_MAP,
  },
];

// Sincronizados desde NetSuite — proceso periódico.
const SHARED_NETSUITE_CATALOGS: Catalog[] = [
  {
    id: 'ns-subsidiaries',
    name: 'Subsidiarias',
    description: 'Subsidiarias de NetSuite que operan con Simphony.',
    kind: 'netsuite',
    source: 'Sincronización con NetSuite',
    updatedAt: '2026-09-28T06:00:00',
    columns: [
      { key: 'internalId', label: 'Id interno', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'operation', label: 'Operación' },
    ],
    rows: NS_SUBSIDIARIES,
  },
  {
    id: 'ns-locations',
    name: 'Ubicaciones',
    description: 'Ubicaciones creadas en NetSuite para las subsidiarias.',
    kind: 'netsuite',
    source: 'Sincronización con NetSuite',
    updatedAt: '2026-09-28T06:00:00',
    columns: [
      { key: 'internalId', label: 'Id interno', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'subsidiary', label: 'Subsidiaria' },
      { key: 'type', label: 'Tipo' },
    ],
    rows: NS_LOCATIONS,
  },
  {
    id: 'ns-accounts',
    name: 'Cuentas contables',
    description: 'Cuentas del plan de cuentas que usan los asientos de venta y de conciliación.',
    kind: 'netsuite',
    source: 'Sincronización con NetSuite',
    updatedAt: '2026-09-28T06:00:00',
    columns: [
      { key: 'number', label: 'Número', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'type', label: 'Tipo' },
    ],
    rows: NS_ACCOUNTS,
  },
];

// Datos maestros — plantilla de carga inicial.
const MASTER_CATALOGS: Catalog[] = [
  {
    id: 'master-items',
    name: 'Artículos',
    description: 'Artículos vendidos con su clasificación de producto. NetSuite es el maestro de artículos.',
    kind: 'master',
    source: 'Plantilla de carga inicial (NetSuite)',
    updatedAt: '2026-09-18T09:45:00',
    columns: [
      { key: 'code', label: 'Código', mono: true },
      { key: 'name', label: 'Nombre' },
      { key: 'unit', label: 'Unidad' },
      { key: 'major', label: 'Major Group', mono: true },
      { key: 'family', label: 'Family Group', mono: true },
      { key: 'inventory', label: 'Inventariable' },
    ],
    rows: ITEMS,
  },
];

const COUNTRY_CATALOGS: Record<CountryCode, { fiscal: Catalog[]; taxMap: Catalog; nsTaxCodes: Catalog }> = {
  MX: { fiscal: MX_FISCAL_CATALOGS, taxMap: MX_TAX_MAP_CATALOG, nsTaxCodes: MX_NS_TAX_CODES_CATALOG },
  CO: { fiscal: CO_FISCAL_CATALOGS, taxMap: CO_TAX_MAP_CATALOG, nsTaxCodes: CO_NS_TAX_CODES_CATALOG },
};

const countryCatalogs = COUNTRY_CATALOGS[ACTIVE_COUNTRY.code];

export const MOCK_CATALOGS: Catalog[] = [
  ...countryCatalogs.fiscal,
  ...SHARED_HOMOLOGATIONS,
  countryCatalogs.taxMap,
  ...SHARED_NETSUITE_CATALOGS,
  countryCatalogs.nsTaxCodes,
  ...MASTER_CATALOGS,
];
