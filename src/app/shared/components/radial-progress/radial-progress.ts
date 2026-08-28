import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SIZE = 36;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Anillo de progreso que llena el 100% de su contenedor (ancho y alto) — el
 * tamaño real lo decide quien lo use vía CSS en el contenedor padre.
 */
@Component({
  selector: 'app-radial-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="radial" [attr.viewBox]="'0 0 ' + size + ' ' + size" preserveAspectRatio="xMidYMid meet">
      <circle
        class="radial__track"
        [attr.cx]="size / 2"
        [attr.cy]="size / 2"
        [attr.r]="radius"
        fill="none"
        stroke="var(--color-muted)"
        [attr.stroke-width]="stroke"
      />
      <circle
        class="radial__value"
        [attr.cx]="size / 2"
        [attr.cy]="size / 2"
        [attr.r]="radius"
        fill="none"
        [style.stroke]="color()"
        [attr.stroke-width]="stroke"
        stroke-linecap="round"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="dashOffset()"
        [attr.transform]="'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'"
      />
      <text
        class="radial__label"
        [attr.x]="size / 2"
        [attr.y]="size / 2"
        text-anchor="middle"
        dominant-baseline="central"
        [style.fill]="color()"
      >
        {{ percent() }}%
      </text>
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      width: 100%;
      height: 100%;
    }
    .radial {
      width: 100%;
      height: 100%;
    }
    .radial__value {
      transition: stroke-dashoffset 300ms ease;
    }
    .radial__label {
      font-size: 8px;
      font-weight: 600;
      font-family: var(--font-mono, monospace);
    }
  `,
})
export class RadialProgress {
  readonly percent = input.required<number>();
  readonly color = input<string>('var(--color-primary)');

  protected readonly size = SIZE;
  protected readonly radius = RADIUS;
  protected readonly stroke = STROKE;
  protected readonly circumference = CIRCUMFERENCE;

  protected readonly dashOffset = computed(() => {
    const clamped = Math.min(100, Math.max(0, this.percent()));
    return CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  });
}
