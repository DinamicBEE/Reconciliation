import { HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { defer, of, switchMap, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthMockBackend } from '../auth/auth-mock-backend';
import {
  MOCK_AREAS,
  MOCK_CARGOS,
  MOCK_DEPARTAMENTOS,
  MOCK_PUESTOS,
  MOCK_SUBSIDIARIAS,
  MOCK_UBICACIONES,
} from '../auth/auth-mock.data';
import { touchMockSessionActivity } from '../auth/mock-session-activity';
import {
  MOCK_RECONCILIATION_STATUS_OPTIONS,
  MOCK_TENDER_MEDIA_OPTIONS,
  captureMockSales,
  listMockSales,
} from './mock-sales-backend';

const LATENCY_MS = 250;

const ORG_CATALOGS: Record<string, unknown[]> = {
  subsidiarias: MOCK_SUBSIDIARIAS,
  ubicaciones: MOCK_UBICACIONES,
  cargos: MOCK_CARGOS,
  puestos: MOCK_PUESTOS,
  departamentos: MOCK_DEPARTAMENTOS,
  areas: MOCK_AREAS,
};

let backend: AuthMockBackend | null = null;
const mock = (): AuthMockBackend => (backend ??= new AuthMockBackend());

function numberParam(req: HttpRequest<unknown>, name: string): number | undefined {
  const value = req.params.get(name);
  return value === null || value === '' ? undefined : Number(value);
}

function stringParam(req: HttpRequest<unknown>, name: string): string | undefined {
  return req.params.get(name) || undefined;
}

function ok(body: unknown, status = 200): HttpResponse<unknown> {
  return new HttpResponse({ status, body });
}

const noContent = (): HttpResponse<unknown> => new HttpResponse({ status: 204, body: null });

// Atiende la petición con los mocks, o devuelve `undefined` si la ruta no está simulada.
function handle(req: HttpRequest<unknown>, path: string, token: string | null): (() => HttpResponse<unknown>) | undefined {
  const body = (req.body ?? {}) as Record<string, any>;
  const m = req.method;
  let match: RegExpMatchArray | null;

  // --- /auth ---------------------------------------------------------------
  if (m === 'POST' && path === '/auth/login') {
    return () => {
      const result = mock().login(body['username'], body['password']);
      touchMockSessionActivity();
      return ok(result);
    };
  }
  if (m === 'POST' && path === '/auth/refresh') return () => ok(mock().refresh(body['refreshToken']));
  if (m === 'POST' && path === '/auth/logout') return () => (mock().logout(body['refreshToken']), noContent());
  if (m === 'GET' && path === '/auth/me') return () => ok(mock().me(token));
  if (m === 'POST' && path === '/auth/change-password') {
    return () => (mock().changePassword(token, body['currentPassword'], body['newPassword']), noContent());
  }

  // --- /users ----------------------------------------------------------------
  if (path === '/users') {
    if (m === 'GET') {
      return () =>
        ok(
          mock().listUsers(token, {
            search: stringParam(req, 'search'),
            role: stringParam(req, 'role') as never,
            status: stringParam(req, 'status') as never,
            page: numberParam(req, 'page'),
            size: numberParam(req, 'size'),
          }),
        );
    }
    if (m === 'POST') return () => ok(mock().createUser(token, body as never), 201);
  }
  if ((match = path.match(/^\/users\/(\d+)(?:\/([a-z-]+))?$/))) {
    const id = Number(match[1]);
    const action = match[2];
    if (!action && m === 'GET') return () => ok(mock().getUser(token, id));
    if (!action && m === 'PATCH') return () => ok(mock().updateUser(token, id, body as never));
    if (!action && m === 'DELETE') return () => ok(mock().deleteUser(token, id));
    if (action === 'status' && m === 'PATCH') return () => ok(mock().changeStatus(token, id, body['status']));
    if (action === 'unlock' && m === 'PATCH') return () => ok(mock().unlockUser(token, id));
    if (action === 'roles' && m === 'PATCH') return () => ok(mock().updateUserRoles(token, id, body as never));
    if (action === 'verify-email' && m === 'POST') return () => ok(mock().verifyEmail(token, id));
    if (action === 'close-sessions' && m === 'POST') return () => ok(mock().closeSessions(token, id));
    if (action === 'reset-password' && m === 'POST') return () => ok(mock().resetPassword(token, id));
    if (action === 'audit-log' && m === 'GET') {
      return () =>
        ok(
          mock().listAuditLog(token, {
            userId: id,
            action: stringParam(req, 'action'),
            search: stringParam(req, 'search'),
            page: numberParam(req, 'page'),
            size: numberParam(req, 'size'),
          }),
        );
    }
  }

  // --- /audit-log, /roles, /permissions -------------------------------------
  if (m === 'GET' && path === '/audit-log') {
    return () =>
      ok(
        mock().listAuditLog(token, {
          userId: numberParam(req, 'userId'),
          action: stringParam(req, 'action'),
          search: stringParam(req, 'search'),
          page: numberParam(req, 'page'),
          size: numberParam(req, 'size'),
        }),
      );
  }
  if (m === 'GET' && path === '/permissions') return () => ok(mock().listPermissions(token));
  if (path === '/roles') {
    if (m === 'GET') return () => ok(mock().listRoles(token));
    if (m === 'POST') return () => ok(mock().createRole(token, body as never), 201);
  }
  if ((match = path.match(/^\/roles\/([^/]+)$/))) {
    const code = decodeURIComponent(match[1]);
    if (m === 'GET') return () => ok(mock().getRole(token, code));
    if (m === 'PATCH') return () => ok(mock().updateRole(token, code, body as never));
    if (m === 'DELETE') return () => (mock().deleteRole(token, code), noContent());
  }

  // --- /catalogs y /sales ----------------------------------------------------
  if (m === 'GET' && (match = path.match(/^\/catalogs\/([a-z]+)$/)) && ORG_CATALOGS[match[1]]) {
    const catalog = ORG_CATALOGS[match[1]];
    return () => ok(catalog);
  }
  if (m === 'GET' && path === '/sales/catalogs/tender-media') return () => ok(MOCK_TENDER_MEDIA_OPTIONS);
  if (m === 'GET' && path === '/sales/catalogs/reconciliation-statuses') return () => ok(MOCK_RECONCILIATION_STATUS_OPTIONS);
  if (m === 'GET' && path === '/sales') {
    return () =>
      ok(
        listMockSales({
          dateFrom: stringParam(req, 'dateFrom'),
          dateTo: stringParam(req, 'dateTo'),
          store: numberParam(req, 'store'),
          tenderMedia: numberParam(req, 'tenderMedia'),
          status: numberParam(req, 'status'),
          search: stringParam(req, 'search'),
          page: numberParam(req, 'page'),
          pageSize: numberParam(req, 'pageSize'),
        }),
      );
  }
  if (m === 'POST' && path === '/sales/capture') return () => ok(captureMockSales(body as never));

  return undefined;
}

/**
 * Simula el Gateway del backend con datos locales: todas las rutas que usa el portal responden sin red.
 *
 * @remarks Va después de `authTokenInterceptor`: lee el Bearer que ese interceptor agrega.
 * @see docs/codigo/mock-backend.md
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const path = req.url.slice(environment.apiUrl.length).split('?')[0];
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;

  const handler = handle(req, path, token);
  if (!handler) return next(req);

  // Cada petición autenticada cuenta como actividad de la sesión, como en el auth-service.
  if (token && path !== '/auth/refresh') touchMockSessionActivity();
  return timer(LATENCY_MS).pipe(switchMap(() => defer(() => of(handler()))));
};
