import { Injectable, effect, inject, signal } from '@angular/core';
import { ThemeService, ThemeMode } from './theme.service';
import { hexToHue, hsl } from './color-utils';

/** Acento seleccionable del selector de paleta. */
export interface PaletteOption {
  name: string;
  hex: string;
}

/**
 * Acentos base; cada uno es la semilla (su matiz) de una paleta derivada.
 *
 * @remarks Distintos de verde/ámbar/rojo para no confundirse con los colores semánticos.
 */
export const PALETTE_OPTIONS: PaletteOption[] = [
  { name: 'Azul', hex: '#2563eb' },
  { name: 'Índigo', hex: '#4f46e5' },
  { name: 'Violeta', hex: '#7c3aed' },
  { name: 'Rosa', hex: '#db2777' },
  { name: 'Cian', hex: '#0891b2' },
  { name: 'Dorado', hex: '#eab308' },
];

const STORAGE_KEY = 'conciliation-palette';

// Tokens que controla la paleta. Los semánticos (success/warning/destructive) quedan fuera:
// su significado es el estado del movimiento. Ver docs/codigo/layout-y-tema.md#paleta
const TOKEN_NAMES = [
  '--color-primary',
  '--color-on-primary',
  '--color-secondary',
  '--color-on-secondary',
  '--color-accent',
  '--color-on-accent',
  '--color-background',
  '--color-foreground',
  '--color-card',
  '--color-card-foreground',
  '--color-muted',
  '--color-muted-foreground',
  '--color-border',
  '--color-ring',
  '--color-chart-donut',
] as const;

// Deriva los tokens de TOKEN_NAMES del matiz de la semilla, con fórmulas HSL para claro y oscuro.
// Ver docs/codigo/layout-y-tema.md#paleta
function buildPalette(seedHex: string, mode: ThemeMode): Record<string, string> {
  const h = hexToHue(seedHex);

  if (mode === 'light') {
    const primary = hsl(h, 70, 45);
    const foreground = hsl(h, 30, 8);
    return {
      '--color-primary': primary,
      '--color-on-primary': '#ffffff',
      '--color-secondary': hsl(h, 55, 30),
      '--color-on-secondary': '#ffffff',
      '--color-accent': hsl(h, 80, 40),
      '--color-on-accent': '#ffffff',
      // Fondo más oscuro que la card (superficie elevada); muted y border bajan en cadena.
      '--color-background': hsl(h, 35, 94),
      '--color-foreground': foreground,
      '--color-card': hsl(h, 15, 99),
      '--color-card-foreground': foreground,
      '--color-muted': hsl(h, 25, 90),
      '--color-muted-foreground': hsl(h, 15, 40),
      '--color-border': hsl(h, 20, 85),
      '--color-ring': primary,
      '--color-chart-donut': primary,
    };
  }

  const primaryDark = hsl(h, 75, 60);
  const foregroundDark = hsl(h, 20, 96);
  return {
    '--color-primary': primaryDark,
    '--color-on-primary': hsl(h, 30, 8),
    '--color-secondary': hsl(h, 50, 75),
    '--color-on-secondary': hsl(h, 30, 8),
    '--color-accent': hsl(h, 80, 55),
    '--color-on-accent': hsl(h, 30, 8),
    // En oscuro, la card es más clara que el fondo.
    '--color-background': hsl(h, 45, 3),
    '--color-foreground': foregroundDark,
    '--color-card': hsl(h, 30, 13),
    '--color-card-foreground': foregroundDark,
    '--color-muted': hsl(h, 28, 19),
    '--color-muted-foreground': hsl(h, 15, 65),
    '--color-border': hsl(h, 25, 27),
    '--color-ring': foregroundDark,
    '--color-chart-donut': primaryDark,
  };
}

/**
 * Acento de marca elegido por el usuario y paleta derivada, aplicada como estilo en `<html>`.
 *
 * @remarks `null` usa los valores de `styles.scss`; con semilla, se recalcula al cambiar el modo.
 * @see docs/codigo/layout-y-tema.md#paleta
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  private readonly theme = inject(ThemeService);

  readonly options = PALETTE_OPTIONS;
  // Escritura solo por métodos (ADR-0002, punto 4).
  private readonly selectedState = signal<string | null>(localStorage.getItem(STORAGE_KEY));
  readonly selected = this.selectedState.asReadonly();

  constructor() {
    effect(() => this.apply(this.selected(), this.theme.mode()));
  }

  select(hex: string): void {
    this.selectedState.set(hex);
  }

  /** Quita la semilla y vuelve a los tokens de `styles.scss`. */
  reset(): void {
    this.selectedState.set(null);
  }

  private apply(seedHex: string | null, mode: ThemeMode): void {
    const root = document.documentElement.style;

    if (!seedHex) {
      TOKEN_NAMES.forEach((name) => root.removeProperty(name));
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const tokens = buildPalette(seedHex, mode);
    for (const name of TOKEN_NAMES) {
      root.setProperty(name, tokens[name]);
    }
    localStorage.setItem(STORAGE_KEY, seedHex);
  }
}
