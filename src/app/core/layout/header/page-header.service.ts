import { DestroyRef, Injectable, TemplateRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** Pantalla padre de una pantalla hija: da la flecha de volver y el breadcrumb. */
export interface PageHeaderParent {
  label: string;
  path: string;
}

/** Lo que el header de la aplicación muestra como encabezado de la pantalla activa. */
export interface PageHeader {
  title: string;
  /** Línea de apoyo bajo el título. */
  subtitle: string | null;
  parent: PageHeaderParent | null;
  /** Botones de la pantalla, a la derecha del título. */
  actions: TemplateRef<unknown> | null;
}

interface Owned {
  owner: symbol;
  value: Partial<PageHeader>;
}

function leafData(router: Router): Partial<PageHeader> {
  let route = router.routerState.snapshot.root;
  while (route.firstChild) route = route.firstChild;
  return { title: route.data['title'], parent: route.data['parent'] };
}

/**
 * Encabezado de pantalla que pinta `Header`: el título y la pantalla padre salen de `data` de la ruta.
 *
 * @remarks `bind` lo completa o sustituye con lo que solo conoce el componente (título dinámico, botones).
 * @see docs/codigo/layout-y-tema.md#encabezado-de-pantalla
 */
@Injectable({ providedIn: 'root' })
export class PageHeaderService {
  private readonly router = inject(Router);

  private readonly fromRoute = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => leafData(this.router)),
    ),
    { initialValue: leafData(this.router) },
  );

  private readonly override = signal<Owned | null>(null);

  /** El encabezado activo; `null` si la ruta no declara título. */
  readonly header = computed<PageHeader | null>(() => {
    const route = this.fromRoute();
    const own = this.override()?.value ?? {};
    const title = own.title ?? route.title;
    if (!title) return null;
    return {
      title,
      subtitle: own.subtitle ?? null,
      parent: own.parent ?? route.parent ?? null,
      actions: own.actions ?? null,
    };
  });

  /**
   * Completa el encabezado de la ruta con valores del componente; se quita al destruirse.
   *
   * @remarks Debe llamarse en el constructor: usa el contexto de inyección.
   */
  bind(source: () => Partial<PageHeader>): void {
    const owner = Symbol('page-header');
    effect(() => this.override.set({ owner, value: source() }));
    inject(DestroyRef).onDestroy(() => this.override.update((current) => (current?.owner === owner ? null : current)));
  }
}
