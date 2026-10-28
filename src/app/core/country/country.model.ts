// Ver docs/codigo/configuracion-y-pais.md#perfil-de-pais

/** País de trabajo, fijado por `environment.country`. */
export type CountryCode = 'MX' | 'CO';

/** Impuesto trasladado en una venta; la UI pinta una línea por cada uno que defina el país. */
export interface SalesTaxDef {
  /** Código ante la autoridad (SAT `c_Impuesto` / tributo DIAN). */
  code: string;
  name: string;
  rate: number; // 0.16 = 16 %
}

/**
 * Lo que cambia entre países: moneda y formato, impuestos, vocabulario fiscal y vocabulario general.
 *
 * @see docs/codigo/configuracion-y-pais.md#perfil-de-pais
 */
export interface CountryProfile {
  code: CountryCode;
  name: string;
  // Formato de números, fechas y moneda (`LOCALE_ID`).
  locale: 'es-MX' | 'es-CO';
  currency: 'MXN' | 'COP';
  // Offset de los documentos fiscales para el pipe `date` (sin horario de verano).
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
    // Campos exclusivos del CFDI mexicano (uso del CFDI, método de pago).
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
