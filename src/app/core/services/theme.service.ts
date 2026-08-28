import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'conciliation-theme';
const NZ_LINK_ID = 'nz-theme-link';

// Hojas de estilo precompiladas de ng-zorro-antd, copiadas a /ng-zorro en el
// build (ver angular.json → assets). Se intercambia el href del <link> en
// runtime porque ng-zorro no expone variables CSS para fondo/texto/borde,
// solo para colores de marca (ver investigación previa).
const NZ_STYLESHEET: Record<ThemeMode, string> = {
  light: '/ng-zorro/ng-zorro-antd.min.css',
  dark: '/ng-zorro/ng-zorro-antd.dark.min.css',
};

/**
 * Maneja el modo claro/oscuro de toda la app: alterna la clase `dark` en
 * <html> (para nuestros propios tokens en styles.scss) y el stylesheet de
 * ng-zorro-antd (para sus componentes), y persiste la preferencia.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.resolveInitialMode());

  constructor() {
    effect(() => this.applyMode(this.mode()));
  }

  toggle(): void {
    this.mode.set(this.mode() === 'light' ? 'dark' : 'light');
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
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
