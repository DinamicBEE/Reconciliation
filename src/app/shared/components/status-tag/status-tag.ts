import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ReconciliationStatus } from '../../models/reconciliation-item.model';

const STATUS_META: Record<ReconciliationStatus, { label: string; color: string }> = {
  matched: { label: 'Conciliado', color: 'success' },
  pending: { label: 'Pendiente', color: 'warning' },
  discrepancy: { label: 'Discrepancia', color: 'error' },
};

@Component({
  selector: 'app-status-tag',
  imports: [NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nz-tag [nzColor]="meta().color">{{ meta().label }}</nz-tag> `,
})
export class StatusTag {
  readonly status = input.required<ReconciliationStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
