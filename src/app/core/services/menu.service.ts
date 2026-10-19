import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'conciliation-menu-expanded';

/**
 * Estado de expandido/contraído del menú lateral (`core/layout/menu`).
 * Mismo patrón que `ThemeService`: un signal + `effect()` que persiste en
 * localStorage, para que la preferencia sobreviva a recargar la página.
 * Contraído por defecto (solo iconos) — es el estado más compacto.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  // Escritura solo por métodos (ADR-0002, punto 4).
  private readonly expandedState = signal<boolean>(this.resolveInitial());
  readonly expanded = this.expandedState.asReadonly();

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, String(this.expanded())));
  }

  toggle(): void {
    this.expandedState.update((value) => !value);
  }

  private resolveInitial(): boolean {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }
}
