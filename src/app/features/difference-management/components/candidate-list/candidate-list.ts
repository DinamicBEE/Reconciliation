import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { MoneyPipe } from '../../../../core/country/money.pipe';
import { MatchCandidate } from '../../data/difference-management.model';
import { DifferenceManagementService } from '../../data/difference-management.service';

/**
 * Lista de transacciones bancarias candidatas de la orden, seleccionables y filtrables por referencia.
 *
 * @remarks Lee y escribe en el `DifferenceManagementService` del componente que la hospeda.
 * @see docs/codigo/diferencias.md#pantalla
 */
@Component({
  selector: 'app-candidate-list',
  imports: [CommonModule, FormsModule, NzCardModule, NzInputModule, NzTagModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './candidate-list.html',
  styleUrl: './candidate-list.scss',
})
export class CandidateList {
  protected readonly service = inject(DifferenceManagementService);
  protected readonly referenceFilter = signal('');

  protected readonly filteredCandidates = computed(() => {
    const term = this.referenceFilter().trim().toLowerCase();
    const candidates = this.service.candidates();
    if (!term) return candidates;
    return candidates.filter((c) => c.settlement.orderId.toLowerCase().includes(term));
  });

  protected toggle(candidate: MatchCandidate): void {
    this.service.toggleCandidate(candidate.settlement.id);
  }
}
