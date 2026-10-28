import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { STATUS_META, STATUS_OPTIONS, UserStatus } from '../data/user-management.model';

/**
 * Chip de estado de cuenta con menú para cambiarlo.
 *
 * @remarks No aplica el cambio: emite `statusChange` y el consumidor confirma; elegir el estado actual no emite.
 * @see docs/codigo/usuarios.md#estados-de-cuenta
 */
@Component({
  selector: 'app-status-chip',
  imports: [NzDropdownModule, NzMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.scss',
})
export class StatusChip {
  readonly status = input.required<UserStatus>();
  readonly statusChange = output<UserStatus>();

  protected readonly options = STATUS_OPTIONS;
  protected readonly meta = computed(() => STATUS_META[this.status()]);

  protected onOptionClick(value: UserStatus): void {
    if (value === this.status()) return;
    this.statusChange.emit(value);
  }
}
