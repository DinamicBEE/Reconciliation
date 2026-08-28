import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const WIDTH = 100;
const HEIGHT = 32;
const PADDING = 3;

let nextId = 0;

/**
 * Gráfica de área estilizada (línea delgada + relleno degradado bajo la
 * curva) que llena el 100% de su contenedor — el tamaño real lo decide quien
 * lo use vía CSS en el contenedor padre.
 */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="sparkline"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      preserveAspectRatio="none"
      [style.color]="color()"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.32" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>

      <polygon [attr.points]="areaPoints()" [attr.fill]="'url(#' + gradientId + ')'" stroke="none" />

      <polyline
        [attr.points]="linePoints()"
        fill="none"
        stroke="currentColor"
        [attr.stroke-width]="strokeWidth()"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <circle [attr.cx]="lastPoint().x" [attr.cy]="lastPoint().y" r="1.6" fill="currentColor" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .sparkline {
      width: 100%;
      height: 100%;
      display: block;
    }
  `,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly color = input<string>('currentColor');
  readonly strokeWidth = input<number>(1.25);

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly gradientId = `sparkline-fill-${nextId++}`;

  private readonly coords = computed(() => {
    const values = this.values();
    if (values.length === 0) {
      return [];
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = (WIDTH - PADDING * 2) / Math.max(values.length - 1, 1);

    return values.map((value, i) => ({
      x: PADDING + i * step,
      y: HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2),
    }));
  });

  protected readonly linePoints = computed(() =>
    this.coords()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );

  // Área bajo la curva: la línea + un cierre hasta el borde inferior real,
  // para que el relleno quede "anclado" al piso del contenedor.
  protected readonly areaPoints = computed(() => {
    const coords = this.coords();
    if (coords.length === 0) {
      return '';
    }
    const first = coords[0];
    const last = coords[coords.length - 1];
    const line = coords.map((p) => `${p.x},${p.y}`).join(' ');
    return `${first.x},${this.height} ${line} ${last.x},${this.height}`;
  });

  protected readonly lastPoint = computed(() => {
    const coords = this.coords();
    return coords[coords.length - 1] ?? { x: 0, y: 0 };
  });
}
