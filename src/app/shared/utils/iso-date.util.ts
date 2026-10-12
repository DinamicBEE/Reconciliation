// Funciones puras y testeables — sin estado, sin DI (ver MASTER.md, "Estructura
// de carpetas"). Cruzan la frontera entre `nz-date-picker` (`Date | null`) y el
// modelo, que guarda fechas de CALENDARIO sin hora como `'yyyy-MM-dd'`
// (`birthDate`, `hireDate`, `contractEndDate`).
//
// Se trabaja SIEMPRE en hora local, nunca en UTC: `new Date('2025-01-10')` se
// interpreta como medianoche UTC, que en México/Colombia (UTC-5/-6) es el día
// ANTERIOR — el selector mostraba 09/01/2025. Y `toISOString()` sobre la
// medianoche local que entrega el selector también puede cruzar de día.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

// `'yyyy-MM-dd'` (o un ISO con hora, del que solo se toma la fecha) → medianoche
// LOCAL de ese día. `null` si viene vacío o no es una fecha válida.
export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Fecha del calendario LOCAL → `'yyyy-MM-dd'`; `''` si no hay fecha.
export function toIsoDate(value: Date | null | undefined): string {
  if (!value) return '';
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

// Igual que `toIsoDate`, pero `null` si no hay fecha (campos opcionales, p. ej.
// fin de contrato indefinido).
export function toIsoDateOrNull(value: Date | null | undefined): string | null {
  return value ? toIsoDate(value) : null;
}
