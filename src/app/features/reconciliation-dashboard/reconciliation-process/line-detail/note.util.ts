const MIN_LENGTH = 10;
const MIN_DISTINCT_LETTERS = 4;

/**
 * Valida la nota con el motivo de una acción: debe parecer una explicación y no un relleno.
 *
 * @remarks Exige 10 caracteres, dos palabras distintas de 2 letras o más y 4 letras diferentes.
 * @returns El mensaje de error, o `null` si la nota sirve.
 */
export function validateNote(text: string): string | null {
  const note = text.trim();
  if (note.length === 0) return 'Escribe el motivo de la acción.';

  const words = (note.toLowerCase().match(/\p{L}{2,}/gu) ?? []) as string[];
  const letters = new Set(note.toLowerCase().match(/\p{L}/gu) ?? []);
  const meaningful = note.length >= MIN_LENGTH && new Set(words).size >= 2 && letters.size >= MIN_DISTINCT_LETTERS;
  return meaningful ? null : 'Describe el motivo con palabras completas (mínimo 10 caracteres y dos palabras).';
}
