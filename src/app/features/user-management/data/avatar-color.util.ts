// Color del avatar de iniciales — deriva de las marcas *token*, nunca un hex
// propio (regla dura del design system, ver MASTER.md "Tokens de color").
// Rota entre las 3 parejas marca/on-marca disponibles según un hash estable
// del id, así cada usuario mantiene el mismo color entre renders sin
// necesidad de guardarlo en el modelo.
const AVATAR_TOKENS: { background: string; color: string }[] = [
  { background: 'var(--color-primary)', color: 'var(--color-on-primary)' },
  { background: 'var(--color-secondary)', color: 'var(--color-on-secondary)' },
  { background: 'var(--color-accent)', color: 'var(--color-on-accent)' },
];

export function avatarTokensFor(id: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TOKENS[hash % AVATAR_TOKENS.length];
}

export function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
