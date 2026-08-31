import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { SaleStatus } from '../../models/sale.model';

const STATUS_META: Record<SaleStatus, { label: string; color: string }> = {
  completada: { label: 'Completada', color: 'success' },
  cancelada: { label: 'Cancelada', color: 'error' },
};

@Component({
  selector: 'app-sale-status-tag',
  imports: [NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nz-tag [nzColor]="meta().color">{{ meta().label }}</nz-tag> `,
})
export class SaleStatusTag {
  readonly status = input.required<SaleStatus>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
}
