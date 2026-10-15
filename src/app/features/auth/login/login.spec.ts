import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { ThemeService } from '../../../core/services/theme.service';
import { UserManagementService } from '../../user-management/data/user-management.service';
import { AccessControlService } from '../data/access-control.service';
import { SessionEndReason } from '../data/auth-errors';
import { AuthService, LoginResult } from '../data/auth.service';
import { Login } from './login';

const RESULT: LoginResult = {
  email: 'admin@conciliacion.mx',
  displayName: 'Admin',
  roles: ['ADMIN'],
  permissions: ['manage_users'],
  mustChangePassword: false,
  subsidiarias: [],
  ubicaciones: [],
  accessToken: 'a',
  refreshToken: 'r',
  expiresIn: 900,
} as LoginResult;

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let el: HTMLElement;
  const sessionEndReason = signal<SessionEndReason | null>(null);
  const mustChangePassword = signal(false);
  let auth: { login: ReturnType<typeof vi.fn>; completeLogin: ReturnType<typeof vi.fn>; sessionEndReason: typeof sessionEndReason };
  let access: { mustChangePassword: typeof mustChangePassword; homeRoute: ReturnType<typeof vi.fn> };
  let userMgmt: { findUserByEmail: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    sessionEndReason.set(null);
    mustChangePassword.set(false);
    auth = { login: vi.fn(), completeLogin: vi.fn(), sessionEndReason };
    access = { mustChangePassword, homeRoute: vi.fn(() => '/dashboard') };
    userMgmt = { findUserByEmail: vi.fn(() => null) };
    router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AccessControlService, useValue: access },
        { provide: UserManagementService, useValue: userMgmt },
        { provide: Router, useValue: router },
        { provide: ThemeService, useValue: { mode: signal('light'), toggle: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const usernameInput = () => el.querySelector<HTMLInputElement>('#username')!;
  const passwordInput = () => el.querySelector<HTMLInputElement>('#password')!;
  const submitButton = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const alert = () => el.querySelector('nz-alert');

  async function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function fillValid() {
    await type(usernameInput(), 'admin@conciliacion.mx');
    await type(passwordInput(), 'Conciliacion2026');
  }

  async function submit() {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  describe('renderizado', () => {
    it('muestra los campos de usuario y contraseña y el botón de envío', () => {
      expect(usernameInput()).not.toBeNull();
      expect(passwordInput()).not.toBeNull();
      expect(usernameInput().getAttribute('autocomplete')).toBe('username');
      expect(passwordInput().getAttribute('autocomplete')).toBe('current-password');
      expect(submitButton().textContent).toContain('Iniciar sesión');
    });

    it('la contraseña se muestra oculta por defecto', () => {
      expect(passwordInput().type).toBe('password');
    });

    it('no muestra ningún aviso al inicio', () => {
      expect(alert()).toBeNull();
    });
  });

  describe('validaciones', () => {
    it('el botón está deshabilitado con el formulario vacío', () => {
      expect(submitButton().disabled).toBe(true);
    });

    it('muestra los mensajes de longitud mínima', async () => {
      await type(usernameInput(), 'ab');
      await type(passwordInput(), '12345');
      expect(el.textContent).toContain('Debe tener al menos 3 caracteres.');
      expect(el.textContent).toContain('Debe tener al menos 6 caracteres.');
      expect(submitButton().disabled).toBe(true);
    });

    it('muestra los mensajes de campo requerido', async () => {
      await type(usernameInput(), 'abc');
      await type(usernameInput(), '');
      await type(passwordInput(), '123456');
      await type(passwordInput(), '');
      expect(el.textContent).toContain('Ingresa tu usuario.');
      expect(el.textContent).toContain('Ingresa tu contraseña.');
    });

    it('habilita el botón con datos válidos', async () => {
      await fillValid();
      expect(submitButton().disabled).toBe(false);
    });

    it('no llama al servicio si el formulario es inválido', async () => {
      await type(usernameInput(), 'ab');
      await submit();
      expect(auth.login).not.toHaveBeenCalled();
    });
  });

  describe('envío correcto', () => {
    it('llama a login con las credenciales, completa la sesión y navega a homeRoute', async () => {
      auth.login.mockReturnValue(of(RESULT));
      userMgmt.findUserByEmail.mockReturnValue({ id: 'u0001' });
      access.homeRoute.mockReturnValue('/usuarios');
      await fillValid();

      await submit();

      expect(auth.login).toHaveBeenCalledWith('admin@conciliacion.mx', 'Conciliacion2026');
      expect(userMgmt.findUserByEmail).toHaveBeenCalledWith('admin@conciliacion.mx');
      expect(auth.completeLogin).toHaveBeenCalledWith(RESULT, 'u0001');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/usuarios');
    });

    it('sin cuenta local vinculada completa la sesión con appUserId null', async () => {
      auth.login.mockReturnValue(of(RESULT));
      await fillValid();
      await submit();
      expect(auth.completeLogin).toHaveBeenCalledWith(RESULT, null);
    });

    it('con cambio de contraseña pendiente navega a /cambiar-password', async () => {
      auth.login.mockReturnValue(of(RESULT));
      auth.completeLogin.mockImplementation(() => mustChangePassword.set(true));
      await fillValid();

      await submit();

      expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/cambiar-password');
      expect(access.homeRoute).not.toHaveBeenCalled();
    });

    it('muestra el estado de carga mientras espera la respuesta', async () => {
      const response = new Subject<LoginResult>();
      auth.login.mockReturnValue(response);
      await fillValid();

      await submit();
      expect(submitButton().classList).toContain('ant-btn-loading');

      response.next(RESULT);
      response.complete();
      await fixture.whenStable();
      expect(submitButton().classList).not.toContain('ant-btn-loading');
    });
  });

  describe('errores', () => {
    async function failWith(error: HttpErrorResponse) {
      const response = new Subject<LoginResult>();
      auth.login.mockReturnValue(response);
      await fillValid();
      await submit();
      response.error(error);
      await fixture.whenStable();
    }

    it('401: muestra "Usuario o contraseña inválidos." y no navega', async () => {
      await failWith(new HttpErrorResponse({ status: 401, error: { error: 'x', code: 'INVALID_CREDENTIALS' } }));
      expect(alert()?.textContent).toContain('Usuario o contraseña inválidos.');
      expect(auth.completeLogin).not.toHaveBeenCalled();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(submitButton().classList).not.toContain('ant-btn-loading');
    });

    it('423: muestra el texto del backend (con los minutos restantes)', async () => {
      const text = 'Cuenta bloqueada. Intenta de nuevo en 118 minutos.';
      await failWith(new HttpErrorResponse({ status: 423, error: { error: text, code: 'ACCOUNT_LOCKED' } }));
      expect(alert()?.textContent).toContain(text);
    });

    it('423 sin texto: muestra el mensaje de bloqueo por defecto', async () => {
      await failWith(new HttpErrorResponse({ status: 423, error: null }));
      expect(alert()?.textContent).toContain('Usuario bloqueado por intentos fallidos. Contacte al administrador.');
    });

    it('ACCOUNT_LOCKED con otro status también se trata como bloqueo', async () => {
      await failWith(new HttpErrorResponse({ status: 401, error: { error: 'Bloqueada', code: 'ACCOUNT_LOCKED' } }));
      expect(alert()?.textContent).toContain('Bloqueada');
      expect(alert()?.textContent).not.toContain('Usuario o contraseña inválidos.');
    });

    it('sin conexión (status 0): muestra el mensaje de conexión', async () => {
      await failWith(new HttpErrorResponse({ status: 0, error: null }));
      expect(alert()?.textContent).toContain('No se pudo conectar con el servidor. Intenta de nuevo.');
    });

    it('un reintento exitoso limpia el error', async () => {
      await failWith(new HttpErrorResponse({ status: 401 }));
      expect(alert()).not.toBeNull();

      auth.login.mockReturnValue(of(RESULT));
      await submit();
      expect(alert()).toBeNull();
    });
  });

  describe('aviso de sesión cerrada', () => {
    it('muestra el aviso de inactividad', async () => {
      sessionEndReason.set('idle_timeout');
      await fixture.whenStable();
      expect(alert()?.textContent).toContain('Tu sesión se cerró por inactividad.');
    });

    it('muestra el aviso de token inválido', async () => {
      sessionEndReason.set('invalid_token');
      await fixture.whenStable();
      expect(alert()?.textContent).toContain('Tu sesión ya no es válida.');
    });

    it('un error de credenciales tiene prioridad sobre el aviso', async () => {
      sessionEndReason.set('idle_timeout');
      const response = new Subject<LoginResult>();
      auth.login.mockReturnValue(response);
      await fillValid();
      await submit();
      response.error(new HttpErrorResponse({ status: 401 }));
      await fixture.whenStable();

      const alerts = el.querySelectorAll('nz-alert');
      expect(alerts.length).toBe(1);
      expect(alerts[0].textContent).toContain('Usuario o contraseña inválidos.');
      expect(alerts[0].textContent).not.toContain('inactividad');
    });
  });
});
