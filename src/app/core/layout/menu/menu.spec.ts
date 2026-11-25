import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PermissionKey } from '../../../shared/models/access.model';
import { AccessControlService } from '../../auth/access-control.service';
import { AuthService } from '../../auth/auth.service';
import { MenuService } from '../../services/menu.service';
import { Menu } from './menu';

describe('Menu · enlace "Roles y permisos"', () => {
  let fixture: ComponentFixture<Menu>;
  let permissions: PermissionKey[];
  let hasRole: ReturnType<typeof vi.fn>;

  async function mount(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [Menu],
      providers: [
        provideRouter([]),
        // Doble del estado del menú: evita `localStorage` en las pruebas.
        { provide: MenuService, useValue: { expanded: signal(true), toggle: vi.fn() } },
        { provide: AuthService, useValue: { logout: vi.fn() } },
        {
          provide: AccessControlService,
          useValue: { hasPermission: (key: PermissionKey) => permissions.includes(key), hasRole },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Menu);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const rolesLink = (el: HTMLElement) => el.querySelector<HTMLAnchorElement>('a[href="/gestion-de-roles"]');

  beforeEach(() => {
    hasRole = vi.fn(() => false);
  });

  it('con manage_roles y sin el rol ADMIN muestra el enlace', async () => {
    permissions = ['manage_roles'];
    const el = await mount();

    expect(rolesLink(el)).not.toBeNull();
    expect(rolesLink(el)!.textContent).toContain('Roles y permisos');
    expect(hasRole).not.toHaveBeenCalled();
  });

  it('sin manage_roles no muestra el enlace aunque pueda administrar usuarios', async () => {
    permissions = ['manage_users'];
    const el = await mount();

    expect(rolesLink(el)).toBeNull();
  });

  it('sin permisos no muestra el enlace', async () => {
    permissions = [];
    hasRole.mockReturnValue(true); // aunque tuviera cualquier rol
    const el = await mount();

    expect(rolesLink(el)).toBeNull();
  });
});
