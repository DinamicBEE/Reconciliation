/**
 * Entrada `{id, nombre}` de un catálogo del backend (`SubsidiariaSummaryDto`, `UbicacionSummaryDto`, `GET /catalogs/...`).
 *
 * @remarks Los selects de subsidiaria o ubicación se llenan desde el backend, nunca con listas propias del front.
 * @see docs/codigo/catalogos.md#entrada-de-catalogo
 */
export interface CatalogEntry {
  id: number;
  nombre: string;
}
