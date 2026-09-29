// Catálogos cargados (CU14 del DED, sección 7.14): vista de SOLO LECTURA de
// los catálogos, listas y homologaciones que usa la solución. No existe
// mantenimiento desde el portal (DED 2.2) — las correcciones se piden por
// soporte, así que este modelo no tiene ninguna operación de escritura.

import { CountryProfile } from '../../../core/country/country.model';

// Los cuatro orígenes que distingue el DED (7.13, 7.14 y 7.17): catálogos
// fijos de la autoridad fiscal del país (SAT / DIAN), homologaciones
// (parametrización de la solución), catálogos dinámicos sincronizados desde
// NetSuite y datos maestros de la carga inicial por plantilla.
export type CatalogKind = 'fiscal' | 'homologation' | 'netsuite' | 'master';

export function catalogKindLabels(country: CountryProfile): Record<CatalogKind, string> {
  return {
    fiscal: `Catálogo fijo ${country.taxAuthority.acronym}`,
    homologation: 'Homologación',
    netsuite: 'Sincronizado desde NetSuite',
    master: 'Dato maestro',
  };
}

// Columnas propias de cada lista — cada catálogo tiene su propia forma
// (un tributo no se parece a una cuenta contable), así que la tabla del
// detalle se arma a partir de esta definición en vez de un tipo por lista.
export interface CatalogColumn {
  key: string;
  label: string;
  // Código, cuenta, id — se muestra en `.font-mono`.
  mono?: boolean;
}

export type CatalogRow = Record<string, string>;

export interface Catalog {
  id: string;
  name: string;
  description: string;
  kind: CatalogKind;
  // De dónde llegó la información (plantilla, normativa, sincronización).
  source: string;
  // ISO datetime de la última carga o sincronización.
  updatedAt: string;
  columns: CatalogColumn[];
  // El número de registros SIEMPRE se deriva de `rows.length` — nunca un
  // campo aparte que se pueda desincronizar (mismo criterio que los totales
  // derivados de `sale.util.ts`).
  rows: CatalogRow[];
}
