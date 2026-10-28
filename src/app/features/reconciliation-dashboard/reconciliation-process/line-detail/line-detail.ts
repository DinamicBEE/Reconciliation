import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AccessControlService } from '../../../../core/auth/access-control.service';
import { MoneyPipe } from '../../../../core/country/money.pipe';
import { TENDER_MEDIA_LABEL } from '../../../../shared/models/reconciliation-item.model';
import { CandidateList } from '../../../difference-management/components/candidate-list/candidate-list';
import { DifferenceManagementService } from '../../../difference-management/data/difference-management.service';
import { BankFileDropzone } from '../../components/bank-file-dropzone/bank-file-dropzone';
import { StatementResult } from '../../components/statement-result/statement-result';
import { BankStatementReader } from '../../data/bank-statement-reader.service';
import { BankStatementResult } from '../../data/bank-statement.util';
import { ReconciliationLineSide, ReconciliationResultRow, ReconciliationResultStatus } from '../../data/reconciliation-result.model';
import { validateNote } from './note.util';

/** Acción con la que se resuelve una línea: marcarla pendiente, ajustar el monto o reconciliar con un archivo. */
export type LineActionType = 'pendiente' | 'ajuste' | 'reconciliacion';

/** Acción registrada sobre una línea y el motivo que escribió la persona. */
export interface LineResolution {
  rowId: string;
  type: LineActionType;
  comment: string;
}

/** Etiqueta visible de cada {@link LineActionType}. */
export const LINE_ACTION_LABEL: Record<LineActionType, string> = {
  pendiente: 'Marcada como pendiente',
  ajuste: 'Monto ajustado',
  reconciliacion: 'Reconciliada con archivo',
};

const VARIANT: Record<ReconciliationResultStatus, string> = {
  coincide: 'success',
  diferencia: 'warning',
  sin_coincidencia: 'error',
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Detalle de una línea del resultado: POS contra banco, diferencia y acciones para resolverla.
 *
 * @remarks Aloja su propio `DifferenceManagementService` para reutilizar los candidatos.
 * @see docs/codigo/conciliacion.md#detalle-de-linea
 */
@Component({
  selector: 'app-line-detail',
  imports: [
    NgTemplateOutlet,
    NzButtonModule,
    NzCardModule,
    NzInputModule,
    MoneyPipe,
    CandidateList,
    BankFileDropzone,
    StatementResult,
  ],
  providers: [DifferenceManagementService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-detail.html',
  styleUrl: './line-detail.scss',
})
export class LineDetail {
  readonly row = input.required<ReconciliationResultRow>();
  /** Acción ya registrada: el detalle queda de solo lectura. */
  readonly resolution = input<LineResolution | null>(null);
  readonly resolved = output<LineResolution>();

  protected readonly service = inject(DifferenceManagementService);
  protected readonly access = inject(AccessControlService);
  private readonly reader = inject(BankStatementReader);

  protected readonly mode = signal<'none' | 'ajuste' | 'reconciliacion'>('none');
  protected readonly note = signal('');
  protected readonly noteTouched = signal(false);

  // "Reconciliar": archivo del banco y su revisión.
  protected readonly file = signal<File | null>(null);
  protected readonly statement = signal<BankStatementResult | null>(null);
  protected readonly reading = signal(false);
  private readSeq = 0;

  protected readonly actionLabel = LINE_ACTION_LABEL;
  protected readonly isMatched = computed(() => this.row().status === 'coincide');
  protected readonly canManage = computed(() => this.access.hasPermission('manage_differences'));

  // Con candidatos seleccionados, el monto del banco y la diferencia salen de su suma.
  private readonly selecting = computed(() => this.mode() === 'ajuste' && this.service.selectedCount() > 0);

  protected readonly bank = computed<ReconciliationLineSide | null>(() => {
    const base = this.row().bank;
    if (!this.selecting()) return base;
    const amount = this.service.selectedSettledAmount();
    const method = TENDER_MEDIA_LABEL[this.row().tenderMedia];
    return base ? { ...base, amount } : { reference: '—', concept: '—', paymentMethod: method, amount };
  });

  protected readonly difference = computed(() =>
    this.selecting() ? round2((this.row().pos?.amount ?? 0) - this.service.selectedSettledAmount()) : this.row().difference,
  );

  protected readonly variant = computed(() => (this.difference() === 0 ? 'success' : VARIANT[this.row().status]));

  // Solo se edita con una acción elegida y sin resolución previa.
  protected readonly noteEnabled = computed(() => this.mode() !== 'none' && this.resolution() === null);
  protected readonly noteValue = computed(() => {
    if (this.isMatched()) return this.row().comment;
    return this.resolution()?.comment ?? this.note();
  });
  protected readonly noteError = computed(() => validateNote(this.note()));
  protected readonly showNoteError = computed(
    () => this.noteEnabled() && this.noteError() !== null && (this.noteTouched() || this.note().length > 0),
  );

  protected readonly canConfirm = computed(() => {
    if (this.noteError() !== null || !this.canManage()) return false;
    return this.mode() === 'ajuste' ? this.service.selectedCount() > 0 : this.statement()?.state === 'valid';
  });

  constructor() {
    this.service.bindOrder(
      computed(() => this.row().tenderMedia),
      computed(() => this.row().reference),
    );
  }

  protected markPending(): void {
    if (!this.canManage()) return;
    this.resolved.emit({ rowId: this.row().id, type: 'pendiente', comment: '' });
  }

  protected choose(mode: 'ajuste' | 'reconciliacion'): void {
    this.mode.set(mode);
  }

  protected async onFileSelected(file: File): Promise<void> {
    const seq = ++this.readSeq;
    this.file.set(file);
    this.statement.set(null);
    this.reading.set(true);
    const result = await this.reader.read(file);
    if (seq !== this.readSeq) return;
    this.statement.set(result);
    this.reading.set(false);
  }

  protected confirm(): void {
    const mode = this.mode();
    if (mode === 'none' || !this.canConfirm()) return;
    const comment = this.note().trim();
    if (mode === 'ajuste') {
      this.service.setNote(comment);
      if (!this.service.save()) return;
    }
    this.resolved.emit({ rowId: this.row().id, type: mode, comment });
  }
}
