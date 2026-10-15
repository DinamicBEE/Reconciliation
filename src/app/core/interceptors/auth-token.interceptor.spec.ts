import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../features/auth/data/auth.service';
import { authTokenInterceptor } from './auth-token.interceptor';

// `environment.apiUrl` es '' en el entorno de pruebas (rutas relativas).
describe('authTokenInterceptor', () => {
  const accessToken = signal<string | null>('token-123');
  let invalidateSession: ReturnType<typeof vi.fn>;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    accessToken.set('token-123');
    invalidateSession = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken, invalidateSession } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function expectError(url: string, status: number, body: object): { err: unknown } {
    const result: { err: unknown } = { err: undefined };
    http.get(url).subscribe({ error: (e) => (result.err = e) });
    httpMock.expectOne(url).flush(body, { status, statusText: 'Error' });
    return result;
  }

  it('agrega Authorization: Bearer cuando hay token', () => {
    http.get('/users').subscribe();
    const req = httpMock.expectOne('/users');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush([]);
  });

  it('no agrega el header cuando no hay token', () => {
    accessToken.set(null);
    http.get('/users').subscribe();
    const req = httpMock.expectOne('/users');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it.each(['/auth/login', '/auth/refresh', '/auth/logout'])('no agrega el header al endpoint público %s', (url) => {
    http.post(url, {}).subscribe();
    const req = httpMock.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('un 401 en una llamada autenticada invalida la sesión como invalid_token y propaga el error', () => {
    const result = expectError('/users', 401, { error: 'Token inválido' });
    expect(invalidateSession).toHaveBeenCalledWith('invalid_token');
    expect(result.err).toBeInstanceOf(HttpErrorResponse);
    expect((result.err as HttpErrorResponse).status).toBe(401);
  });

  it('un 401 con SESSION_IDLE_TIMEOUT invalida la sesión como idle_timeout', () => {
    expectError('/auth/me', 401, { error: 'Inactividad', code: 'SESSION_IDLE_TIMEOUT' });
    expect(invalidateSession).toHaveBeenCalledWith('idle_timeout');
  });

  it('un 401 con INVALID_CREDENTIALS no cierra la sesión (error de negocio)', () => {
    const result = expectError('/auth/change-password', 401, { error: 'x', code: 'INVALID_CREDENTIALS' });
    expect(invalidateSession).not.toHaveBeenCalled();
    expect((result.err as HttpErrorResponse).status).toBe(401);
  });

  it('errores distintos de 401 no tocan la sesión', () => {
    const result = expectError('/users', 500, { error: 'boom' });
    expect(invalidateSession).not.toHaveBeenCalled();
    expect((result.err as HttpErrorResponse).status).toBe(500);
  });

  it('un 401 de /auth/refresh no lo maneja el interceptor (lo maneja AuthService)', () => {
    const result: { err: unknown } = { err: undefined };
    http.post('/auth/refresh', {}).subscribe({ error: (e) => (result.err = e) });
    httpMock.expectOne('/auth/refresh').flush({ error: 'x' }, { status: 401, statusText: 'Unauthorized' });
    expect(invalidateSession).not.toHaveBeenCalled();
    expect((result.err as HttpErrorResponse).status).toBe(401);
  });
});
