import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { STATUS_META, STATUS_OPTIONS, UserStatus } from '../data/user-management.model';

/**
 * Chip de estado (Activo/Inactivo/Bloqueado) — fondo por estado + menú para
 * cambiarlo. Usado en `user-list` (columna Estado) y `user-detail`
 * ("Información general") — los dos únicos lugares donde se edita el
 * estado de una cuenta, de ahí que viva como componente propio en vez de
 * duplicar el trigger + dropdown + estilos dos veces (ver MASTER.md,
 * "Estructura de carpetas": feature-local, no shared/, porque ambos
 * consumidores son de ESTE feature).
 *
 * No aplica el cambio por sí solo — emite `statusChange` y deja que el
 * consumidor decida (en ambos casos hoy: mostrar una confirmación antes de
 * llamar a `UserManagementService.setStatus`). Volver a elegir el estado
 * YA activo no emite nada (no hay nada que confirmar).
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
