// Función pura y testeable — sin estado, sin DI (ver MASTER.md, "Estructura de
// carpetas"). Replica `RoleAdminService.toCode` del backend (auth-service): el
// `code` de un rol se deriva de su nombre al crearlo ("Contabilidad Sur" →
// "CONTABILIDAD_SUR") y el backend rechaza con 409 `ROLE_ALREADY_EXISTS` un código
// que ya exista — aunque el rol esté dado de baja. Sirve para validar el nombre
// ANTES de enviarlo y para mostrar el código que tendrá el rol.

const ROLE_CODE_MAX_LENGTH = 40;

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
