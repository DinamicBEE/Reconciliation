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

describe('Menu · tooltips de navegación', () => {
  const NAMES = ['Dashboard', 'Conciliación', 'Catálogos', 'Usuarios', 'Roles y permisos', 'Cerrar sesión'];
  const ALL: PermissionKey[] = ['view_dashboard', 'view_reconciliation', 'manage_users', 'manage_roles'];
  let fixture: ComponentFixture<Menu>;

  async function mount(expanded: boolean): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [Menu],
      providers: [
        provideRouter([]),
        { provide: MenuService, useValue: { expanded: signal(expanded), toggle: vi.fn() } },
        { provide: AuthService, useValue: { logout: vi.fn() } },
        {
          provide: AccessControlService,
          useValue: { hasPermission: (key: PermissionKey) => ALL.includes(key), hasRole: vi.fn(() => false) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Menu);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const items = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('.app-menu__link')).filter((e) =>
      NAMES.includes(e.getAttribute('aria-label') ?? ''),
    );

  async function hover(target: HTMLElement): Promise<string> {
    target.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((resolve) => setTimeout(resolve, 400)); // retardo de apertura de nz-tooltip
    fixture.detectChanges();
    return document.querySelector('.ant-tooltip')?.textContent?.trim() ?? '';
  }

  it('no usa el atributo title nativo', async () => {
    const el = await mount(false);

    expect(el.querySelectorAll('[title]').length).toBe(0);
  });

  it('cada enlace y el pie conservan su nombre accesible con aria-label', async () => {
    const el = await mount(false);

    expect(items(el).map((e) => e.getAttribute('aria-label'))).toEqual(NAMES);
  });

  it('contraído muestra el nombre de la pantalla en el tooltip al pasar el mouse', async () => {
    const el = await mount(false);

    expect(await hover(items(el)[0])).toBe('Dashboard');
  });

  it('expandido no muestra tooltip', async () => {
    const el = await mount(true);

    expect(await hover(items(el)[0])).toBe('');
  });
});
