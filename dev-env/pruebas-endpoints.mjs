// Pruebas de contrato de los endpoints que el portal ya usa (y de los ajustes de la v2.0), contra el
// Gateway real del backend DEV. Reproducen lo que el front envía y esperan lo que dice la guía
// (docs/Guia_Endpoints_Usuarios_Roles_Permisos_v2.pdf).
//
//   node dev-env/pruebas-endpoints.mjs                      # contra http://localhost:8080
//   GATEWAY_URL=http://localhost:8082 node dev-env/pruebas-endpoints.mjs
//
// Crea UNA cuenta temporal (prueba.endpoints.<ts>@conciliacion.mx), la bloquea/desbloquea/edita y al
// terminar la da de baja con DELETE /users/{id} (baja lógica; libera su correo). No toca las cuentas demo,
// salvo iniciar sesión con el administrador (admin@conciliacion.mx).
import { readFileSync } from 'node:fs';
const devEnvPort = (() => {
  try {
    return /^\s*GATEWAY_PORT\s*=\s*(\d+)/m.exec(readFileSync(new URL('./.env', import.meta.url), 'utf8'))?.[1];
  } catch {
    return undefined;
  }
})();
const BASE = process.env.GATEWAY_URL || `http://localhost:${devEnvPort ?? 8080}`;
const ADMIN = { username: 'admin@conciliacion.mx', password: 'Conciliacion2026' };

let pass = 0;
const failures = [];
const log = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* sin cuerpo JSON */ }
  return { status: res.status, body: json, text };
}

function check(name, cond, detail = '') {
  if (cond) { pass++; log.push(`  ok   ${name}`); }
  else { failures.push(name); log.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t) => log.push(`\n${t}`);
const code = (r) => r.body?.code;
const claims = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); } catch { return {}; } };
const j = (x) => JSON.stringify(x);

async function main() {
  const stamp = Date.now();
  const email = `prueba.endpoints.${stamp}@conciliacion.mx`;
  let userId = null;
  let admin;

  // ---------- POST /auth/login ----------
  section('POST /auth/login');
  let r = await call('POST', '/auth/login', { body: ADMIN });
  check('login correcto → 200 con accessToken/refreshToken/expiresIn', r.status === 200 && r.body?.accessToken && r.body?.refreshToken && r.body?.expiresIn === 900, `status ${r.status}`);
  check('user trae roles, permissions, subsidiarias y ubicaciones', Array.isArray(r.body?.user?.roles) && r.body.user.permissions?.includes('manage_users') && r.body.user.subsidiarias?.length >= 1 && r.body.user.ubicaciones?.length >= 1);
  admin = r.body;
  const T = admin.accessToken;
  r = await call('POST', '/auth/login', { body: { username: ADMIN.username, password: 'incorrecta' } });
  check('contraseña mala → 401 INVALID_CREDENTIALS', r.status === 401 && code(r) === 'INVALID_CREDENTIALS', `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/login', { body: { username: 'no.existe@x.mx', password: 'x' } });
  check('correo inexistente → mismo 401 INVALID_CREDENTIALS (no revela correos)', r.status === 401 && code(r) === 'INVALID_CREDENTIALS');

  // ---------- GET /auth/me ----------
  section('GET /auth/me');
  r = await call('GET', '/auth/me', { token: T });
  check('me → 200 con el usuario de la sesión', r.status === 200 && r.body?.email === ADMIN.username);
  r = await call('GET', '/auth/me');
  check('me sin token → 401', r.status === 401);

  // ---------- GET /users (permiso + paginación) ----------
  section('GET /users (autorización por permiso, size 100, paginación)');
  r = await call('GET', '/users?size=100', { token: T });
  check('size=100 → 200 con content/page/size/totalElements/totalPages', r.status === 200 && Array.isArray(r.body?.content) && r.body.size === 100 && r.body.page === 0 && r.body.totalPages >= 1, j({ s: r.status, k: r.body && Object.keys(r.body) }));
  const total = r.body?.totalElements ?? 0;
  check('trae las 26 cuentas demo + administrador (≥ 27)', total >= 27, `totalElements ${total}`);
  // Misma lógica que AuthService.listAllUsers(): recorrer páginas (page+1 < totalPages), juntar por id y,
  // si faltan cuentas, pedir UNA página de tamaño totalElements.
  const size = 10;
  const seen = new Map();
  let page = 0, pages = 0, fetched = 0;
  for (;;) {
    const p = await call('GET', `/users?page=${page}&size=${size}`, { token: T });
    pages = p.body.totalPages;
    p.body.content.forEach((u) => { seen.set(u.id, u); fetched++; });
    if (page + 1 >= pages) break;
    page++;
  }
  check(`hay más de una página con size=${size} (${pages} páginas) — se ejercita la paginación`, pages > 1);
  log.push(`       recorrido por páginas: ${fetched} filas leídas, ${seen.size} cuentas distintas de ${total} (el back pagina sin ORDER BY: puede repetir/omitir)`);
  let all = [...seen.values()];
  if (seen.size < total) all = (await call('GET', `/users?page=0&size=${total}`, { token: T })).body.content;
  check(`estrategia del front (dedupe por id + respaldo size=totalElements) reúne las ${total} cuentas sin duplicados`, all.length === total && new Set(all.map((u) => u.id)).size === total);
  r = await call('GET', '/users?search=laura', { token: T });
  check('filtro search=laura → solo coincidencias', r.status === 200 && r.body.content.length >= 1 && r.body.content.every((u) => /laura/i.test(u.displayName + u.email)));
  r = await call('GET', '/users?status=blocked', { token: T });
  check('filtro status=blocked incluye las cuentas LOCKED sembradas', r.status === 200 && r.body.content.length >= 3 && r.body.content.every((u) => u.status === 'LOCKED'));

  // ---------- POST /users ----------
  section('POST /users');
  const create = (over = {}) => call('POST', '/users', { token: T, body: { firstName: 'Prueba', lastName: 'Endpoints', email, phone: null, supervisorId: null, subsidiariaIds: [1], ubicacionIds: [1], roleIds: ['CONTABILIDAD'], status: 'active', ...over } });
  r = await create();
  check('alta → 201 con temporaryPassword y mustChangePassword', r.status === 201 && r.body?.temporaryPassword && r.body.mustChangePassword === true, `${r.status} ${j(r.body)}`);
  userId = r.body?.id;
  const tempPassword = r.body?.temporaryPassword;
  r = await create();
  check('correo repetido → 409 EMAIL_ALREADY_REGISTERED', r.status === 409 && code(r) === 'EMAIL_ALREADY_REGISTERED', `${r.status} ${j(r.body)}`);
  r = await create({ email: `otro.${stamp}@conciliacion.mx`, ubicacionIds: [9999] });
  check('ubicación inexistente → 400 INVALID_LOCATION', r.status === 400 && code(r) === 'INVALID_LOCATION', `${r.status} ${j(r.body)}`);
  r = await create({ email: `otro.${stamp}@conciliacion.mx`, roleIds: ['NO_EXISTE'] });
  check('rol inexistente → 400 INVALID_ROLE', r.status === 400 && code(r) === 'INVALID_ROLE', `${r.status} ${j(r.body)}`);
  r = await create({ email: `otro.${stamp}@conciliacion.mx`, status: 'locked' });
  check('estado inválido en el alta → 400 INVALID_USER_STATUS', r.status === 400 && code(r) === 'INVALID_USER_STATUS', `${r.status} ${j(r.body)}`);

  // ---------- GET /users/{id} ----------
  section('GET /users/{id} (3 campos nuevos)');
  r = await call('GET', `/users/${userId}`, { token: T });
  check('detalle → 200', r.status === 200 && r.body?.id === userId);
  check('trae failedLoginAttempts, activeSessions y lockedUntil', r.body && 'failedLoginAttempts' in r.body && 'activeSessions' in r.body && 'lockedUntil' in r.body, j(Object.keys(r.body || {})));
  check('valores iniciales: 0 intentos, 0 sesiones, sin bloqueo', r.body?.failedLoginAttempts === 0 && r.body?.activeSessions === 0 && r.body?.lockedUntil === null);
  check('mustChangePassword y temporaryPassword mientras no la cambie', r.body?.mustChangePassword === true && r.body?.temporaryPassword === tempPassword);
  r = await call('GET', '/users/999999', { token: T });
  check('id inexistente → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND', `${r.status} ${j(r.body)}`);

  // ---------- Contraseña temporal: PASSWORD_CHANGE_REQUIRED + change-password + refresh ----------
  section('Contraseña temporal · POST /auth/change-password + refresh');
  r = await call('POST', '/auth/login', { body: { username: email, password: tempPassword } });
  check('login con la temporal → mustChangePassword true', r.status === 200 && r.body?.user?.mustChangePassword === true);
  let session = r.body;
  r = await call('GET', '/users', { token: session.accessToken });
  check('endpoint protegido con token pendiente → 403 (Gateway, formato Spring)', r.status === 403, `${r.status} ${j(r.body)}`);
  log.push(`       el rechazo del Gateway viene en formato Spring (sin code): ${r.text.slice(0, 100)} — el front lo trata como PASSWORD_CHANGE_REQUIRED mientras la sesión esté marcada como pendiente`);
  r = await call('POST', '/auth/change-password', { token: session.accessToken, body: { currentPassword: 'EquivocadaXX99', newPassword: 'NuevaClave2026x' } });
  check('contraseña actual incorrecta → 401 INVALID_CREDENTIALS', r.status === 401 && code(r) === 'INVALID_CREDENTIALS', `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/change-password', { token: session.accessToken, body: { currentPassword: tempPassword, newPassword: 'corta' } });
  check('contraseña nueva corta → 400', r.status === 400, `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/change-password', { token: session.accessToken, body: { currentPassword: tempPassword, newPassword: 'NuevaClave2026x' } });
  check('cambio correcto → 200', r.status === 200, `${r.status} ${j(r.body)}`);
  const staleToken = session.accessToken;
  check('el JWT anterior sigue con mustChangePassword=true (por eso hay que refrescar)', claims(staleToken).mustChangePassword === true);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: session.refreshToken } });
  check('refresh posterior → 200 con par nuevo', r.status === 200 && r.body?.accessToken && r.body?.refreshToken && r.body.refreshToken !== session.refreshToken, `${r.status} ${j(r.body)}`);
  check('el JWT nuevo ya trae mustChangePassword=false', claims(r.body?.accessToken).mustChangePassword === false);
  const oldRefresh = session.refreshToken;
  session = { ...session, ...r.body };
  r = await call('GET', '/users', { token: session.accessToken });
  check('con el token refrescado ya no es PASSWORD_CHANGE_REQUIRED: 403 sin código por falta de manage_users', r.status === 403 && code(r) === undefined, `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: oldRefresh } });
  check('reusar el refresh anterior → 401 REFRESH_TOKEN_REUSED (cierra todas las sesiones)', r.status === 401 && code(r) === 'REFRESH_TOKEN_REUSED', `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: 'no-existe' } });
  check('refresh desconocido → 401 INVALID_REFRESH_TOKEN', r.status === 401 && code(r) === 'INVALID_REFRESH_TOKEN', `${r.status} ${j(r.body)}`);

  // ---------- Bloqueo por intentos fallidos + unlock ----------
  section('Bloqueo (5 intentos) · mensaje del 423 · lockedUntil · unlock');
  let last;
  for (let i = 1; i <= 5; i++) last = await call('POST', '/auth/login', { body: { username: email, password: `mala-${i}` } });
  check('el 5.º intento fallido bloquea la cuenta (423 ACCOUNT_LOCKED)', last.status === 423 && code(last) === 'ACCOUNT_LOCKED', `${last.status} ${j(last.body)}`);
  r = await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  check('con la contraseña correcta sigue 423 mientras dure el bloqueo', r.status === 423 && code(r) === 'ACCOUNT_LOCKED');
  const msg = r.body?.error ?? '';
  check('el mensaje del back indica los minutos restantes (el front lo muestra tal cual)', /\d+\s*min/i.test(msg), `mensaje: "${msg}"`);
  log.push(`       mensaje 423: "${msg}"`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('detalle: status LOCKED, failedLoginAttempts ≥ 5 y lockedUntil con fecha', r.body?.status === 'LOCKED' && r.body.failedLoginAttempts >= 5 && typeof r.body.lockedUntil === 'string', j({ s: r.body?.status, f: r.body?.failedLoginAttempts, l: r.body?.lockedUntil }));
  const lockedUntil = new Date(r.body?.lockedUntil).getTime();
  check('lockedUntil ≈ 2 h en el futuro', lockedUntil - Date.now() > 100 * 60_000 && lockedUntil - Date.now() <= 121 * 60_000);
  r = await call('PATCH', `/users/${userId}/unlock`, { token: T });
  check('PATCH /users/{id}/unlock → 200 con status ACTIVE', r.status === 200 && r.body?.status === 'ACTIVE', `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('tras unlock: 0 intentos y lockedUntil null', r.body?.failedLoginAttempts === 0 && r.body?.lockedUntil === null);
  r = await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  check('login correcto tras desbloquear → 200', r.status === 200);
  session = r.body;
  r = await call('GET', `/users/${userId}`, { token: T });
  check('detalle: activeSessions ≥ 1 tras iniciar sesión', r.body?.activeSessions >= 1, `activeSessions ${r.body?.activeSessions}`);
  r = await call('PATCH', `/users/${userId}/unlock`, { token: session.accessToken });
  check('unlock sin manage_users → 403 sin código', r.status === 403 && code(r) === undefined, `${r.status} ${j(r.body)}`);

  // ---------- PATCH /users/{id} ----------
  section('PATCH /users/{id} (subsidiariaIds / ubicacionIds)');
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { phone: '3009998888', subsidiariaIds: [1], ubicacionIds: [1, 2, 3] } });
  check('PATCH con listas → 200 y el resumen refleja 3 ubicaciones', r.status === 200 && r.body?.ubicaciones?.length === 3, `${r.status} ${j(r.body?.ubicaciones)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('detalle persiste ubicaciones [1,2,3], subsidiaria [1] y phone', r.body?.ubicaciones?.length === 3 && r.body?.subsidiarias?.length === 1 && r.body?.phone === '3009998888');
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { employeeCode: `EMP-${stamp}` } });
  r = await call('GET', `/users/${userId}`, { token: T });
  check('omitir las listas no las toca (siguen 3 ubicaciones)', r.body?.ubicaciones?.length === 3 && r.body?.employeeCode === `EMP-${stamp}`);
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { ubicacionIds: [2] } });
  check('lista de 1 reemplaza la actual', r.status === 200 && r.body?.ubicaciones?.length === 1 && r.body.ubicaciones[0].id === 2);
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { ubicacionIds: [9999] } });
  check('id de ubicación inexistente → 400 INVALID_LOCATION', r.status === 400 && code(r) === 'INVALID_LOCATION', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { email: ADMIN.username } });
  check('correo ya usado → 409 EMAIL_ALREADY_REGISTERED', r.status === 409 && code(r) === 'EMAIL_ALREADY_REGISTERED', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', '/users/999999', { token: T, body: { phone: '1' } });
  check('usuario inexistente → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND');

  // ---------- GET /catalogs/* (Core) + PATCH con cargo/puesto/departamento/área ----------
  section('GET /catalogs/* (Core) + PATCH /users/{id} con cargoIds/puestoIds/departamentoIds/areaIds');
  const catalogs = {};
  for (const kind of ['subsidiarias', 'ubicaciones', 'cargos', 'puestos', 'departamentos', 'areas']) {
    r = await call('GET', `/catalogs/${kind}`, { token: T });
    const ok = r.status === 200 && Array.isArray(r.body) && r.body.every((o) => typeof o.id === 'number' && typeof o.nombre === 'string');
    check(`GET /catalogs/${kind} → 200 con [{ id, nombre }] (${Array.isArray(r.body) ? r.body.length : '?'} opciones)`, ok, `${r.status} ${j(r.body)}`);
    catalogs[kind] = Array.isArray(r.body) ? r.body : [];
  }
  check('ubicaciones traen subsidiariaId', catalogs.ubicaciones.every((u) => typeof u.subsidiariaId === 'number'));
  r = await call('GET', '/catalogs/cargos');
  check('GET /catalogs/cargos sin token → 401', r.status === 401, `${r.status}`);
  r = await call('GET', '/catalogs/cargos', { token: session.accessToken });
  check('basta una sesión (sin manage_users) → 200', r.status === 200, `${r.status}`);
  const orgKinds = [['cargos', 'cargoIds'], ['puestos', 'puestoIds'], ['departamentos', 'departamentoIds'], ['areas', 'areaIds']];
  const orgBody = Object.fromEntries(orgKinds.map(([kind, field]) => [field, catalogs[kind].slice(0, 2).map((o) => o.id)]));
  r = await call('PATCH', `/users/${userId}`, { token: T, body: orgBody });
  check('PATCH con las 4 listas → 200', r.status === 200, `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('detalle trae cargos/puestos/departamentos/areas como { id, nombre } con lo enviado',
    orgKinds.every(([kind, field]) => Array.isArray(r.body?.[kind]) && r.body[kind].map((o) => o.id).sort().join() === [...orgBody[field]].sort().join()),
    j(Object.fromEntries(orgKinds.map(([kind]) => [kind, r.body?.[kind]]))));
  check('el detalle ya no trae department/area/jobTitle', !('department' in (r.body ?? {})) && !('jobTitle' in (r.body ?? {})));
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { cargoIds: [999999] } });
  check('cargo inexistente → 400 INVALID_CATALOG_ITEM', r.status === 400 && code(r) === 'INVALID_CATALOG_ITEM', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}`, { token: T, body: { cargoIds: [], puestoIds: [], departamentoIds: [], areaIds: [] } });
  r = await call('GET', `/users/${userId}`, { token: T });
  check('listas vacías quitan la organización', orgKinds.every(([kind]) => r.body?.[kind]?.length === 0));

  // ---------- PATCH /users/{id}/status ----------
  section('PATCH /users/{id}/status');
  r = await call('PATCH', `/users/${userId}/status`, { token: T, body: { status: 'inactive' } });
  check('inactive → 200 INACTIVE', r.status === 200 && r.body?.status === 'INACTIVE', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}/status`, { token: T, body: { status: 'blocked' } });
  check('blocked → 200 LOCKED (bloqueo manual)', r.status === 200 && r.body?.status === 'LOCKED');
  r = await call('GET', `/users/${userId}`, { token: T });
  check('bloqueo manual → lockedUntil null (no vence solo)', r.body?.status === 'LOCKED' && r.body?.lockedUntil === null);
  r = await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  check('login con bloqueo manual → 423 ACCOUNT_LOCKED', r.status === 423 && code(r) === 'ACCOUNT_LOCKED');
  r = await call('PATCH', `/users/${userId}/status`, { token: T, body: { status: 'active' } });
  check('active → 200 ACTIVE (también desbloquea)', r.status === 200 && r.body?.status === 'ACTIVE');
  r = await call('PATCH', `/users/${userId}/status`, { token: T, body: { status: 'raro' } });
  check('estado inválido → 400 INVALID_USER_STATUS', r.status === 400 && code(r) === 'INVALID_USER_STATUS', `${r.status} ${j(r.body)}`);

  // ---------- POST /users/{id}/verify-email ----------
  section('POST /users/{id}/verify-email');
  r = await call('POST', `/users/${userId}/verify-email`, { token: T });
  check('verify-email → 200 emailVerified true', r.status === 200 && r.body?.emailVerified === true, `${r.status} ${j(r.body)}`);
  r = await call('POST', '/users/999999/verify-email', { token: T });
  check('usuario inexistente → 404', r.status === 404);

  // ---------- Permisos (403 sin código) y token ----------
  section('Autorización por permiso y token');
  r = await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  session = r.body;
  r = await call('GET', '/users', { token: session.accessToken });
  check('GET /users sin manage_users → 403 sin código (el front muestra "sin permiso")', r.status === 403 && code(r) === undefined, `${r.status} ${r.text.slice(0, 100)}`);
  r = await call('GET', '/users', {});
  check('sin token → 401 (formato Spring, sin code)', r.status === 401 && code(r) === undefined);
  r = await call('GET', '/users', { token: 'basura.basura.basura' });
  check('token inválido → 401', r.status === 401);

  // ---------- Logout ----------
  section('POST /auth/logout');
  r = await call('POST', '/auth/logout', { body: { refreshToken: session.refreshToken } });
  check('logout → 200', r.status === 200, `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: session.refreshToken } });
  check('el refresh token cerrado ya no sirve (401)', r.status === 401, `${r.status} ${j(r.body)}`);
  log.push(`       código observado: ${code(r)}`);

  // ---------- GET /roles y GET /permissions ----------
  section('GET /roles · GET /permissions (catálogos que alimentan todas las listas del portal)');
  r = await call('GET', '/roles', { token: T });
  check('GET /roles → 200 con code, name y defaultPermissions', r.status === 200 && Array.isArray(r.body) && r.body.length >= 5 && r.body.every((x) => x.code && x.name && Array.isArray(x.defaultPermissions)), `${r.status}`);
  const roleCodes = (r.body ?? []).map((x) => x.code);
  check('trae los 5 roles (ADMIN, ALTAS, CONTABILIDAD, TESORERIA, COSTOS)', ['ADMIN', 'ALTAS', 'CONTABILIDAD', 'TESORERIA', 'COSTOS'].every((c) => roleCodes.includes(c)), j(roleCodes));
  log.push(`       roles: ${(r.body ?? []).map((x) => x.code + '=' + x.defaultPermissions.length).join(', ')}`);
  r = await call('GET', '/permissions', { token: T });
  check('GET /permissions → 200 con code, description y module', r.status === 200 && Array.isArray(r.body) && r.body.length >= 9 && r.body.every((x) => x.code && x.description && x.module), `${r.status}`);
  const permCodes = (r.body ?? []).map((x) => x.code);
  check('incluye los permisos que usa el front (manage_users, manage_roles, view_audit_log, view_catalogs)', ['manage_users', 'manage_roles', 'view_audit_log', 'view_catalogs'].every((c) => permCodes.includes(c)), j(permCodes));
  log.push(`       permisos (${permCodes.length}): ${permCodes.join(', ')}`);
  r = await call('GET', '/roles', { token: session.accessToken });
  check('GET /roles sin manage_users/manage_roles → 403 sin código (el front no lo pide: AccessCatalogService.canLoad)', r.status === 403 && code(r) === undefined, `${r.status}`);
  r = await call('GET', '/permissions', { token: session.accessToken });
  check('GET /permissions sin permiso → 403', r.status === 403);
  r = await call('GET', '/roles');
  check('GET /roles sin token → 401', r.status === 401);

  // ---------- PATCH /users/{id}/roles ----------
  section('PATCH /users/{id}/roles');
  const tesoDefaults = ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports'];
  r = await call('PATCH', `/users/${userId}/roles`, { token: T, body: { roleIds: ['TESORERIA'], permissions: tesoDefaults } });
  check('cambio de rol + permisos finales → 200 con roles y permisos nuevos', r.status === 200 && j(r.body?.roles) === '["TESORERIA"]' && tesoDefaults.every((p) => r.body.permissions.includes(p)) && r.body.permissions.length === tesoDefaults.length, `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('el detalle persiste roles y permisos', j(r.body?.roles) === '["TESORERIA"]' && r.body.permissions.length === tesoDefaults.length);
  r = await call('PATCH', `/users/${userId}/roles`, { token: T, body: { permissions: ['view_dashboard', 'view_catalogs'] } });
  check('solo permisos (sin roleIds) → 200, el rol no cambia', r.status === 200 && j(r.body?.roles) === '["TESORERIA"]' && r.body.permissions.length === 2 && r.body.permissions.includes('view_catalogs'), `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}/roles`, { token: T, body: { roleIds: ['CONTABILIDAD', 'COSTOS'] } });
  check('solo roles (sin permissions) → 200 con varios roles y permisos intactos', r.status === 200 && r.body?.roles?.length === 2 && r.body.permissions.length === 2, `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}/roles`, { token: T, body: { roleIds: ['NO_EXISTE'] } });
  check('rol inexistente → 400 INVALID_ROLE', r.status === 400 && code(r) === 'INVALID_ROLE', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}/roles`, { token: T, body: { permissions: ['no_existe'] } });
  check('permiso inexistente → 400 INVALID_PERMISSION', r.status === 400 && code(r) === 'INVALID_PERMISSION', `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('un rechazo no guarda nada (siguen 2 roles y 2 permisos)', r.body?.roles?.length === 2 && r.body.permissions.length === 2);
  r = await call('PATCH', '/users/999999/roles', { token: T, body: { permissions: [] } });
  check('usuario inexistente → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}/roles`, { token: T, body: { permissions: [] } });
  check('lista vacía de permisos los quita todos', r.status === 200 && r.body?.permissions?.length === 0);

  // Un actor con manage_users pero SIN manage_roles: permisos sí, roles no (ROLE_ASSIGNMENT_FORBIDDEN)
  const actorEmail = `prueba.actor.${stamp}@conciliacion.mx`;
  r = await call('POST', '/users', { token: T, body: { firstName: 'Actor', lastName: 'Sinroles', email: actorEmail, phone: null, supervisorId: null, subsidiariaIds: [1], ubicacionIds: [1], roleIds: ['CONTABILIDAD'], status: 'active' } });
  const actorId = r.body?.id;
  const actorTemp = r.body?.temporaryPassword;
  r = await call('PATCH', `/users/${actorId}/roles`, { token: T, body: { permissions: ['manage_users'] } });
  check('se le otorga solo manage_users', r.status === 200 && j(r.body?.permissions) === '["manage_users"]', `${r.status} ${j(r.body)}`);
  r = await call('POST', '/auth/login', { body: { username: actorEmail, password: actorTemp } });
  let actor = r.body;
  await call('POST', '/auth/change-password', { token: actor.accessToken, body: { currentPassword: actorTemp, newPassword: 'NuevaClave2026x' } });
  r = await call('POST', '/auth/refresh', { body: { refreshToken: actor.refreshToken } });
  actor = r.body;
  r = await call('PATCH', `/users/${userId}/roles`, { token: actor.accessToken, body: { roleIds: ['COSTOS'] } });
  check('cambiar roles sin manage_roles → 403 ROLE_ASSIGNMENT_FORBIDDEN', r.status === 403 && code(r) === 'ROLE_ASSIGNMENT_FORBIDDEN', `${r.status} ${j(r.body)}`);
  r = await call('PATCH', `/users/${userId}/roles`, { token: actor.accessToken, body: { permissions: ['view_dashboard'] } });
  check('editar SOLO permisos sin manage_roles → también 403 ROLE_ASSIGNMENT_FORBIDDEN (el endpoint entero exige manage_roles; el front deshabilita la sección)', r.status === 403 && code(r) === 'ROLE_ASSIGNMENT_FORBIDDEN', `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('el rechazo no cambió nada (sigue sin permisos)', r.body?.permissions?.length === 0);

  // El propio usuario ve sus permisos nuevos con refresh + /auth/me (lo que hace AuthService.renewSession)
  r = await call('PATCH', `/users/${actorId}/roles`, { token: T, body: { permissions: ['manage_users', 'view_audit_log'] } });
  r = await call('POST', '/auth/refresh', { body: { refreshToken: actor.refreshToken } });
  actor = r.body;
  check('renewSession: el JWT refrescado ya trae los permisos nuevos', claims(actor.accessToken).permissions?.includes('view_audit_log') === true, j(claims(actor.accessToken).permissions));
  r = await call('GET', '/auth/me', { token: actor.accessToken });
  check('renewSession: /auth/me devuelve los permisos nuevos', r.status === 200 && r.body?.permissions?.includes('view_audit_log') === true);

  // ---------- POST /users/{id}/close-sessions ----------
  section('POST /users/{id}/close-sessions');
  const s1 = (await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } })).body;
  await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  r = await call('GET', `/users/${userId}`, { token: T });
  const sessionsBefore = r.body?.activeSessions;
  check('antes: activeSessions ≥ 2 (dos inicios de sesión)', sessionsBefore >= 2, `activeSessions ${sessionsBefore}`);
  r = await call('POST', `/users/${userId}/close-sessions`, { token: T });
  check('close-sessions → 200 { id, activeSessions: 0 }', r.status === 200 && r.body?.id === userId && r.body?.activeSessions === 0, `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check(`el detalle confirma activeSessions 0 (había ${sessionsBefore})`, r.body?.activeSessions === 0);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: s1.refreshToken } });
  check('los refresh tokens de esas sesiones ya no sirven (401)', r.status === 401, `${r.status} ${code(r)}`);
  r = await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  check('la persona puede volver a iniciar sesión', r.status === 200);
  r = await call('POST', `/users/${userId}/close-sessions`, { token: actor.accessToken });
  check('close-sessions con manage_users (sin manage_roles) → 200', r.status === 200, `${r.status} ${j(r.body)}`);
  r = await call('POST', `/users/${userId}/close-sessions`, { token: session.accessToken });
  check('close-sessions sin permiso → 403 sin código', r.status === 403 && code(r) === undefined, `${r.status}`);
  r = await call('POST', '/users/999999/close-sessions', { token: T });
  check('usuario inexistente → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND', `${r.status} ${j(r.body)}`);

  // ---------- POST /users/{id}/reset-password ----------
  section('POST /users/{id}/reset-password');
  await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  r = await call('GET', `/users/${userId}`, { token: T });
  check('antes: la persona tiene sesiones activas y ya cambió su contraseña', r.body?.activeSessions >= 1 && r.body?.mustChangePassword === false, j({ s: r.body?.activeSessions, m: r.body?.mustChangePassword }));
  r = await call('POST', `/users/${userId}/reset-password`, { token: T });
  check('reset → 200 { id, temporaryPassword }', r.status === 200 && r.body?.id === userId && typeof r.body?.temporaryPassword === 'string', `${r.status} ${j(r.body)}`);
  const resetTemp = r.body?.temporaryPassword;
  check('la temporal sigue la regla NOMBRE+PRIMER APELLIDO+AÑO (mayúsculas, sin acentos)', /^PRUEBAENDPOINTS\d{4}$/.test(resetTemp ?? ''), resetTemp);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('detalle: mustChangePassword true, sesiones en 0 y la temporal consultable', r.body?.mustChangePassword === true && r.body?.activeSessions === 0 && r.body?.temporaryPassword === resetTemp, j({ m: r.body?.mustChangePassword, s: r.body?.activeSessions, t: r.body?.temporaryPassword }));
  r = await call('POST', '/auth/login', { body: { username: email, password: 'NuevaClave2026x' } });
  check('la contraseña anterior ya no sirve → 401', r.status === 401, `${r.status}`);
  r = await call('POST', '/auth/login', { body: { username: email, password: resetTemp } });
  check('login con la temporal nueva → mustChangePassword true', r.status === 200 && r.body?.user?.mustChangePassword === true);
  r = await call('POST', '/users/999999/reset-password', { token: T });
  check('usuario inexistente → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND', `${r.status} ${j(r.body)}`);
  r = await call('POST', `/users/${userId}/reset-password`, { token: session.accessToken });
  check('sin manage_users → 403 sin código', r.status === 403 && code(r) === undefined, `${r.status}`);

  // ---------- GET /users/{id}/audit-log y GET /audit-log ----------
  section('GET /users/{id}/audit-log · GET /audit-log (bitácora)');
  r = await call('GET', `/users/${userId}/audit-log?page=0&size=100`, { token: T });
  check('historial de una persona → 200 paginado { content, page, size, totalElements, totalPages }', r.status === 200 && Array.isArray(r.body?.content) && r.body.totalElements >= 5 && r.body.size === 100, `${r.status} ${j(r.body && Object.keys(r.body))}`);
  const mine = r.body?.content ?? [];
  const actions = new Set(mine.map((e) => e.action));
  const expected = ['created', 'updated', 'role_changed', 'permissions_changed', 'status_changed', 'locked', 'unlocked', 'email_verified', 'sessions_closed', 'password_reset'];
  check('registra las acciones que hicieron las pruebas anteriores', expected.every((a) => actions.has(a)), `faltan: ${expected.filter((a) => !actions.has(a)).join(', ')}`);
  log.push(`       acciones vistas: ${[...actions].join(', ')}`);
  check('cada entrada trae id, actor, target, action, detail y createdAt', mine.every((e) => e.id && 'actor' in e && e.target?.id === userId && e.action && 'detail' in e && e.createdAt));
  check('orden: de la más reciente a la más antigua', mine.every((e, i) => i === 0 || new Date(mine[i - 1].createdAt) >= new Date(e.createdAt)));
  check('el bloqueo automático (locked) no tiene actor (null = Sistema)', mine.filter((e) => e.action === 'locked').every((e) => e.actor === null));
  check('el desbloqueo manual (unlocked) sí trae el actor administrador', mine.some((e) => e.action === 'unlocked' && e.actor?.id === admin.user.id));
  r = await call('GET', `/users/${userId}/audit-log?action=role_changed`, { token: T });
  check('filtro action=role_changed → solo esa acción', r.status === 200 && r.body.content.length >= 1 && r.body.content.every((e) => e.action === 'role_changed'));
  r = await call('GET', `/users/${userId}/audit-log?page=0&size=2`, { token: T });
  check('paginación size=2 → 2 filas y totalPages > 1', r.body?.content?.length === 2 && r.body.totalPages > 1, `totalPages ${r.body?.totalPages}`);
  const p0 = r.body?.content?.map((e) => e.id) ?? [];
  r = await call('GET', `/users/${userId}/audit-log?page=1&size=2`, { token: T });
  check('la página 1 trae otras entradas (sin repetir las de la página 0)', r.body?.content?.length >= 1 && r.body.content.every((e) => !p0.includes(e.id)));
  r = await call('GET', '/users/999999/audit-log', { token: T });
  check('persona que nunca existió → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND', `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}/audit-log`, { token: session.accessToken });
  check('sin view_audit_log → 403 sin código', r.status === 403 && code(r) === undefined, `${r.status}`);
  r = await call('GET', `/users/${userId}/audit-log`, { token: actor.accessToken });
  check('view_audit_log SIN manage_roles → 200 (permiso independiente)', r.status === 200, `${r.status}`);

  r = await call('GET', '/audit-log?page=0&size=5', { token: T });
  check('historial global → 200 paginado y ordenado', r.status === 200 && r.body?.content?.length === 5 && r.body.totalElements > 5, `${r.status} total ${r.body?.totalElements}`);
  r = await call('GET', `/audit-log?userId=${userId}&size=100`, { token: T });
  check('filtro userId → solo esa persona', r.status === 200 && r.body.content.length >= 5 && r.body.content.every((e) => e.target.id === userId));
  r = await call('GET', '/audit-log?action=password_reset&size=100', { token: T });
  check('filtro action=password_reset → solo esa acción', r.status === 200 && r.body.content.length >= 1 && r.body.content.every((e) => e.action === 'password_reset'));
  r = await call('GET', '/audit-log?search=Sinroles&size=100', { token: T });
  check('search por nombre de la persona afectada (insensible a mayúsculas)', r.status === 200 && r.body.content.length >= 1 && r.body.content.every((e) => /sinroles/i.test(e.target.displayName + (e.actor?.displayName ?? '') + (e.detail ?? ''))));
  r = await call('GET', `/audit-log?search=${encodeURIComponent('Administrador Principal')}&userId=${userId}&size=100`, { token: T });
  check('search por el nombre de quien actuó (+ userId)', r.status === 200 && r.body.content.length >= 1 && r.body.content.every((e) => e.target.id === userId));
  r = await call('GET', '/audit-log?search=zzz-no-existe-zzz', { token: T });
  check('search sin coincidencias → 200 con content vacío', r.status === 200 && r.body.content.length === 0 && r.body.totalElements === 0);
  r = await call('GET', '/audit-log', { token: session.accessToken });
  check('sin view_audit_log → 403 sin código', r.status === 403 && code(r) === undefined, `${r.status}`);
  r = await call('GET', '/audit-log');
  check('sin token → 401', r.status === 401);

  // ---------- DELETE /users/{id} ----------
  section('DELETE /users/{id} (baja lógica)');
  const delEmail = `prueba.baja.${stamp}@conciliacion.mx`;
  const mkDel = () => call('POST', '/users', { token: T, body: { firstName: 'Prueba', lastName: 'Baja', email: delEmail, phone: null, supervisorId: null, subsidiariaIds: [1], ubicacionIds: [1], roleIds: ['CONTABILIDAD'], status: 'active' } });
  r = await mkDel();
  const delId = r.body?.id;
  const delTemp = r.body?.temporaryPassword;
  await call('POST', '/auth/login', { body: { username: delEmail, password: delTemp } });
  r = await call('DELETE', `/users/${delId}`, { token: T });
  check('DELETE → 200 { success: true, id }', r.status === 200 && r.body?.success === true && r.body?.id === delId, `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${delId}`, { token: T });
  check('el detalle ya no existe → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND');
  r = await call('GET', '/users?size=100', { token: T });
  check('desaparece del listado', r.body?.content?.every((u) => u.id !== delId));
  r = await call('POST', '/auth/login', { body: { username: delEmail, password: delTemp } });
  check('ya no puede iniciar sesión → 401', r.status === 401, `${r.status}`);
  r = await call('GET', `/users/${delId}/audit-log`, { token: T });
  check('su historial se conserva y trae la acción deleted', r.status === 200 && r.body.content.some((e) => e.action === 'deleted' && e.actor?.id === admin.user.id), `${r.status}`);
  r = await call('GET', `/audit-log?userId=${delId}`, { token: T });
  check('también en el historial global', r.status === 200 && r.body.content.some((e) => e.action === 'deleted'));
  r = await call('DELETE', `/users/${delId}`, { token: T });
  check('borrar de nuevo → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND', `${r.status} ${j(r.body)}`);
  r = await mkDel();
  check('su correo queda libre: se puede dar de alta de nuevo → 201', r.status === 201, `${r.status} ${j(r.body)}`);
  const delId2 = r.body?.id;
  r = await call('DELETE', `/users/${admin.user.id}`, { token: T });
  check('un administrador no puede darse de baja a sí mismo → 409 CANNOT_DELETE_SELF', r.status === 409 && code(r) === 'CANNOT_DELETE_SELF', `${r.status} ${j(r.body)}`);
  r = await call('DELETE', `/users/${delId2}`, { token: session.accessToken });
  check('sin manage_users → 403 sin código', r.status === 403 && code(r) === undefined, `${r.status}`);
  r = await call('DELETE', '/users/999999', { token: T });
  check('id inexistente → 404 USER_NOT_FOUND', r.status === 404 && code(r) === 'USER_NOT_FOUND');
  r = await call('DELETE', `/users/${delId2}`, { token: T });
  check('limpieza de la cuenta recreada → 200', r.status === 200);

  // ---------- Limpieza ----------
  section('Limpieza');
  r = await call('DELETE', `/users/${userId}`, { token: T });
  check('DELETE /users/{id} (baja lógica de la cuenta de prueba) → 200', r.status === 200, `${r.status} ${j(r.body)}`);
  r = await call('GET', `/users/${userId}`, { token: T });
  check('la cuenta de prueba ya no existe → 404', r.status === 404);
  r = await call('DELETE', `/users/${actorId}`, { token: T });
  check('DELETE de la segunda cuenta de prueba → 200', r.status === 200, `${r.status}`);
}

try {
  await main();
} catch (e) {
  failures.push(`excepción: ${e.message}`);
  log.push(`\n  EXCEPCIÓN ${e.stack}`);
}
console.log(`Gateway: ${BASE}${log.join('\n')}\n\nResultado: ${pass} ok, ${failures.length} fallas`);
if (failures.length) { console.log('Fallas:\n - ' + failures.join('\n - ')); process.exit(1); }
