import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { ReconciliationRunsStore } from '../data/reconciliation-runs.store';
import { RunStatusTag } from '../run-status-tag/run-status-tag';

/**
 * Comparativa POS contra banco de una conciliación (`/conciliacion/:runId`); el contenido está por definir.
 *
 * @see docs/codigo/conciliacion.md#comparativa
 */
@Component({
  selector: 'app-reconciliation-compare',
  imports: [CommonModule, RouterLink, NzPageHeaderModule, NzBreadCrumbModule, NzCardModule, RunStatusTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reconciliation-compare.html',
  styleUrl: './reconciliation-compare.scss',
})
export class ReconciliationCompare {
  // Ligado a :runId de la ruta (withComponentInputBinding, ver app.config.ts).
  readonly runId = input<string>();

  private readonly router = inject(Router);
  private readonly runs = inject(ReconciliationRunsStore);

  protected readonly selectedRun = computed(() => this.runs.find(this.runId()));

  // Navega al padre, no `Location.back()`: MASTER.md "Patrón: encabezado de página".
  protected onBack(): void {
    this.router.navigateByUrl('/conciliacion');
  }

  protected formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }
}
