// Contrato de solo lectura de "Catálogos cargados" (CU14 del DED, 7.14): `GET /catalogs` y `GET /catalogs/items`.

/**
 * Tipo de catálogo del backend: fijo de la DIAN, sincronizado desde NetSuite o interno del sistema.
 *
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
export type CatalogType = 'DIAN' | 'NETSUITE' | 'INTERNAL';

/** Etiqueta de cada {@link CatalogType} para el filtro y la columna "Tipo". */
export const CATALOG_TYPE_LABELS: Record<CatalogType, string> = {
  DIAN: 'Catálogo fijo DIAN',
  NETSUITE: 'Sincronizado desde NetSuite',
  INTERNAL: 'Interno del sistema',
};

/** Entrada de `GET /catalogs`; `code` es la llave de `GET /catalogs/items`. */
export interface CatalogSummary {
  code: string;
  name: string;
  description: string;
  type: CatalogType;
  /** Texto de la columna "Origen" (DIAN, NetSuite, Interno…). */
  origin: string;
  fromNetsuite: boolean;
  /** Registros habilitados. */
  records: number;
  /** ISO datetime de la última modificación; `null` si el catálogo no tiene registros. */
  lastUpdate: string | null;
}

/** Tipo del valor de una columna, para darle formato. */
export type CatalogColumnType = 'text' | 'number' | 'boolean' | 'datetime';

/** Columna de un catálogo: cada catálogo trae las suyas. */
export interface CatalogColumn {
  /** Nombre del campo en cada {@link CatalogRecord}. */
  key: string;
  label: string;
  type: CatalogColumnType;
}

/** Registro de un catálogo: `id` y un campo por cada {@link CatalogColumn.key}. */
export type CatalogRecord = { id: number } & Record<string, unknown>;

/** Respuesta de `GET /catalogs/items`: encabezado, columnas y una página de registros. */
export interface CatalogDetail {
  catalog: CatalogSummary;
  columns: CatalogColumn[];
  data: CatalogRecord[];
  /** Registros que cumplen la búsqueda, en todas las páginas. */
  total: number;
  page: number;
  pageSize: number;
}
