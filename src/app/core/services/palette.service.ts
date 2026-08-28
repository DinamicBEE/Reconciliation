import { Injectable, effect, inject, signal } from '@angular/core';
import { ThemeService, ThemeMode } from './theme.service';
import { hexToHue, hsl } from './color-utils';

export interface PaletteOption {
  name: string;
  hex: string;
}

// Acentos base — deliberadamente distintos de los colores semánticos
// (éxito=verde, advertencia=ámbar, error=rojo) para no generar ambigüedad
// entre "elegí este color" y "este movimiento está en tal estado". Cada uno
// es la SEMILLA (su matiz/hue) de la que se deriva la paleta completa.
export const PALETTE_OPTIONS: PaletteOption[] = [
  { name: 'Azul', hex: '#2563eb' },
  { name: 'Índigo', hex: '#4f46e5' },
  { name: 'Violeta', hex: '#7c3aed' },
  { name: 'Rosa', hex: '#db2777' },
  { name: 'Cian', hex: '#0891b2' },
  { name: 'Dorado', hex: '#eab308' },
];

const STORAGE_KEY = 'conciliation-palette';

// Tokens que la paleta SÍ controla — marca + superficies. Los tokens
// semánticos (--color-success/warning/destructive) quedan fuera a
// propósito: su significado está atado al ESTADO del movimiento
// (conciliado/pendiente/discrepancia), no al gusto visual del usuario —
// dejar que la paleta los tiña rompería esa semántica.
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

// Deriva una paleta completa (14 tokens) a partir del matiz de una sola
// semilla, con fórmulas separadas para claro/oscuro (misma técnica que se
// usó a mano para la paleta original Banking/Traditional Finance: fondo
// casi-blanco/casi-negro con un toque del matiz, superficies neutras
// tenues, marca saturada).
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
      '--color-background': hsl(h, 40, 98),
      '--color-foreground': foreground,
      '--color-card': hsl(h, 20, 99),
      '--color-card-foreground': foreground,
      '--color-muted': hsl(h, 25, 93),
      '--color-muted-foreground': hsl(h, 15, 40),
      '--color-border': hsl(h, 20, 88),
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
    '--color-background': hsl(h, 45, 4),
    '--color-foreground': foregroundDark,
    '--color-card': hsl(h, 35, 8),
    '--color-card-foreground': foregroundDark,
    '--color-muted': hsl(h, 30, 14),
    '--color-muted-foreground': hsl(h, 15, 65),
    '--color-border': hsl(h, 25, 22),
    '--color-ring': foregroundDark,
    '--color-chart-donut': primaryDark,
  };
}

/**
 * Acento de marca elegido por el usuario. `null` = sin preferencia
 * explícita → se usan los valores por defecto de styles.scss (que ya
 * varían entre claro/oscuro). Al elegir un color, la paleta completa se
 * recalcula cada vez que cambia el tema (para que light/dark tengan su
 * propia derivación, no el mismo hex forzado en ambos).
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  private readonly theme = inject(ThemeService);

  readonly options = PALETTE_OPTIONS;
  readonly selected = signal<string | null>(localStorage.getItem(STORAGE_KEY));

  constructor() {
    effect(() => this.apply(this.selected(), this.theme.mode()));
  }

  select(hex: string): void {
    this.selected.set(hex);
  }

  reset(): void {
    this.selected.set(null);
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
