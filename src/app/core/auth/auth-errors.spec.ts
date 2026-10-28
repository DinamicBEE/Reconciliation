import { HttpErrorResponse } from '@angular/common/http';
import {
  ERROR_CODE_MESSAGES,
  backendErrorMessage,
  extractErrorCode,
  isSessionIdleTimeout,
  serverErrorText,
} from './auth-errors';

describe('auth-errors', () => {
  describe('extractErrorCode', () => {
    it('devuelve el code del cuerpo del error', () => {
      expect(extractErrorCode({ status: 423, error: { error: 'Bloqueado', code: 'ACCOUNT_LOCKED' } })).toBe(
        'ACCOUNT_LOCKED',
      );
    });

    it('funciona con una HttpErrorResponse real', () => {
      const err = new HttpErrorResponse({ status: 401, error: { error: 'x', code: 'INVALID_CREDENTIALS' } });
      expect(extractErrorCode(err)).toBe('INVALID_CREDENTIALS');
    });

    it('devuelve null si no hay code, cuerpo o error', () => {
      expect(extractErrorCode({ status: 500, error: { error: 'x' } })).toBeNull();
      expect(extractErrorCode({ status: 0, error: null })).toBeNull();
      expect(extractErrorCode(null)).toBeNull();
      expect(extractErrorCode(undefined)).toBeNull();
    });
  });

  describe('serverErrorText', () => {
    it('devuelve el texto del backend tal cual', () => {
      const text = 'Cuenta bloqueada. Intenta de nuevo en 118 minutos.';
      expect(serverErrorText({ status: 423, error: { error: text, code: 'ACCOUNT_LOCKED' } })).toBe(text);
    });

    it('devuelve null si el texto está vacío, en blanco o no es string', () => {
      expect(serverErrorText({ status: 423, error: { error: '' } })).toBeNull();
      expect(serverErrorText({ status: 423, error: { error: '   ' } })).toBeNull();
      expect(serverErrorText({ status: 423, error: { error: 42 } })).toBeNull();
      expect(serverErrorText({ status: 0, error: null })).toBeNull();
      expect(serverErrorText(null)).toBeNull();
    });
  });

  describe('isSessionIdleTimeout', () => {
    it('es true solo con 401 + SESSION_IDLE_TIMEOUT', () => {
      expect(isSessionIdleTimeout({ status: 401, error: { error: 'x', code: 'SESSION_IDLE_TIMEOUT' } })).toBe(true);
    });

    it('es false con otro status o con otro code', () => {
      expect(isSessionIdleTimeout({ status: 403, error: { error: 'x', code: 'SESSION_IDLE_TIMEOUT' } })).toBe(false);
      expect(isSessionIdleTimeout({ status: 401, error: { error: 'x', code: 'INVALID_REFRESH_TOKEN' } })).toBe(false);
      expect(isSessionIdleTimeout({ status: 401, error: null })).toBe(false);
      expect(isSessionIdleTimeout(null)).toBe(false);
    });
  });

  describe('backendErrorMessage', () => {
    it('traduce un code conocido a su mensaje del catálogo', () => {
      expect(backendErrorMessage({ status: 409, error: { error: 'x', code: 'EMAIL_ALREADY_REGISTERED' } })).toBe(
        ERROR_CODE_MESSAGES['EMAIL_ALREADY_REGISTERED'],
      );
      expect(backendErrorMessage({ status: 401, error: { error: 'x', code: 'INVALID_CREDENTIALS' } })).toBe(
        'Usuario o contraseña inválidos.',
      );
    });

    it('devuelve null si el code no está en el catálogo', () => {
      expect(backendErrorMessage({ status: 400, error: { error: 'x', code: 'CODIGO_NUEVO' } })).toBeNull();
    });

    it('devuelve null si el error no trae code', () => {
      expect(backendErrorMessage({ status: 0, error: null })).toBeNull();
      expect(backendErrorMessage({ status: 500, error: { error: 'boom' } })).toBeNull();
    });
  });
});
