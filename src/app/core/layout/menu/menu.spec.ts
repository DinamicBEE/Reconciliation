import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PermissionKey } from '../../../shared/models/access.model';
import { AccessControlService } from '../../auth/access-control.service';
import { AuthService } from '../../auth/auth.service';
import { MenuService } from '../../services/menu.service';
import { Menu } from './menu';

@Component({ template: '' })
class Stub {}

const ALL_PERMISSIONS: PermissionKey[] = [
  'view_dashboard',
  'view_reconciliation',
  'manage_users',
  'manage_roles',
];

interface MountOptions {
  expanded?: boolean;
  permissions?: PermissionKey[];
  hasRole?: ReturnType<typeof vi.fn>;
}

describe('Menu', () => {
  let fixture: ComponentFixture<Menu>;
  let logout: ReturnType<typeof vi.fn>;
  let toggle: ReturnType<typeof vi.fn>;

  async function mount({
    expanded = true,
    permissions = ALL_PERMISSIONS,
    hasRole = vi.fn(() => false),
  }: MountOptions = {}) {
    logout = vi.fn();
    toggle = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Menu],
      providers: [
        provideRouter([{ path: 'dashboard', component: Stub }]),
        // Doble del estado del menú: evita `localStorage` en las pruebas.
        { provide: MenuService, useValue: { expanded: signal(expanded), toggle } },
        { provide: AuthService, useValue: { logout } },
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

  describe('enlace "Roles y permisos"', () => {
    const rolesLink = (el: HTMLElement) =>
      el.querySelector<HTMLAnchorElement>('a[href="/gestion-de-roles"]');

    it('con manage_roles y sin el rol ADMIN muestra el enlace', async () => {
      const hasRole = vi.fn(() => false);
      const el = await mount({ permissions: ['manage_roles'], hasRole });

      expect(rolesLink(el)).not.toBeNull();
      expect(rolesLink(el)!.textContent).toContain('Roles y permisos');
      expect(hasRole).not.toHaveBeenCalled();
    });

    it('sin manage_roles no muestra el enlace aunque pueda administrar usuarios', async () => {
      const el = await mount({ permissions: ['manage_users'] });

      expect(rolesLink(el)).toBeNull();
    });

    it('sin permisos no muestra el enlace', async () => {
      const el = await mount({ permissions: [], hasRole: vi.fn(() => true) }); // aunque tuviera cualquier rol

      expect(rolesLink(el)).toBeNull();
    });
  });

  describe('tooltips de navegación', () => {
    const NAMES = [
      'Dashboard',
      'Conciliación',
      'Catálogos',
      'Usuarios',
      'Roles y permisos',
      'Cerrar sesión',
    ];

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
      const el = await mount({ expanded: false });

      expect(el.querySelectorAll('[title]').length).toBe(0);
    });

    it('cada enlace y el pie conservan su nombre accesible con aria-label', async () => {
      const el = await mount({ expanded: false });

      expect(items(el).map((e) => e.getAttribute('aria-label'))).toEqual(NAMES);
    });

    it('contraído muestra el nombre de la pantalla en el tooltip al pasar el mouse', async () => {
      const el = await mount({ expanded: false });

      expect(await hover(items(el)[0])).toBe('Dashboard');
    });

    it('expandido no muestra tooltip', async () => {
      const el = await mount({ expanded: true });

      expect(await hover(items(el)[0])).toBe('');
    });
  });

  describe('accesibilidad', () => {
    it('la navegación es un landmark con nombre y sus enlaces son una lista', async () => {
      const el = await mount();
      const nav = el.querySelector('nav');

      expect(nav?.getAttribute('aria-label')).toBe('Principal');
      expect(nav!.querySelectorAll('ul > li > a').length).toBe(5);
    });

    it('"Cerrar sesión" es una acción fuera del <nav>', async () => {
      const el = await mount();
      const button = el.querySelector<HTMLButtonElement>('button[aria-label="Cerrar sesión"]');

      expect(button).not.toBeNull();
      expect(el.querySelector('nav')!.contains(button)).toBe(false);
    });

    it('marca con aria-current="page" solo el enlace de la pantalla actual', async () => {
      const el = await mount();
      await TestBed.inject(Router).navigateByUrl('/dashboard');
      fixture.detectChanges();

      const current = el.querySelectorAll('[aria-current="page"]');
      expect(current.length).toBe(1);
      expect(current[0].getAttribute('href')).toBe('/dashboard');
      expect(current[0].classList).toContain('app-menu__link--active');
    });

    it('los iconos decorativos se ocultan a las tecnologías de apoyo', async () => {
      const el = await mount();
      const svgs = Array.from(el.querySelectorAll('svg'));

      expect(svgs.length).toBeGreaterThan(0);
      expect(svgs.every((svg) => svg.getAttribute('aria-hidden') === 'true')).toBe(true);
    });
  });

  describe('botón de expandir/contraer', () => {
    const toggleButton = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('.app-menu__toggle')!;

    it('mantiene un nombre fijo y expone el estado con aria-expanded', async () => {
      const collapsed = await mount({ expanded: false });
      expect(toggleButton(collapsed).getAttribute('aria-label')).toBe('Menú lateral');
      expect(toggleButton(collapsed).getAttribute('aria-expanded')).toBe('false');
      expect(toggleButton(collapsed).getAttribute('aria-controls')).toBe('app-menu-nav');
      expect(collapsed.querySelector('#app-menu-nav')).not.toBeNull();
    });

    it('con el menú expandido aria-expanded es true', async () => {
      const el = await mount({ expanded: true });

      expect(toggleButton(el).getAttribute('aria-expanded')).toBe('true');
    });

    it('al hacer clic alterna el estado del menú', async () => {
      const el = await mount();
      toggleButton(el).click();

      expect(toggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('cerrar sesión', () => {
    it('cierra la sesión y navega al login', async () => {
      const el = await mount();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      el.querySelector<HTMLButtonElement>('button[aria-label="Cerrar sesión"]')!.click();

      expect(logout).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/login');
    });
  });
});
