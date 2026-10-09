import { Catalog, CatalogKind, CatalogRow } from './catalogs.model';

// Funciones puras de filtrado de la pantalla de Catálogos — sin estado ni DI
// (ver MASTER.md, "función de derivación pura").

// Listado de catálogos: por tipo y por texto libre sobre nombre y
// descripción.
export function filterCatalogs(catalogs: readonly Catalog[], term: string, kind: CatalogKind | 'all'): Catalog[] {
  const q = term.trim().toLowerCase();
  return catalogs.filter((catalog) => {
    if (kind !== 'all' && catalog.kind !== kind) return false;
    if (q && !catalog.name.toLowerCase().includes(q) && !catalog.description.toLowerCase().includes(q)) return false;
    return true;
  });
}

// Búsqueda DENTRO de una lista (CU14 paso 3: "comprobar si un valor está
// cargado") — coincide contra cualquier columna de la fila.
export function filterCatalogRows(rows: readonly CatalogRow[], term: string): CatalogRow[] {
  const q = term.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(q)));
}
