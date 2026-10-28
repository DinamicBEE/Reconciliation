import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ReconciliationStatus } from '../../models/reconciliation-item.model';

// No reutiliza `MatchStatusTag`: `ReconciliationStatus` es otro concepto (por grupo, no por orden).
const STATUS_META: Record<ReconciliationStatus, { label: string; color: string }> = {
  conciliado: { label: 'Conciliado', color: 'success' },
  desconciliado: { label: 'Desconciliado', color: 'error' },
  por_conciliar: { label: 'Por conciliar', color: 'warning' },
};

@Component({
  selector: 'app-reconciliation-status-tag',
  imports: [NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nz-tag [nzColor]="meta().color">{{ meta().label }}</nz-tag> `,
})
export class ReconciliationStatusTag {
  readonly status = input.required<ReconciliationStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
