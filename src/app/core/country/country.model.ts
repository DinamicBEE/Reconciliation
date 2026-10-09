// Perfil de país — todo lo que cambia entre México y Colombia en el
// frontend: moneda y formato numérico, campos de impuestos, vocabulario
// fiscal (autoridad, comprobante, identificación tributaria, régimen) y
// vocabulario general (ubicación, dirección, identificación personal).
// Se elige con `environment.country` (ver `active-country.ts`).

export type CountryCode = 'MX' | 'CO';

// Impuesto trasladado en una venta. Hoy cada país tiene uno general (IVA),
// pero la lista permite que la UI pinte tantas líneas como defina el país.
export interface SalesTaxDef {
  // Código del impuesto ante la autoridad (SAT c_Impuesto / tributo DIAN).
  code: string;
  name: string;
  rate: number; // 0.16 = 16 %
}

export interface CountryProfile {
  code: CountryCode;
  name: string;
  // Formato de números, fechas y moneda (`LOCALE_ID`).
  locale: 'es-MX' | 'es-CO';
  currency: 'MXN' | 'COP';
  // Offset horario de los documentos fiscales, formato del pipe `date`
  // (ninguno de los dos países tiene horario de verano).
  fiscalTimezone: '-0600' | '-0500';

  taxAuthority: {
    acronym: 'SAT' | 'DIAN';
    name: string;
  };

  // Identificación tributaria del cliente.
  taxId: {
    label: 'RFC' | 'NIT';
    // Receptor genérico: "Público en general" (MX) / "Consumidor final" (CO).
    genericId: string;
    genericName: string;
  };

  personType: {
    natural: string;
    juridica: string;
  };

  // Régimen fiscal del cliente — código propio de cada país → etiqueta.
  taxRegime: {
    label: string;
    options: Record<string, string>;
  };

  salesTaxes: SalesTaxDef[];

  // Comprobante fiscal de la venta (CFDI / factura electrónica).
  invoice: {
    sectionTitle: string;
    seriesLabel: string;
    numberLabel: string;
    fiscalIdLabel: string;
    issuedAtLabel: string;
    // Campos que solo existen en el CFDI mexicano (uso del CFDI, método de
    // pago). Colombia no los tiene.
    hasCfdiFields: boolean;
    queryLabel: string;
    queryLinkText: string;
    queryUrl: (fiscalId: string) => string;
  };

  // Vocabulario general.
  vocabulary: {
    // Punto de venta: "Sucursal" (MX) / "Ubicación" (CO, término unificado del DED).
    location: string;
    allLocations: string;
    // Identificación personal del colaborador (campo `ssn` del modelo).
    personalIdLabel: string;
    personalIdPlaceholder: string;
    stateLabel: string;
    cityLabel: string;
    phonePlaceholder: string;
  };
}
