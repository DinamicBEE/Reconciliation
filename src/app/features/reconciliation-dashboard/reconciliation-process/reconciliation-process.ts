import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzTableModule } from 'ng-zorro-antd/table';
import { Subscription, interval, take } from 'rxjs';
import { MoneyPipe } from '../../../core/country/money.pipe';
import { TENDER_MEDIA_LABEL } from '../../../shared/models/reconciliation-item.model';
import { BankFileDropzone } from '../components/bank-file-dropzone/bank-file-dropzone';
import { StatementResult } from '../components/statement-result/statement-result';
import { BankStatementReader } from '../data/bank-statement-reader.service';
import { BankStatementResult } from '../data/bank-statement.util';
import { ReconciliationProcessApi } from '../data/reconciliation-process-api.service';
import { ReconciliationResult, ReconciliationResultRow } from '../data/reconciliation-result.model';
import { buildResultCsv } from '../data/reconciliation-result.util';
import { ReconciliationRunsStore } from '../data/reconciliation-runs.store';
import { ConfirmLeave } from './confirm-leave.guard';
import { LINE_ACTION_LABEL, LineDetail, LineResolution } from './line-detail/line-detail';
import { ResultStatusTag } from './result-status-tag/result-status-tag';

const STEP_COUNT = 3;

// Paso "Validación": la barra sube 10% por segundo hasta el 80%; el 100% llega con la respuesta.
const VALIDATION_TICK_MS = 1000;
const VALIDATION_TICK_PCT = 10;
const VALIDATION_MAX_TICKS = 8;

// Los 3 KPI del resultado, en orden de semáforo (verde, amarillo, rojo).
const RESULT_KPIS = [
  { key: 'coincidencias', label: 'Coincidencias', variant: 'success' },
  { key: 'diferencias', label: 'Diferencias', variant: 'warning' },
  { key: 'sinCoincidencias', label: 'Sin coincidencias', variant: 'error' },
] as const;

/**
 * Proceso de 3 pasos de una conciliación (`/conciliacion/:runId/proceso`); solo avanza con "Siguiente".
 *
 * @see docs/codigo/conciliacion.md#proceso-paso-a-paso
 */
@Component({
  selector: 'app-reconciliation-process',
  imports: [
    CommonModule,
    RouterLink,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzStepsModule,
    NzCardModule,
    NzButtonModule,
    NzModalModule,
    NzProgressModule,
    NzTableModule,
    NzDrawerModule,
    LineDetail,
    ResultStatusTag,
    BankFileDropzone,
    StatementResult,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reconciliation-process.html',
  styleUrl: './reconciliation-process.scss',
})
export class ReconciliationProcess implements ConfirmLeave {
  // Ligado a :runId de la ruta (withComponentInputBinding, ver app.config.ts).
  readonly runId = input<string>();

  private readonly router = inject(Router);
  private readonly runs = inject(ReconciliationRunsStore);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly bankReader = inject(BankStatementReader);
  private readonly api = inject(ReconciliationProcessApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly run = computed(() => this.runs.find(this.runId()));

  protected readonly currentStep = signal(0);
  protected readonly isLastStep = computed(() => this.currentStep() === STEP_COUNT - 1);

  // Paso 1: extracto bancario, leído y revisado al cargarlo.
  protected readonly bankFile = signal<File | null>(null);
  protected readonly statement = signal<BankStatementResult | null>(null);
  protected readonly reading = signal(false);

  // Cada carga invalida a la anterior: el resultado de un archivo viejo no se pinta.
  private readSeq = 0;

  // Paso 2 · Validación: envío simulado de la información al back.
  protected readonly validationProgress = signal(0);
  protected readonly validationDone = signal(false);
  private validationSub: Subscription | null = null;

  // Resultado POS contra banco; al llegar reemplaza la animación de espera.
  protected readonly result = signal<ReconciliationResult | null>(null);
  protected readonly resultKpis = RESULT_KPIS;
  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;

  // Línea abierta en el drawer de detalle y acciones ya registradas por línea.
  protected readonly managing = signal<ReconciliationResultRow | null>(null);
  protected readonly resolutions = signal<ReadonlyMap<string, LineResolution>>(new Map());
  protected readonly actionLabel = LINE_ACTION_LABEL;

  // Una línea con diferencia o sin coincidencia solo se puede marcar tras una acción en su detalle.
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  private readonly rows = computed(() => this.result()?.rows ?? []);
  private readonly checkableRows = computed(() => this.rows().filter((row) => this.isCheckable(row)));
  protected readonly allRowsChecked = computed(
    () => this.result() !== null && this.rows().every((row) => this.selectedIds().has(row.id)),
  );
  // Líneas que siguen con el checkbox bloqueado: falta una acción en su detalle.
  protected readonly pendingCount = computed(() => this.rows().filter((row) => !this.isCheckable(row)).length);
  protected readonly pendingPercentage = computed(() =>
    this.rows().length === 0 ? 0 : Math.round((this.pendingCount() / this.rows().length) * 1000) / 10,
  );

  // Resumen del paso 3: los totales vienen del back; los conteos, de las acciones registradas.
  protected readonly summary = computed(() => {
    const res = this.result();
    if (!res) return null;
    const resolved = [...this.resolutions().values()].filter((r) => r.type !== 'pendiente').length;
    const reconciled = res.rows.filter((row) => row.status === 'coincide').length + resolved;
    const percentage = res.rows.length === 0 ? 0 : Math.round((reconciled / res.rows.length) * 1000) / 10;
    return { totalPos: res.totals.pos, totalBank: res.totals.bank, resolved, reconciled, percentage };
  });
  protected readonly allChecked = computed(
    () => this.checkableRows().length > 0 && this.checkableRows().every((row) => this.selectedIds().has(row.id)),
  );
  protected readonly indeterminate = computed(() => this.selectedIds().size > 0 && !this.allChecked());

  // Paso 1: extracto válido. Paso 2: respuesta del back y todas las líneas marcadas.
  protected readonly canNext = computed(() => {
    switch (this.currentStep()) {
      case 0:
        return this.statement()?.state === 'valid';
      case 1:
        return this.validationDone() && this.allRowsChecked();
      default:
        return true;
    }
  });

  // "Finalizar" sale con la confirmación ya resuelta (o sin cambios que perder).
  private allowLeave = false;
  private leaveDialogOpen = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.validationSub?.unsubscribe());
  }

  // Navega al padre, no `Location.back()`: MASTER.md "Patrón: encabezado de página".
  protected onBack(): void {
    this.router.navigateByUrl('/conciliacion');
  }

  /**
   * Pide confirmación para salir si hay un archivo cargado; lo invoca `confirmLeaveGuard`.
   *
   * @returns `false` sin abrir otro diálogo si ya hay uno abierto.
   * @see docs/codigo/conciliacion.md#proceso-paso-a-paso
   */
  confirmLeave(nextUrl: string): boolean | Promise<boolean> {
    if (this.allowLeave || this.bankFile() === null) return true;
    if (this.leaveDialogOpen) return false;

    const toReconciliation = nextUrl.split(/[?#]/)[0] === '/conciliacion';
    this.leaveDialogOpen = true;
    return new Promise<boolean>((resolve) => {
      const settle = (leave: boolean) => {
        this.leaveDialogOpen = false;
        resolve(leave);
      };
      this.modal.confirm({
        nzTitle: '¿Salir de la conciliación?',
        nzContent: `Los cambios realizados se perderán si ${toReconciliation ? 'regresas a la página de conciliación' : 'sales de esta pantalla'}. ¿Deseas continuar?`,
        nzOkText: 'Salir',
        nzOkDanger: true,
        nzCancelText: 'Cancelar',
        nzOnOk: () => settle(true),
        nzOnCancel: () => settle(false),
      });
    });
  }

  protected onNext(): void {
    if (!this.canNext()) return;
    if (this.isLastStep()) {
      this.allowLeave = true;
      this.onBack();
      return;
    }
    this.currentStep.update((step) => step + 1);
    // Al salir del paso 1 se "envía" el extracto al back.
    if (this.currentStep() === 1) this.startValidation();
  }

  private startValidation(): void {
    const run = this.run();
    const file = this.bankFile();
    const summary = this.statement()?.summary;
    if (!run || !file || !summary) return;

    this.validationSub?.unsubscribe();
    this.validationProgress.set(0);
    this.validationDone.set(false);
    this.result.set(null);
    this.selectedIds.set(new Set());
    this.resolutions.set(new Map());

    const sub = new Subscription();
    const ticker = interval(VALIDATION_TICK_MS)
      .pipe(take(VALIDATION_MAX_TICKS))
      .subscribe((tick) => this.validationProgress.set((tick + 1) * VALIDATION_TICK_PCT));
    sub.add(ticker);
    sub.add(
      this.api.submitBankStatement(run.id, file.name, summary).subscribe((response) => {
        // Si responde antes del 80%, se corta el temporizador para que la barra no retroceda.
        ticker.unsubscribe();
        this.validationProgress.set(100);
        this.result.set(response.result);
        this.validationDone.set(true);
      }),
    );
    this.validationSub = sub;
  }

  protected isCheckable(row: ReconciliationResultRow): boolean {
    return row.status === 'coincide' || this.resolutions().has(row.id);
  }

  protected onCheckAll(checked: boolean): void {
    this.selectedIds.set(new Set(checked ? this.checkableRows().map((row) => row.id) : []));
  }

  protected onCheck(row: ReconciliationResultRow, checked: boolean): void {
    if (checked && !this.isCheckable(row)) return;
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (checked) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
  }

  protected openDetail(row: ReconciliationResultRow): void {
    this.managing.set(row);
  }

  protected closeDetail(): void {
    this.managing.set(null);
  }

  // Registrar la acción habilita la marca de la línea y la marca.
  protected onLineResolved(resolution: LineResolution): void {
    this.resolutions.update((current) => new Map(current).set(resolution.rowId, resolution));
    this.selectedIds.update((current) => new Set(current).add(resolution.rowId));
    this.closeDetail();
    this.message.success(`${LINE_ACTION_LABEL[resolution.type]}.`);
  }

  // CSV con BOM UTF-8 para que Excel respete los acentos.
  protected onDownload(): void {
    const result = this.result();
    const run = this.run();
    if (!result || !run) return;
    const blob = new Blob(['﻿' + buildResultCsv(result.rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conciliacion_${run.id}_resultados.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  protected onBankFileSelected(file: File): void {
    this.bankFile.set(file);
    void this.readBankFile(file);
  }

  private async readBankFile(file: File): Promise<void> {
    const seq = ++this.readSeq;
    this.statement.set(null);
    this.reading.set(true);
    let result: BankStatementResult;
    try {
      result = await this.bankReader.read(file);
    } catch {
      result = { state: 'error', summary: null, reason: 'No se pudo leer el archivo.', missingColumns: [], invalidRows: [] };
    }
    if (seq !== this.readSeq) return;
    this.statement.set(result);
    this.reading.set(false);
  }
}
