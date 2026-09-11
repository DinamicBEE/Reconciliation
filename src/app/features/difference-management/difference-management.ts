import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { MatchStatusTag } from '../../shared/components/match-status-tag/match-status-tag';
import { MatchCandidate } from './data/difference-management.model';
import { DifferenceManagementService } from './data/difference-management.service';
import { parseSettlementsCsv } from './data/csv-import.util';
import { TENDER_MEDIA_LABEL, TenderMedia } from '../../shared/models/reconciliation-item.model';

const VALID_TENDER_MEDIA = new Set<string>(Object.keys(TENDER_MEDIA_LABEL));

@Component({
  selector: 'app-difference-management',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzInputModule,
    NzModalModule,
    NzTagModule,
    MatchStatusTag,
  ],
  providers: [DifferenceManagementService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './difference-management.html',
  styleUrl: './difference-management.scss',
})
export class DifferenceManagement {
  // Ligados a :tenderMedia/:orderId de la ruta (withComponentInputBinding,
  // ver app.config.ts).
  readonly tenderMedia = input<string>();
  readonly orderId = input<string>();

  protected readonly service = inject(DifferenceManagementService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;
  protected readonly noteTouched = signal(false);
  protected readonly csvErrors = signal<string[]>([]);
  protected readonly referenceFilter = signal('');

  // Filtro por referencia sobre la lista de candidatos — la lista puede
  // crecer bastante tras importar un CSV, de ahí el filtro + scroll del Card.
  protected readonly filteredCandidates = computed(() => {
    const term = this.referenceFilter().trim().toLowerCase();
    const candidates = this.service.candidates();
    if (!term) return candidates;
    return candidates.filter((c) => c.settlement.orderId.toLowerCase().includes(term));
  });

  protected readonly validTenderMedia = computed<TenderMedia | null>(() => {
    const value = this.tenderMedia();
    return value && VALID_TENDER_MEDIA.has(value) ? (value as TenderMedia) : null;
  });

  // La pantalla solo aplica a órdenes sale_only/amount_mismatch — si la
  // orden no existe, o ya está resuelta, o el tender media es inválido, se
  // muestra un estado vacío en vez de una pantalla a medio armar.
  protected readonly isUsable = computed(() => {
    const order = this.service.order();
    return this.validTenderMedia() !== null && order !== null && (order.status === 'sale_only' || order.status === 'amount_mismatch');
  });

  constructor() {
    // effect (no computed): setOrder tiene side-effects (reinicia selección,
    // nota e importados) — mismo criterio que ReconciliationService, setters
    // explícitos en vez de reactividad implícita.
    effect(() => {
      const tenderMedia = this.tenderMedia();
      const orderId = this.orderId();
      if (tenderMedia && VALID_TENDER_MEDIA.has(tenderMedia) && orderId) {
        this.service.setOrder(tenderMedia as TenderMedia, orderId);
      }
    });
  }

  protected toggleCandidate(candidate: MatchCandidate): void {
    this.service.toggleCandidate(candidate.settlement.id);
  }

  protected onReferenceFilterChange(value: string): void {
    this.referenceFilter.set(value);
  }

  protected onNoteChange(value: string): void {
    this.service.setNote(value);
  }

  protected onNoteBlur(): void {
    this.noteTouched.set(true);
  }

  protected onCsvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const tenderMedia = this.validTenderMedia();
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (tenderMedia) {
        const { rows, errors } = parseSettlementsCsv(text, tenderMedia);
        this.service.importSettlements(rows);
        this.csvErrors.set(errors);

        if (rows.length > 0) {
          this.message.success(`Se importaron ${rows.length} transacción(es) del CSV.`);
        }
        if (errors.length > 0) {
          this.message.warning(`${errors.length} línea(s) del CSV no se pudieron importar.`);
        }
      }
    };
    reader.readAsText(file);

    // Permite volver a elegir el mismo archivo dos veces seguidas.
    input.value = '';
  }

  // El guardado en sí (service.save()) es irreversible — reasigna las
  // liquidaciones elegidas a esta orden en `ResolvedMatchesStore` — así que
  // se confirma antes, mismo patrón que onDeleteClick/onStatusChangeRequest
  // en user-list.ts.
  protected onSave(): void {
    this.noteTouched.set(true);
    if (!this.service.canSave()) return;

    const order = this.service.order();
    const amount = this.formatCurrency(this.service.selectedSettledAmount());
    const count = this.service.selectedCount();

    this.modal.confirm({
      nzTitle: 'Confirmar match',
      nzContent: `¿Confirmas el match de <b>${count}</b> transacción(es) por <b>${amount}</b> contra la orden <b>${order?.orderId}</b>? Esta acción no se puede deshacer.`,
      nzOkText: 'Confirmar',
      nzOnOk: () => {
        const result = this.service.save();
        if (!result) return;

        this.message.success(`Match guardado para la orden ${result.orderId}.`);
        this.router.navigateByUrl('/conciliacion');
      },
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  }
}
