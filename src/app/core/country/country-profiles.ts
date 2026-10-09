import { CountryCode, CountryProfile } from './country.model';

const MEXICO: CountryProfile = {
  code: 'MX',
  name: 'México',
  locale: 'es-MX',
  currency: 'MXN',
  fiscalTimezone: '-0600',
  taxAuthority: { acronym: 'SAT', name: 'Servicio de Administración Tributaria' },
  taxId: { label: 'RFC', genericId: 'XAXX010101000', genericName: 'Público en general' },
  personType: { natural: 'Persona física', juridica: 'Persona moral' },
  // Catálogo c_RegimenFiscal del SAT (los que usa el mock de ventas).
  taxRegime: {
    label: 'Régimen fiscal',
    options: {
      '601': '601 · General de Ley Personas Morales',
      '612': '612 · Personas Físicas con Actividades Empresariales y Profesionales',
      '616': '616 · Sin obligaciones fiscales',
      '626': '626 · Régimen Simplificado de Confianza',
    },
  },
  salesTaxes: [{ code: '002', name: 'IVA', rate: 0.16 }],
  invoice: {
    sectionTitle: 'Comprobante fiscal (CFDI)',
    seriesLabel: 'Serie',
    numberLabel: 'Folio',
    fiscalIdLabel: 'Folio fiscal (UUID)',
    issuedAtLabel: 'Fecha de timbrado',
    hasCfdiFields: true,
    queryLabel: 'Verificación SAT',
    queryLinkText: 'Verificar CFDI en el SAT',
    queryUrl: (uuid) => `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}`,
  },
  vocabulary: {
    location: 'Sucursal',
    allLocations: 'Todas las sucursales',
    personalIdLabel: 'NSS',
    personalIdPlaceholder: '00000000000',
    stateLabel: 'Estado',
    cityLabel: 'Ciudad',
    phonePlaceholder: '+52 55 1234 5678',
  },
};

const COLOMBIA: CountryProfile = {
  code: 'CO',
  name: 'Colombia',
  locale: 'es-CO',
  currency: 'COP',
  fiscalTimezone: '-0500',
  taxAuthority: { acronym: 'DIAN', name: 'Dirección de Impuestos y Aduanas Nacionales' },
  taxId: { label: 'NIT', genericId: '222222222222', genericName: 'Consumidor final' },
  personType: { natural: 'Persona natural', juridica: 'Persona jurídica' },
  // Códigos de responsabilidad de IVA de la DIAN (reemplazaron "Régimen
  // común"/"Régimen simplificado" tras la Ley 2010 de 2019).
  taxRegime: {
    label: 'Régimen tributario',
    options: {
      '48': 'Responsable de IVA',
      '49': 'No responsable de IVA',
    },
  },
  salesTaxes: [{ code: '01', name: 'IVA', rate: 0.19 }],
  invoice: {
    sectionTitle: 'Documento electrónico',
    seriesLabel: 'Prefijo',
    numberLabel: 'Folio de factura',
    fiscalIdLabel: 'CUFE',
    issuedAtLabel: 'Fecha de facturación',
    hasCfdiFields: false,
    queryLabel: 'Consulta DIAN',
    queryLinkText: 'Ver documento en la DIAN',
    queryUrl: (cufe) => `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
  },
  vocabulary: {
    location: 'Ubicación',
    allLocations: 'Todas las ubicaciones',
    personalIdLabel: 'Número de cédula',
    personalIdPlaceholder: '0000000000',
    stateLabel: 'Departamento',
    cityLabel: 'Municipio',
    phonePlaceholder: '+57 300 123 4567',
  },
};

export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  MX: MEXICO,
  CO: COLOMBIA,
};
