import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTableModule } from 'ng-zorro-antd/table';
import { interval, take } from 'rxjs';
import { AccessControlService } from '../../../../core/auth/access-control.service';
import { MoneyPipe } from '../../../../core/country/money.pipe';
import { SettlementTransaction } from '../../../../shared/models/reconciliation-item.model';
import { CandidateList } from '../../../difference-management/components/candidate-list/candidate-list';
import { DifferenceManagementService } from '../../../difference-management/data/difference-management.service';
import { BankFileDropzone } from '../../components/bank-file-dropzone/bank-file-dropzone';
import { ProcessingIndicator } from '../../components/processing-indicator/processing-indicator';
import { StatementResult } from '../../components/statement-result/statement-result';
import { BankStatementReader } from '../../data/bank-statement-reader.service';
import { BankStatementResult } from '../../data/bank-statement.util';
import { ReconciliationBankMovement, ReconciliationResultRow, ReconciliationResultStatus } from '../../data/reconciliation-result.model';
import { bankTotal, movementFromSettlement, settlementFromMovement } from '../../data/reconciliation-result.util';
import { validateNote } from './note.util';

/** Acción con la que se resuelve una línea: marcarla pendiente, ajustar el monto o reconciliar con un archivo. */
export type LineActionType = 'pendiente' | 'ajuste' | 'reconciliacion';

/** Acción registrada sobre una línea: el motivo y, al ajustar, los movimientos del banco elegidos. */
export interface LineResolution {
  rowId: string;
  type: LineActionType;
  comment: string;
  movements?: ReconciliationBankMovement[];
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

// "Reconciliar": la espera simulada del back dura 10 ticks de 500 ms.
const RECONCILE_TICK_MS = 500;
const RECONCILE_TICKS = 10;

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
    DatePipe,
    NzButtonModule,
    NzCardModule,
    NzInputModule,
    NzTableModule,
    MoneyPipe,
    CandidateList,
    BankFileDropzone,
    StatementResult,
    ProcessingIndicator,
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly reconciling = signal(false);
  protected readonly reconcileProgress = signal(0);

  protected readonly actionLabel = LINE_ACTION_LABEL;
  protected readonly isMatched = computed(() => this.row().status === 'coincide');
  protected readonly canManage = computed(() => this.access.hasPermission('manage_differences'));

  // Al ajustar, el monto del banco y la diferencia salen de la suma de lo seleccionado (aunque sea nada).
  private readonly selecting = computed(() => this.mode() === 'ajuste');

  private readonly selectedMovements = computed<ReconciliationBankMovement[]>(() =>
    this.service
      .candidates()
      .filter((candidate) => this.service.isSelected(candidate.settlement.id))
      .map((candidate) => movementFromSettlement(candidate.settlement)),
  );

  // Movimientos del banco a la vista: los ajustados y guardados, los elegidos en vivo o los del back.
  protected readonly movements = computed<readonly ReconciliationBankMovement[]>(() => {
    const saved = this.resolution();
    if (saved?.type === 'ajuste' && saved.movements) return saved.movements;
    return this.selecting() ? this.selectedMovements() : this.row().bank;
  });
  protected readonly bankAmount = computed(() => bankTotal(this.movements()));
  protected readonly difference = computed(() => round2((this.row().pos?.amount ?? 0) - this.bankAmount()));

  // Qué parte del POS cubre el banco (0 sin POS); la barra se topa en 100.
  protected readonly coverage = computed(() => {
    const pos = this.row().pos?.amount ?? 0;
    return pos > 0 ? Math.round((this.bankAmount() / pos) * 1000) / 10 : 0;
  });

  protected readonly variant = computed(() => (this.difference() === 0 ? 'success' : VARIANT[this.row().status]));

  // Solo se edita con una acción elegida y sin resolución previa.
  protected readonly noteEnabled = computed(() => this.mode() !== 'none' && this.resolution() === null && !this.reconciling());
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
    // Sin medio de pago (cruce del banco) no hay liquidaciones simuladas que sembrar.
    this.service.bindSeed(
      computed(() => this.seedOf(this.row().bank)),
      computed(() => this.seedOf(this.row().candidates)),
    );
  }

  private seedOf(movements: readonly ReconciliationBankMovement[]): SettlementTransaction[] {
    const tenderMedia = this.row().tenderMedia;
    return tenderMedia ? movements.map((movement) => settlementFromMovement(movement, tenderMedia)) : [];
  }

  protected markPending(): void {
    if (!this.canManage()) return;
    this.resolved.emit({ rowId: this.row().id, type: 'pendiente', comment: '' });
  }

  protected choose(mode: 'ajuste' | 'reconciliacion'): void {
    if (this.reconciling()) return;
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
      const movements = this.selectedMovements();
      this.service.setNote(comment);
      if (!this.service.save()) return;
      this.resolved.emit({ rowId: this.row().id, type: mode, comment, movements });
      return;
    }
    this.startReconciliation(comment);
  }

  // Simula la espera del back y, al terminar, registra la reconciliación.
  private startReconciliation(comment: string): void {
    if (this.reconciling()) return;
    this.reconcileProgress.set(0);
    this.reconciling.set(true);
    interval(RECONCILE_TICK_MS)
      .pipe(take(RECONCILE_TICKS), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tick) => this.reconcileProgress.set(((tick + 1) * 100) / RECONCILE_TICKS),
        complete: () => {
          this.reconciling.set(false);
          this.resolved.emit({ rowId: this.row().id, type: 'reconciliacion', comment });
        },
      });
  }
}
