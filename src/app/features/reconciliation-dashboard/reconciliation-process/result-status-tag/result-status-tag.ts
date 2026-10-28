import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ReconciliationResultStatus } from '../../data/reconciliation-result.model';
import { RECONCILIATION_RESULT_STATUS_LABEL } from '../../data/reconciliation-result.util';

// Estado de una línea del resultado POS contra banco.
const COLOR: Record<ReconciliationResultStatus, string> = {
  coincide: 'success',
  diferencia: 'warning',
  sin_coincidencia: 'error',
};

@Component({
  selector: 'app-result-status-tag',
  imports: [NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nz-tag [nzColor]="color()">{{ label() }}</nz-tag> `,
})
export class ResultStatusTag {
  readonly status = input.required<ReconciliationResultStatus>();

  protected readonly color = computed(() => COLOR[this.status()]);
  protected readonly label = computed(() => RECONCILIATION_RESULT_STATUS_LABEL[this.status()]);
}
