// Proxy de `ng serve` hacia el Gateway del backend (coctel_midd, rama DEV).
//
// El Gateway es el único punto de entrada y enruta TODAS estas rutas (ver
// docs/Guia_Endpoints_Usuarios_Roles_Permisos_v2.pdf): /auth, /users, /roles,
// /permissions, /audit-log (auth-service), /sales (capture-service y core-service) y
// /catalogs (core-service: subsidiarias, ubicaciones, cargos, puestos, departamentos y
// áreas), /reconciliations (core-service: lista y alta de conciliaciones) y /reconciliation/
// (reconciliation-service: reportes del banco y cruce). Ninguna choca
// con las rutas del portal (/usuarios, /catalogos, /conciliacion…): el proxy compara por
// prefijo y "/catalogos" no empieza con "/catalogs".
//
// Destino: http://localhost:8080 (puerto real del Gateway de DEV). Si en tu máquina
// ese puerto lo ocupa otro proyecto, pon GATEWAY_PORT=<puerto> en dev-env/.env (lo usa también
// levantar-backend.ps1) o define GATEWAY_URL antes de `ng serve`:
//   PowerShell:  $env:GATEWAY_URL = 'http://localhost:8082'; pnpm start
//   bash:        GATEWAY_URL=http://localhost:8082 pnpm start
// Mismo origen para el navegador => no depende del CORS del Gateway en desarrollo
// (en producción sí: ver `src/environments/api-url.ts`).
// Orden: GATEWAY_URL (variable de entorno) → GATEWAY_PORT de dev-env/.env (el mismo que usa
// dev-env/levantar-backend.ps1) → 8080.
function gatewayPortFromDevEnv() {
  try {
    const text = require('node:fs').readFileSync(require('node:path').join(__dirname, 'dev-env', '.env'), 'utf8');
    const match = /^\s*GATEWAY_PORT\s*=\s*(\d+)/m.exec(text);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
const target = process.env.GATEWAY_URL || `http://localhost:${gatewayPortFromDevEnv() ?? '8080'}`;

const ROUTES = ['/auth', '/users', '/roles', '/permissions', '/audit-log', '/sales', '/catalogs', '/reconciliations', '/reconciliation/'];

module.exports = Object.fromEntries(
  ROUTES.map((route) => [route, { target, secure: false, changeOrigin: true }]),
);
