// Modelo de solo lectura (CU14 del DED, 7.14): no hay mantenimiento desde el portal (DED 2.2).

import { CountryProfile } from '../../../core/country/country.model';

/**
 * Origen de un catálogo (DED 7.13, 7.14 y 7.17): autoridad fiscal, homologación, NetSuite o dato maestro.
 *
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
export type CatalogKind = 'fiscal' | 'homologation' | 'netsuite' | 'master';

/** Etiqueta de cada {@link CatalogKind}; la fiscal lleva el acrónimo de la autoridad del país. */
export function catalogKindLabels(country: CountryProfile): Record<CatalogKind, string> {
  return {
    fiscal: `Catálogo fijo ${country.taxAuthority.acronym}`,
    homologation: 'Homologación',
    netsuite: 'Sincronizado desde NetSuite',
    master: 'Dato maestro',
  };
}

/** Columna de un catálogo: cada lista define las suyas en lugar de tener un tipo propio. */
export interface CatalogColumn {
  key: string;
  label: string;
  /** Código, cuenta o id: se muestra en `.font-mono`. */
  mono?: boolean;
}

/** Fila de un catálogo, indexada por {@link CatalogColumn.key}. */
export type CatalogRow = Record<string, string>;

/** Catálogo cargado con sus columnas y filas. */
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
  /** El número de registros se deriva de `rows.length`; no hay campo aparte que se desincronice. */
  rows: CatalogRow[];
}
