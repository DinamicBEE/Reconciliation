import { Component, TemplateRef, inject, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { AccessCatalogService } from '../../auth/access-catalog.service';
import { AccessControlService } from '../../auth/access-control.service';
import { AuthService } from '../../auth/auth.service';
import { PaletteService } from '../../services/palette.service';
import { ThemeService } from '../../services/theme.service';
import { Header } from './header';
import { PageHeader, PageHeaderParent, PageHeaderService } from './page-header.service';

const LIST: PageHeaderParent = { label: 'Roles y permisos', path: '/lista' };
const ROUTES: Route[] = [
  { path: 'lista', children: [], data: { title: 'Roles y permisos' } },
  { path: 'nuevo', children: [], data: { title: 'Nuevo rol', parent: LIST } },
  { path: 'sin-titulo', children: [], data: {} },
];

// Pantalla de prueba: entrega al header título, subtítulo y botones como las pantallas reales.
@Component({
  selector: 'app-owner',
  template: '<ng-template #buttons><button type="button" class="probe-action">Eliminar</button></ng-template>',
})
class Owner {
  readonly subtitle = signal<string | null>(null);
  readonly withActions = signal(false);
  private readonly buttons = viewChild<TemplateRef<unknown>>('buttons');

  constructor() {
    inject(PageHeaderService).bind(
      (): Partial<PageHeader> => ({
        subtitle: this.subtitle(),
        actions: this.withActions() ? (this.buttons() ?? null) : null,
      }),
    );
  }
}

describe('Header', () => {
  let fixture: ComponentFixture<Header>;
  let el: HTMLElement;
  let router: Router;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter(ROUTES),
        { provide: AuthService, useValue: { currentUser: signal(null), logout: vi.fn() } },
        { provide: AccessControlService, useValue: { hasPermission: () => true, hasRole: () => true } },
        { provide: AccessCatalogService, useValue: { roleLabel: (id: string) => id } },
        { provide: ThemeService, useValue: { mode: signal('light'), toggle: vi.fn() } },
        { provide: PaletteService, useValue: { options: [], selected: signal(null), select: vi.fn(), reset: vi.fn() } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  async function show(url: string): Promise<void> {
    await router.navigateByUrl(url);
    // Sin navegación real a partir de aquí (flecha de volver, enlaces, búsqueda).
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Header);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // Monta una pantalla que hace `bind` y estabiliza el header.
  async function mountOwner(): Promise<ComponentFixture<Owner>> {
    const owner = TestBed.createComponent(Owner);
    owner.detectChanges();
    await owner.whenStable();
    await settle();
    return owner;
  }

  const pageHeader = () => el.querySelector('nz-page-header');
  const backButton = () => el.querySelector<HTMLElement>('.ant-page-header-back-button');
  const breadcrumbItems = () => Array.from(el.querySelectorAll('nz-breadcrumb nz-breadcrumb-item'));
  const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

  describe('título de la pantalla', () => {
    it('pinta `nz-page-header` con el título de la ruta', async () => {
      await show('/lista');

      expect(pageHeader()).not.toBeNull();
      expect(text(pageHeader())).toContain('Roles y permisos');
      expect(el.querySelector('.app-header__page')).not.toBeNull();
    });

    it('sin padre no muestra flecha de volver ni breadcrumb', async () => {
      await show('/lista');

      expect(backButton()).toBeNull();
      expect(el.querySelector('nz-breadcrumb')).toBeNull();
    });

    it('sin título en la ruta no pinta `nz-page-header` ni botones, pero sí el resto del header', async () => {
      await show('/sin-titulo');

      expect(pageHeader()).toBeNull();
      expect(el.querySelector('.app-header__page')).toBeNull();
      expect(el.querySelector('.app-header__page-actions')).toBeNull();
      expect(el.querySelector('button[aria-label="Buscar pantallas"]')).not.toBeNull();
    });

    it('cambia el título al navegar a otra pantalla', async () => {
      await show('/lista');
      navigateByUrl.mockRestore();

      await router.navigateByUrl('/sin-titulo');
      await settle();

      expect(pageHeader()).toBeNull();
    });
  });

  describe('pantalla hija (padre en la ruta)', () => {
    beforeEach(() => show('/nuevo'));

    it('muestra la flecha de volver y el título', () => {
      expect(backButton()).not.toBeNull();
      expect(backButton()!.querySelector('svg')).not.toBeNull();
      expect(text(pageHeader())).toContain('Nuevo rol');
    });

    it('muestra el breadcrumb `padre › título` con el padre como enlace', () => {
      const [parent, current] = breadcrumbItems();

      expect(breadcrumbItems()).toHaveLength(2);
      expect(text(parent.querySelector('a'))).toBe('Roles y permisos');
      expect(parent.querySelector('a')?.getAttribute('href')).toBe('/lista');
      expect(text(current.querySelector('.ant-breadcrumb-link'))).toBe('Nuevo rol');
      expect(current.querySelector('a')).toBeNull();
    });

    it('la flecha de volver navega a la ruta del padre', () => {
      backButton()!.click();

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(navigateByUrl).toHaveBeenCalledWith('/lista');
    });

    it('`goBack` navega a `parent.path`', () => {
      (fixture.componentInstance as unknown as { goBack(parent: PageHeaderParent): void }).goBack({
        label: 'Otro',
        path: '/otro',
      });

      expect(navigateByUrl).toHaveBeenCalledWith('/otro');
    });
  });

  describe('lo que entrega la pantalla con `bind`', () => {
    it('muestra el subtítulo bajo el título', async () => {
      await show('/lista');
      const owner = await mountOwner();

      expect(el.querySelector('.app-header__subtitle')).toBeNull();

      owner.componentInstance.subtitle.set('CON-0007 · Centro · 01/09/2026 – 15/09/2026');
      owner.detectChanges();
      await settle();

      expect(text(el.querySelector('.app-header__subtitle'))).toBe('CON-0007 · Centro · 01/09/2026 – 15/09/2026');
      expect(text(pageHeader())).toContain('Roles y permisos');
    });

    it('el subtítulo también se muestra en una pantalla hija, junto a la flecha y el breadcrumb', async () => {
      await show('/nuevo');
      const owner = await mountOwner();

      owner.componentInstance.subtitle.set('Detalle');
      owner.detectChanges();
      await settle();

      expect(text(el.querySelector('.app-header__subtitle'))).toBe('Detalle');
      expect(backButton()).not.toBeNull();
      expect(breadcrumbItems()).toHaveLength(2);
    });

    it('pinta el template de `actions` a la derecha del título, en `.app-header__page-actions`', async () => {
      await show('/lista');
      const owner = await mountOwner();
      expect(el.querySelector('.app-header__page-actions')).toBeNull();

      owner.componentInstance.withActions.set(true);
      owner.detectChanges();
      await settle();

      const actions = el.querySelector('.app-header__page-actions')!;
      expect(actions).not.toBeNull();
      expect(text(actions.querySelector('button.probe-action'))).toBe('Eliminar');
      // Hermano del bloque del título, no dentro de él.
      expect(el.querySelector('.app-header__page')!.contains(actions)).toBe(false);
    });

    it('al destruirse la pantalla desaparecen sus botones y su subtítulo', async () => {
      await show('/lista');
      const owner = await mountOwner();
      owner.componentInstance.subtitle.set('Detalle');
      owner.componentInstance.withActions.set(true);
      owner.detectChanges();
      await settle();
      expect(el.querySelector('.app-header__page-actions')).not.toBeNull();

      owner.destroy();
      await settle();

      expect(el.querySelector('.app-header__page-actions')).toBeNull();
      expect(el.querySelector('.app-header__subtitle')).toBeNull();
      expect(text(pageHeader())).toContain('Roles y permisos');
    });

    it('sin título en la ruta, un `bind` sin título tampoco pinta nada', async () => {
      await show('/sin-titulo');
      const owner = await mountOwner();
      owner.componentInstance.withActions.set(true);
      owner.detectChanges();
      await settle();

      expect(pageHeader()).toBeNull();
      expect(el.querySelector('.app-header__page-actions')).toBeNull();
    });
  });
});
