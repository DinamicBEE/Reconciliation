// Función pura y testeable — sin estado, sin DI (ver MASTER.md, "Estructura
// de carpetas"). Genera una contraseña temporal legible — hace las veces del
// backend para las cuentas que viven solo en el mock (alta y "Restablecer
// contraseña", ver UserManagementService.createUser/resetPassword). Para las
// cuentas del backend la contraseña temporal llega en `GET /users/{id}`.
// Excluye caracteres ambiguos (0/O, 1/l/I) para que se pueda transcribir a
// mano sin errores.
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[Math.floor(Math.random() * TEMP_PASSWORD_CHARS.length)];
  }
  return out;
}
