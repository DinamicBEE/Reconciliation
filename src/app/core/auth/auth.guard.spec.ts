import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AccessControlService } from './access-control.service';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  const isAuthenticated = signal(false);
  const mustChangePassword = signal(false);

  beforeEach(() => {
    isAuthenticated.set(false);
    mustChangePassword.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated } },
        { provide: AccessControlService, useValue: { mustChangePassword } },
      ],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/dashboard' } as RouterStateSnapshot),
    );
  }

  function serialize(result: unknown): string {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  it('redirige a /login cuando no hay sesión', () => {
    expect(serialize(runGuard())).toBe('/login');
  });

  it('redirige a /login sin sesión aunque la bandera de contraseña esté encendida', () => {
    mustChangePassword.set(true);
    expect(serialize(runGuard())).toBe('/login');
  });

  it('redirige a /cambiar-password con sesión y cambio obligatorio pendiente', () => {
    isAuthenticated.set(true);
    mustChangePassword.set(true);
    expect(serialize(runGuard())).toBe('/cambiar-password');
  });

  it('deja pasar con sesión y sin cambio de contraseña pendiente', () => {
    isAuthenticated.set(true);
    expect(runGuard()).toBe(true);
  });
});
