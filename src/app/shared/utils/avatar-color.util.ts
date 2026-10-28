// Parejas marca/on-marca: el avatar usa tokens, nunca un hex propio (MASTER.md "Tokens de color").
const AVATAR_TOKENS: { background: string; color: string }[] = [
  { background: 'var(--color-primary)', color: 'var(--color-on-primary)' },
  { background: 'var(--color-secondary)', color: 'var(--color-on-secondary)' },
  { background: 'var(--color-accent)', color: 'var(--color-on-accent)' },
];

/**
 * Pareja fondo/texto del avatar de iniciales, rotada por un hash estable de `id`.
 *
 * @remarks El mismo id obtiene siempre el mismo color sin guardarlo en el modelo.
 * @see docs/codigo/componentes-y-utilidades.md#avatar-color
 */
export function avatarTokensFor(id: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TOKENS[hash % AVATAR_TOKENS.length];
}

/**
 * Iniciales del avatar: primera letra del primer y del último token, o dos letras si hay uno solo.
 *
 * @returns `'?'` si el nombre está vacío.
 */
export function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
