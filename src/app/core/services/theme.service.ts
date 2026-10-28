import { Injectable, effect, signal } from '@angular/core';

/** Modo de color de la app. */
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'conciliation-theme';
const NZ_LINK_ID = 'nz-theme-link';

// Hojas precompiladas de ng-zorro (copiadas a /ng-zorro por angular.json): se cambia el href
// porque ng-zorro no expone variables CSS de superficie. Ver docs/codigo/layout-y-tema.md#tema
const NZ_STYLESHEET: Record<ThemeMode, string> = {
  light: '/ng-zorro/ng-zorro-antd.min.css',
  dark: '/ng-zorro/ng-zorro-antd.dark.min.css',
};

/**
 * Modo claro/oscuro: alterna la clase `dark` en `<html>` y la hoja de ng-zorro, y persiste la preferencia.
 *
 * @remarks Sin preferencia guardada, sigue `prefers-color-scheme`.
 * @see docs/codigo/layout-y-tema.md#tema
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Escritura solo por métodos (ADR-0002, punto 4).
  private readonly modeState = signal<ThemeMode>(this.resolveInitialMode());
  readonly mode = this.modeState.asReadonly();

  constructor() {
    effect(() => this.applyMode(this.mode()));
  }

  toggle(): void {
    this.modeState.set(this.mode() === 'light' ? 'dark' : 'light');
  }

  set(mode: ThemeMode): void {
    this.modeState.set(mode);
  }

  private resolveInitialMode(): ThemeMode {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applyMode(mode: ThemeMode): void {
    document.documentElement.classList.toggle('dark', mode === 'dark');

    const link = document.getElementById(NZ_LINK_ID) as HTMLLinkElement | null;
    if (link) {
      link.href = NZ_STYLESHEET[mode];
    }

    localStorage.setItem(STORAGE_KEY, mode);
  }
}
