import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { MOCK_USERS } from './user-management-mock.data';
import { AppUser, MANAGER_PERMISSION, RoleId } from './user-management.model';
import { CreateUserInput, UserManagementService } from './user-management.service';
import { NewUserResult, UsersApiService } from './users-api.service';

function newUserResult(id: number, roles: RoleId[], permissions: string[]): NewUserResult {
  return {
    id,
    email: `persona${id}@conciliacion.mx`,
    displayName: `Persona ${id}`,
    roles,
    permissions,
    subsidiarias: [],
    ubicaciones: [],
    mustChangePassword: true,
    temporaryPassword: 'Temporal-123',
  };
}

function input(roleIds: RoleId[]): CreateUserInput {
  return {
    firstName: 'Persona',
    lastName: 'Nueva',
    email: 'persona@conciliacion.mx',
    phone: '',
    roleIds,
    status: 'active',
    subsidiariaIds: [],
    ubicacionIds: [],
    managerId: null,
  };
}

describe('UserManagementService · candidatos a responsable', () => {
  let service: UserManagementService;
  let usersApi: { createUser: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    usersApi = { createUser: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: signal(null), renewSession: vi.fn(() => of(null)) } },
        { provide: UsersApiService, useValue: usersApi },
      ],
    });
    service = TestBed.inject(UserManagementService);
  });

  const ids = (users: readonly AppUser[]) => users.map((u) => u.id);

  it('el permiso que habilita a un responsable es manage_users', () => {
    expect(MANAGER_PERMISSION).toBe('manage_users');
  });

  it('son exactamente los usuarios con el permiso manage_users, en el orden del registro', () => {
    const expected = MOCK_USERS.filter((u) => u.permissions.includes('manage_users'));

    expect(expected.length).toBeGreaterThan(0);
    expect(ids(service.managerCandidates())).toEqual(ids(expected));
  });

  it('incluye a quien tiene manage_users sin el rol ADMIN', () => {
    const withoutAdmin = service.managerCandidates().filter((u) => !u.roleIds.includes('ADMIN'));

    expect(withoutAdmin.length).toBeGreaterThan(0);
    for (const user of withoutAdmin) expect(user.permissions).toContain('manage_users');
  });

  it('excluye a quien no tiene manage_users, aunque tenga otros permisos', () => {
    const others = MOCK_USERS.filter((u) => !u.permissions.includes('manage_users'));

    expect(others.length).toBeGreaterThan(0);
    for (const user of others) expect(ids(service.managerCandidates())).not.toContain(user.id);
  });

  it('un rol con nombre de administrador no basta: decide el permiso que asigna el backend', () => {
    usersApi.createUser.mockReturnValue(of(newUserResult(900, ['ADMIN'], ['view_dashboard'])));

    let created: AppUser | undefined;
    service.createUser(input(['ADMIN'])).subscribe((u) => (created = u));

    expect(created!.roleIds).toEqual(['ADMIN']);
    expect(ids(service.managerCandidates())).not.toContain(created!.id);
  });

  it('un usuario nuevo con manage_users y un rol cualquiera se vuelve candidato', () => {
    usersApi.createUser.mockReturnValue(of(newUserResult(901, ['TESORERIA'], ['view_reconciliation', 'manage_users'])));

    let created: AppUser | undefined;
    service.createUser(input(['TESORERIA'])).subscribe((u) => (created = u));

    expect(service.managerCandidates()[0].id).toBe(created!.id);
  });
});
