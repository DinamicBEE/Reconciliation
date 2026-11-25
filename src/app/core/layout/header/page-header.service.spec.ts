import { Component, TemplateRef, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { routes } from '../../../app.routes';
import { PageHeader, PageHeaderParent, PageHeaderService } from './page-header.service';

const LIST: PageHeaderParent = { label: 'Roles y permisos', path: '/lista' };
const ROUTES: Route[] = [
  { path: 'lista', children: [], data: { title: 'Roles y permisos' } },
  { path: 'nuevo', children: [], data: { title: 'Nuevo rol', parent: LIST } },
  { path: 'sin-titulo', children: [], data: {} },
];

// Pantalla de prueba: entrega al header lo que diga `value`, como las pantallas reales.
@Component({ selector: 'app-owner', template: '' })
class Owner {
  readonly value = signal<Partial<PageHeader>>({});

  constructor() {
    inject(PageHeaderService).bind(() => this.value());
  }
}

describe('PageHeaderService', () => {
  let service: PageHeaderService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(ROUTES)] });
    service = TestBed.inject(PageHeaderService);
    router = TestBed.inject(Router);
  });

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
  }

  function mount(value: Partial<PageHeader> = {}): ComponentFixture<Owner> {
    const fixture = TestBed.createComponent(Owner);
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    return fixture;
  }

  async function update(fixture: ComponentFixture<Owner>, value: Partial<PageHeader>): Promise<void> {
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('desde `data` de la ruta', () => {
    it('antes de navegar no hay encabezado', () => {
      expect(service.header()).toBeNull();
    });

    it('toma el título de la ruta hoja y no trae subtítulo, padre ni botones', async () => {
      await go('/lista');

      expect(service.header()).toEqual({ title: 'Roles y permisos', subtitle: null, parent: null, actions: null });
    });

    it('toma también el padre de la ruta', async () => {
      await go('/nuevo');

      expect(service.header()).toEqual({ title: 'Nuevo rol', subtitle: null, parent: LIST, actions: null });
    });

    it('una ruta sin `title` deja el encabezado en null', async () => {
      await go('/lista');
      await go('/sin-titulo');

      expect(service.header()).toBeNull();
    });

    it('cambia en cada navegación', async () => {
      await go('/nuevo');
      expect(service.header()?.title).toBe('Nuevo rol');

      await go('/lista');

      expect(service.header()).toEqual({ title: 'Roles y permisos', subtitle: null, parent: null, actions: null });
    });
  });

  describe('bind', () => {
    it('completa el encabezado de la ruta con el subtítulo y conserva título y padre', async () => {
      await go('/nuevo');
      mount({ subtitle: 'CON-0007 · Centro' });

      expect(service.header()).toEqual({ title: 'Nuevo rol', subtitle: 'CON-0007 · Centro', parent: LIST, actions: null });
    });

    it('sustituye el título de la ruta', async () => {
      await go('/nuevo');
      mount({ title: 'Editar rol' });

      expect(service.header()?.title).toBe('Editar rol');
    });

    it('sustituye el padre de la ruta y, si no lo trae, conserva el de la ruta', async () => {
      await go('/nuevo');
      const other: PageHeaderParent = { label: 'Otro', path: '/otro' };
      const owner = mount({ parent: other });
      expect(service.header()?.parent).toEqual(other);

      await update(owner, { subtitle: 'sin padre' });

      expect(service.header()?.parent).toEqual(LIST);
    });

    it('entrega los botones (`TemplateRef`) tal cual', async () => {
      await go('/lista');
      const actions = {} as TemplateRef<unknown>;
      mount({ actions });

      expect(service.header()?.actions).toBe(actions);
    });

    it('con la ruta sin título, el título del `bind` basta para tener encabezado', async () => {
      await go('/sin-titulo');
      mount({ title: 'Gestión de diferencias — Orden A-1' });

      expect(service.header()).toEqual({
        title: 'Gestión de diferencias — Orden A-1',
        subtitle: null,
        parent: null,
        actions: null,
      });
    });

    it('sin título ni en la ruta ni en el `bind` no hay encabezado, aunque haya subtítulo', async () => {
      await go('/sin-titulo');
      mount({ subtitle: 'huérfano' });

      expect(service.header()).toBeNull();
    });

    it('sigue a los signals del componente', async () => {
      await go('/lista');
      const owner = mount({ title: 'Uno' });
      expect(service.header()?.title).toBe('Uno');

      await update(owner, { title: 'Dos' });

      expect(service.header()?.title).toBe('Dos');
    });

    it('al cambiar de ruta el `bind` activo se mantiene sobre el nuevo `data`', async () => {
      await go('/lista');
      mount({ subtitle: 'detalle' });

      await go('/nuevo');

      expect(service.header()).toEqual({ title: 'Nuevo rol', subtitle: 'detalle', parent: LIST, actions: null });
    });

    it('se limpia al destruirse el dueño y vuelve lo de la ruta', async () => {
      await go('/nuevo');
      const owner = mount({ title: 'Editar rol', subtitle: 'x', actions: {} as TemplateRef<unknown> });
      expect(service.header()?.title).toBe('Editar rol');

      owner.destroy();

      expect(service.header()).toEqual({ title: 'Nuevo rol', subtitle: null, parent: LIST, actions: null });
    });

    it('un `bind` nuevo no es borrado por el cierre del anterior', async () => {
      await go('/lista');
      const first = mount({ title: 'Primero' });
      mount({ title: 'Segundo' });
      expect(service.header()?.title).toBe('Segundo');

      first.destroy();

      expect(service.header()?.title).toBe('Segundo');
    });

    it('al destruirse el último dueño ya no queda nada del anterior', async () => {
      await go('/lista');
      const first = mount({ title: 'Primero' });
      const second = mount({ title: 'Segundo' });

      first.destroy();
      second.destroy();

      expect(service.header()?.title).toBe('Roles y permisos');
    });
  });
});

describe('rutas de la aplicación (`app.routes.ts`)', () => {
  const shell = routes.find((route) => route.path === '' && route.children)!;
  const screens = (shell.children ?? []).filter((route) => route.loadComponent || route.component);

  it('toda pantalla declara el `title` que pinta el header', () => {
    expect(screens.length).toBeGreaterThan(0);
    for (const route of screens) {
      expect(route.data?.['title'], `ruta "${route.path}"`).toEqual(expect.any(String));
      expect((route.data?.['title'] as string).length, `ruta "${route.path}"`).toBeGreaterThan(0);
    }
  });

  it('el padre de cada pantalla hija es una pantalla con ese mismo título', () => {
    const children = screens.filter((route) => route.data?.['parent']);
    expect(children.length).toBeGreaterThan(0);

    for (const route of children) {
      const parent = route.data!['parent'] as PageHeaderParent;
      const target = screens.find((screen) => `/${screen.path}` === parent.path);

      expect(target, `padre de "${route.path}"`).toBeDefined();
      expect(parent.label).toBe(target!.data!['title']);
    }
  });
});
