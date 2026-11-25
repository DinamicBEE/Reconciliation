import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PermissionKey } from '../../shared/models/access.model';
import { AccessControlService } from './access-control.service';
import { AuthService, AuthUser } from './auth.service';

describe('AccessControlService.homeRoute', () => {
  const currentUser = signal<AuthUser | null>(null);

  function withPermissions(permissions: PermissionKey[]): AccessControlService {
    currentUser.set({ permissions, roles: [] } as unknown as AuthUser);
    return TestBed.inject(AccessControlService);
  }

  beforeEach(() => {
    currentUser.set(null);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser } }],
    });
  });

  it('prioriza /dashboard con view_dashboard', () => {
    const access = withPermissions(['manage_users', 'view_reconciliation', 'view_dashboard']);
    expect(access.homeRoute()).toBe('/dashboard');
  });

  it('va a /conciliacion con view_reconciliation y sin view_dashboard', () => {
    const access = withPermissions(['manage_users', 'view_reconciliation']);
    expect(access.homeRoute()).toBe('/conciliacion');
  });

  it('va a /usuarios solo con manage_users', () => {
    const access = withPermissions(['manage_users']);
    expect(access.homeRoute()).toBe('/usuarios');
  });

  it('va a /catalogos si no tiene ninguno de los permisos de pantalla', () => {
    const access = withPermissions(['capture_sales']);
    expect(access.homeRoute()).toBe('/catalogos');
  });

  it('va a /catalogos (no a /login) sin permisos o sin usuario', () => {
    const access = withPermissions([]);
    expect(access.homeRoute()).toBe('/catalogos');
    currentUser.set(null);
    expect(access.homeRoute()).toBe('/catalogos');
  });
});
