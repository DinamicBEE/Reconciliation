import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AccessControlService } from './core/auth/access-control.service';
import { permissionGuard } from './core/auth/permission.guard';
import { routes } from './app.routes';
import { PermissionKey, RoleId } from './shared/models/access.model';

const ROLE_PATHS = ['gestion-de-roles', 'gestion-de-roles/nuevo', 'gestion-de-roles/:code'];

// Rutas hijas de Shell (`path: ''` con `children`).
const shellChildren = (): Route[] => routes.find((r) => r.path === '' && r.children)!.children!;
const childRoute = (path: string): Route => shellChildren().find((r) => r.path === path)!;

describe('app.routes · gestión de roles', () => {
  let permissions: PermissionKey[];
  let roles: RoleId[];

  beforeEach(() => {
    permissions = [];
    roles = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AccessControlService,
          useValue: {
            hasPermission: (key: PermissionKey) => permissions.includes(key),
            hasRole: (role: RoleId) => roles.includes(role),
            homeRoute: () => '/perfil',
          },
        },
      ],
    });
  });

  // Ejecuta el guard de la ruta con su `data`, como lo hace el router.
  const canActivate = (path: string) =>
    TestBed.runInInjectionContext(() =>
      permissionGuard({ data: childRoute(path).data ?? {} } as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  it.each(ROLE_PATHS)('"%s" exige manage_roles y ya no exige un rol', (path) => {
    const route = childRoute(path);

    expect(route).toBeDefined();
    expect(route.canActivate).toContain(permissionGuard);
    expect(route.data?.['permission']).toBe('manage_roles');
    expect(route.data && 'role' in route.data).toBe(false);
  });

  it.each(ROLE_PATHS)('"%s" deja entrar a quien tiene manage_roles sin el rol ADMIN', (path) => {
    permissions = ['manage_roles'];
    roles = ['ALTAS'];

    expect(canActivate(path)).toBe(true);
  });

  it.each(ROLE_PATHS)('"%s" rebota a la pantalla de inicio sin manage_roles, aunque tenga el rol ADMIN', (path) => {
    permissions = ['manage_users'];
    roles = ['ADMIN'];

    const result = canActivate(path);

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/perfil');
  });

  it('ninguna ruta de la aplicación depende de un rol', () => {
    const withRole = shellChildren().filter((r) => r.data && 'role' in r.data);

    expect(withRole.map((r) => r.path)).toEqual([]);
  });
});
