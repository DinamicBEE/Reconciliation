import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ReconciliationRunStatus } from '../data/reconciliation-run.model';
import { RECONCILIATION_RUN_STATUS_LABEL } from '../data/reconciliation-run.util';

// Estado de una corrida completa, no el de día + medio de pago de `ReconciliationStatusTag`.
const COLOR: Record<ReconciliationRunStatus, string> = {
  conciliado: 'success',
  pendiente: 'warning',
  desconciliado: 'error',
};

@Component({
  selector: 'app-run-status-tag',
  imports: [NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nz-tag [nzColor]="color()">{{ label() }}</nz-tag> `,
})
export class RunStatusTag {
  readonly status = input.required<ReconciliationRunStatus>();

  protected readonly color = computed(() => COLOR[this.status()]);
  protected readonly label = computed(() => RECONCILIATION_RUN_STATUS_LABEL[this.status()]);
}
