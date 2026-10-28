const ROLE_CODE_MAX_LENGTH = 40;

/**
 * Deriva el `code` de un rol a partir de su nombre ("Contabilidad Sur" → `CONTABILIDAD_SUR`).
 *
 * @remarks Replica `RoleAdminService.toCode` del backend para validar duplicados antes de `POST /roles`.
 * @returns `'ROL'` si el nombre no deja ningún carácter válido.
 * @see docs/codigo/roles-y-permisos.md#codigo-de-rol
 */
export function toRoleCode(name: string): string {
  const ascii = name.normalize('NFD').replace(/\p{M}/gu, '');
  let code = ascii
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (code.length > ROLE_CODE_MAX_LENGTH) {
    code = code.slice(0, ROLE_CODE_MAX_LENGTH).replace(/_+$/, '');
  }
  return code || 'ROL';
}
