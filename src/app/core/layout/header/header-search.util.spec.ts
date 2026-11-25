import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PermissionKey } from '../../../shared/models/access.model';
import { AccessCatalogService } from '../../auth/access-catalog.service';
import { AccessControlService } from '../../auth/access-control.service';
import { AuthService } from '../../auth/auth.service';
import { PaletteService } from '../../services/palette.service';
import { ThemeService } from '../../services/theme.service';
import { Header } from './header';
import { SEARCHABLE_PAGES, SearchablePage, searchPages } from './header-search.util';

const page = (label: string) => SEARCHABLE_PAGES.find((p) => p.label === label)!;

describe('SEARCHABLE_PAGES', () => {
  it('"Roles y permisos" y "Nuevo rol" piden manage_roles y no un rol', () => {
    for (const label of ['Roles y permisos', 'Nuevo rol']) {
      expect(page(label).permission, label).toBe('manage_roles');
      expect('role' in page(label), label).toBe(false);
    }
    expect(page('Roles y permisos').path).toBe('/gestion-de-roles');
    expect(page('Nuevo rol').path).toBe('/gestion-de-roles/nuevo');
  });

  it('ninguna pantalla buscable depende de un rol', () => {
    expect(SEARCHABLE_PAGES.filter((p) => p.role !== undefined)).toEqual([]);
  });
});

describe('searchPages', () => {
  const PAGES: SearchablePage[] = [
    { label: 'Roles y permisos', path: '/gestion-de-roles', keywords: ['accesos'] },
    { label: 'Usuarios', path: '/usuarios', keywords: ['cuentas'] },
  ];

  it('sin texto no devuelve nada', () => {
    expect(searchPages(PAGES, '   ')).toEqual([]);
  });

  it('busca en el label sin distinguir mayúsculas y en las keywords', () => {
    expect(searchPages(PAGES, 'ROLES').map((p) => p.path)).toEqual(['/gestion-de-roles']);
    expect(searchPages(PAGES, 'cuentas').map((p) => p.path)).toEqual(['/usuarios']);
  });
});

describe('Header · búsqueda filtrada por permiso', () => {
  let fixture: ComponentFixture<Header>;
  let permissions: PermissionKey[];
  let hasRole: ReturnType<typeof vi.fn>;

  interface Internals {
    query: { set(value: string): void };
    results(): SearchablePage[];
  }

  async function mount(): Promise<Internals> {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(null), logout: vi.fn() } },
        {
          provide: AccessControlService,
          useValue: { hasPermission: (key: PermissionKey) => permissions.includes(key), hasRole },
        },
        { provide: AccessCatalogService, useValue: { roleLabel: (id: string) => id } },
        { provide: ThemeService, useValue: { mode: signal('light'), toggle: vi.fn() } },
        { provide: PaletteService, useValue: { options: [], selected: signal(null), select: vi.fn(), reset: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  beforeEach(() => {
    // Sin ningún rol: la búsqueda solo debe depender de los permisos.
    hasRole = vi.fn(() => false);
  });

  it('con manage_roles y sin rol ADMIN encuentra "Roles y permisos" y "Nuevo rol"', async () => {
    permissions = ['manage_roles'];
    const header = await mount();

    header.query.set('rol');

    expect(header.results().map((p) => p.label)).toEqual(['Roles y permisos', 'Nuevo rol']);
    expect(hasRole).not.toHaveBeenCalled();
  });

  it('sin manage_roles no ofrece las pantallas de roles', async () => {
    permissions = ['manage_users'];
    const header = await mount();

    header.query.set('rol');

    expect(header.results().map((p) => p.label)).toEqual([]);
  });
});
