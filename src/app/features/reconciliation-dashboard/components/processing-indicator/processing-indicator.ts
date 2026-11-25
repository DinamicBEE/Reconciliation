import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NzProgressModule } from 'ng-zorro-antd/progress';

/**
 * Pantalla de espera: engranes girando, textos y barra de progreso, en columna centrada.
 *
 * @see docs/codigo/conciliacion.md#envio-y-resultado
 */
@Component({
  selector: 'app-processing-indicator',
  imports: [NzProgressModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './processing-indicator.html',
  styleUrl: './processing-indicator.scss',
})
export class ProcessingIndicator {
  readonly title = input.required<string>();
  readonly subtitles = input<string[]>([]);
  /** Avance de la barra, de 0 a 100. */
  readonly percent = input(0);
}
