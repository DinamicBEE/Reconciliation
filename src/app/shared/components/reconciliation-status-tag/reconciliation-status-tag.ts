import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ReconciliationStatus } from '../../models/reconciliation-item.model';

// Su propio "X-tag" — mismo criterio que `MatchStatusTag`/`SaleStatusTag`
// (ver MASTER.md): un enum de estado nuevo no se resuelve con un
// `[ngSwitch]` inline repetido en la tabla. `ReconciliationStatus` es un
// concepto DISTINTO de `MatchStatus` (3 estados agrupados por día + medio de
// pago, no 4 por orden) — no se reutiliza `MatchStatusTag` aunque ambos
// coincidan en verde/rojo/ámbar.
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
