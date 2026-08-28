import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { MatchStatus } from '../../models/reconciliation-item.model';

const STATUS_META: Record<MatchStatus, { label: string; color: string }> = {
  matched: { label: 'Cruzado', color: 'success' },
  amount_mismatch: { label: 'Monto distinto', color: 'error' },
  sale_only: { label: 'Por liquidar', color: 'warning' },
  settlement_only: { label: 'Sin venta', color: 'error' },
};

@Component({
  selector: 'app-match-status-tag',
  imports: [NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nz-tag [nzColor]="meta().color">{{ meta().label }}</nz-tag> `,
})
export class MatchStatusTag {
  readonly status = input.required<MatchStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
