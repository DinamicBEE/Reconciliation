import { formatDate } from '@angular/common';
import { CatalogColumnType } from './catalogs.model';

/** Texto que se muestra en lugar de un valor vacío. */
export const EMPTY_CATALOG_VALUE = '—';

/**
 * Da formato a un valor de `GET /catalogs/items` según el tipo de su columna.
 *
 * @remarks Los `number` se muestran tal cual: suelen ser códigos o ids, no cantidades.
 * @see docs/codigo/catalogos.md#pantalla-catalogos-cargados
 */
export function formatCatalogValue(value: unknown, type: CatalogColumnType, locale: string): string {
  if (value === null || value === undefined || value === '') return EMPTY_CATALOG_VALUE;
  if (type === 'boolean') return value === true || value === 'true' ? 'Sí' : 'No';
  if (type === 'datetime' && (typeof value === 'string' || typeof value === 'number')) {
    try {
      return formatDate(value, 'dd/MM/yyyy HH:mm', locale);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
