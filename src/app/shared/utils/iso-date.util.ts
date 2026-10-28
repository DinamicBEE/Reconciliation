// Fechas de calendario `'yyyy-MM-dd'` ↔ `Date` de nz-date-picker, siempre en hora local.
// Ver docs/codigo/componentes-y-utilidades.md#fechas-iso

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * `'yyyy-MM-dd'` (o un ISO con hora, del que solo se toma la fecha) → medianoche local de ese día.
 *
 * @returns `null` si viene vacío o no es una fecha válida.
 * @see docs/codigo/componentes-y-utilidades.md#fechas-iso
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fecha del calendario local → `'yyyy-MM-dd'`; `''` si no hay fecha. */
export function toIsoDate(value: Date | null | undefined): string {
  if (!value) return '';
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** Como {@link toIsoDate}, pero `null` si no hay fecha (campos opcionales, p. ej. fin de contrato indefinido). */
export function toIsoDateOrNull(value: Date | null | undefined): string | null {
  return value ? toIsoDate(value) : null;
}
