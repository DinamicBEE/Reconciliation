import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { Subscription, interval, map, switchMap, take, tap } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { MoneyPipe } from '../../../core/country/money.pipe';
import { BankFileDropzone } from '../components/bank-file-dropzone/bank-file-dropzone';
import { ProcessingIndicator } from '../components/processing-indicator/processing-indicator';
import { StatementResult } from '../components/statement-result/statement-result';
import { BankCatalogService } from '../data/bank-catalog.service';
import {
  BankReportApiService,
  ReconciliationConfirm,
  ReconciliationHeader,
  describeBankReportError,
  statementErrorResult,
  toReconciliationResult,
  toStatementResult,
} from '../data/bank-report-api.service';
import { BankStatementResult } from '../data/bank-statement.util';
import {
  ReconciliationBankMovement,
  ReconciliationResult,
  ReconciliationResultRow,
  ReconciliationResultStatus,
} from '../data/reconciliation-result.model';
import { ResultCsvAdjustment, bankTotal, buildResultCsv } from '../data/reconciliation-result.util';
import { ReconciliationRunsStore } from '../data/reconciliation-runs.store';
import { ReconciliationRun } from '../data/reconciliation-run.model';
import { RUN_STATUS_BY_CODE } from '../data/reconciliation-api.service';
import { ConfirmLeave } from './confirm-leave.guard';
import { LINE_ACTION_LABEL, LineDetail, LineResolution } from './line-detail/line-detail';
import { ResultStatusTag } from './result-status-tag/result-status-tag';
import { PageHeaderService } from '../../../core/layout/header/page-header.service';

const STEP_COUNT = 3;

// Paso "Validación": la barra sube 10% por segundo hasta el 80%; el 100% llega con la respuesta.
const VALIDATION_TICK_MS = 1000;
const VALIDATION_TICK_PCT = 10;
const VALIDATION_MAX_TICKS = 8;

// Los 3 KPI del resultado, en orden de semáforo; `status` es el filtro que activan.
const RESULT_KPIS = [
  { key: 'coincidencias', label: 'Coincidencias', variant: 'success', status: 'coincide' },
  { key: 'diferencias', label: 'Diferencias', variant: 'warning', status: 'diferencia' },
  {
    key: 'sinCoincidencias',
    label: 'Sin coincidencias',
    variant: 'error',
    status: 'sin_coincidencia',
  },
] as const;

/** Indicador que pone sus líneas primero en la tabla; `por_gestionar` son las de checkbox bloqueado. */
export type KpiFocus = ReconciliationResultStatus | 'por_gestionar';

/**
 * Proceso de 3 pasos de una conciliación (`/conciliacion/:runId/proceso`); solo avanza con "Siguiente".
 *
 * @see docs/codigo/conciliacion.md#proceso-paso-a-paso
 */
@Component({
  selector: 'app-reconciliation-process',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NzStepsModule,
    NzSelectModule,
    NzCardModule,
    NzButtonModule,
    NzModalModule,
    NzTableModule,
    NzDrawerModule,
    LineDetail,
    ResultStatusTag,
    BankFileDropzone,
    StatementResult,
    ProcessingIndicator,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reconciliation-process.html',
  styleUrl: './reconciliation-process.scss',
})
export class ReconciliationProcess implements ConfirmLeave {
  private readonly pageHeader = inject(PageHeaderService);
  // Ligado a :runId de la ruta (withComponentInputBinding, ver app.config.ts).
  readonly runId = input<string>();

  private readonly router = inject(Router);
  private readonly runs = inject(ReconciliationRunsStore);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly bankReports = inject(BankReportApiService);
  private readonly bankCatalog = inject(BankCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  // Si la sesión no la recibió (p. ej. tras recargar), el encabezado sale de `GET .../results`.
  private readonly remoteRun = rxResource({
    params: () => (this.runs.find(this.runId()) ? undefined : this.runId() || undefined),
    stream: ({ params: id }) =>
      this.bankReports.results(id, 1, 1).pipe(map((page) => runFromHeader(page.reconciliation))),
  });
  protected readonly run = computed(
    () =>
      this.runs.find(this.runId()) ??
      (this.remoteRun.hasValue() ? (this.remoteRun.value() ?? null) : null),
  );
  protected readonly runLoading = this.remoteRun.isLoading;
  // Confirmada: el backend ya no acepta reportes ni cruces.
  protected readonly confirmed = computed(() => this.run()?.status === 'conciliado');

  // Paso 1: banco o canal del reporte (`GET /reconciliations/banks`); por ahora un solo reporte por conciliación.
  protected readonly banks = this.bankCatalog.banks;
  protected readonly banksLoading = this.bankCatalog.loading;
  protected readonly bankCode = signal<string | null>(null);
  protected readonly bank = computed(() => this.bankCatalog.find(this.bankCode()));

  protected readonly currentStep = signal(0);
  protected readonly isLastStep = computed(() => this.currentStep() === STEP_COUNT - 1);

  // Paso 1: extracto bancario, leído y revisado al cargarlo.
  protected readonly bankFile = signal<File | null>(null);
  protected readonly statement = signal<BankStatementResult | null>(null);
  protected readonly reading = signal(false);

  // Paso 2 · Validación: carga del reporte, cruce contra las ventas y resultado (reconciliation-service).
  protected readonly validationProgress = signal(0);
  protected readonly validationDone = signal(false);
  protected readonly validationError = signal<string | null>(null);
  private validationSub: Subscription | null = null;
  private readSub: Subscription | null = null;
  private confirmSub: Subscription | null = null;

  // Paso 2 → 3: confirmación de la conciliación en el backend.
  protected readonly confirming = signal(false);
  protected readonly confirmation = signal<ReconciliationConfirm | null>(null);

  // Resultado POS contra banco; al llegar reemplaza la animación de espera.
  protected readonly result = signal<ReconciliationResult | null>(null);
  protected readonly resultKpis = RESULT_KPIS;

  // Indicador activo: sus líneas van primero en la tabla (conserva el orden dentro de cada grupo).
  protected readonly focus = signal<KpiFocus | null>(null);
  protected readonly pageIndex = signal(1);
  protected readonly tableRows = computed(() => {
    const rows = this.rows();
    const focus = this.focus();
    if (!focus) return rows;
    const matches = (row: ReconciliationResultRow) =>
      focus === 'por_gestionar' ? !this.isCheckable(row) : row.status === focus;
    return [...rows.filter(matches), ...rows.filter((row) => !matches(row))];
  });

  // Línea abierta en el drawer de detalle y acciones ya registradas por línea.
  protected readonly managing = signal<ReconciliationResultRow | null>(null);
  protected readonly resolutions = signal<ReadonlyMap<string, LineResolution>>(new Map());
  protected readonly actionLabel = LINE_ACTION_LABEL;

  // Una línea con diferencia o sin coincidencia solo se puede marcar tras una acción en su detalle.
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  private readonly rows = computed(() => this.result()?.rows ?? []);
  private readonly checkableRows = computed(() =>
    this.rows().filter((row) => this.isCheckable(row)),
  );
  protected readonly allRowsChecked = computed(
    () => this.result() !== null && this.rows().every((row) => this.selectedIds().has(row.id)),
  );
  // Líneas que siguen con el checkbox bloqueado: falta una acción en su detalle.
  protected readonly pendingCount = computed(
    () => this.rows().filter((row) => !this.isCheckable(row)).length,
  );
  protected readonly pendingPercentage = computed(() =>
    this.rows().length === 0
      ? 0
      : Math.round((this.pendingCount() / this.rows().length) * 1000) / 10,
  );

  // Resumen del paso 3: los totales vienen del back; los conteos, de las acciones registradas.
  protected readonly summary = computed(() => {
    const res = this.result();
    if (!res) return null;
    const resolved = [...this.resolutions().values()].filter((r) => r.type !== 'pendiente').length;
    const reconciled = res.rows.filter((row) => row.status === 'coincide').length + resolved;
    const percentage =
      res.rows.length === 0 ? 0 : Math.round((reconciled / res.rows.length) * 1000) / 10;
    return {
      totalPos: res.totals.pos,
      totalBank: res.totals.bank,
      resolved,
      reconciled,
      percentage,
    };
  });
  protected readonly allChecked = computed(
    () =>
      this.checkableRows().length > 0 &&
      this.checkableRows().every((row) => this.selectedIds().has(row.id)),
  );
  protected readonly indeterminate = computed(
    () => this.selectedIds().size > 0 && !this.allChecked(),
  );

  // Paso 1: extracto válido. Paso 2: respuesta del back y todas las líneas marcadas.
  protected readonly canNext = computed(() => {
    switch (this.currentStep()) {
      case 0:
        return !this.confirmed() && this.bank() !== null && this.statement()?.state === 'valid';
      case 1:
        return this.validationDone() && this.allRowsChecked() && !this.confirming();
      default:
        return true;
    }
  });

  // "Finalizar" sale con la confirmación ya resuelta (o sin cambios que perder).
  private allowLeave = false;
  private leaveDialogOpen = false;

  constructor() {
    this.pageHeader.bind(() => {
      const run = this.run();
      return {
        subtitle: run
          ? `${run.code} · ${run.storeName} · ${this.formatDate(run.periodStart)} – ${this.formatDate(run.periodEnd)}`
          : null,
      };
    });
    this.bankCatalog.ensureLoaded();
    this.destroyRef.onDestroy(() => {
      this.validationSub?.unsubscribe();
      this.readSub?.unsubscribe();
      this.confirmSub?.unsubscribe();
    });
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
    // Del paso 2 al 3 se confirma la conciliación; solo avanza si el backend la confirmó.
    if (this.currentStep() === 1) {
      this.confirmReconciliation();
      return;
    }
    this.currentStep.update((step) => step + 1);
    // Al salir del paso 1 se carga el reporte en la conciliación.
    if (this.currentStep() === 1) this.startValidation();
  }

  private confirmReconciliation(): void {
    const run = this.run();
    if (!run) return;
    this.confirming.set(true);
    this.confirmSub?.unsubscribe();
    this.confirmSub = this.bankReports.confirm(run.id).subscribe({
      next: (confirmation) => {
        this.confirming.set(false);
        this.confirmation.set(confirmation);
        this.runs.upsert([{ ...run, status: 'conciliado' }]);
        this.currentStep.set(2);
      },
      error: (err: unknown) => {
        this.confirming.set(false);
        this.message.error(describeBankReportError(err), { nzDuration: 8000 });
      },
    });
  }

  // Carga → cruce → resultado completo; la barra avanza sola hasta el 80% y el 100% llega con el resultado.
  protected startValidation(): void {
    const run = this.run();
    const file = this.bankFile();
    const bank = this.bank();
    if (!run || !file || !bank) return;

    this.validationSub?.unsubscribe();
    this.validationProgress.set(0);
    this.validationDone.set(false);
    this.validationError.set(null);
    this.result.set(null);
    this.selectedIds.set(new Set());
    this.resolutions.set(new Map());
    this.focus.set(null);
    this.pageIndex.set(1);

    const sub = new Subscription();
    const ticker = interval(VALIDATION_TICK_MS)
      .pipe(take(VALIDATION_MAX_TICKS))
      .subscribe((tick) => this.validationProgress.set((tick + 1) * VALIDATION_TICK_PCT));
    sub.add(ticker);
    sub.add(
      this.bankReports
        .uploadFile(run.id, bank.code, file)
        .pipe(
          tap((loaded) => {
            if (loaded.alreadyLoaded)
              this.message.info(
                'Este reporte ya estaba cargado: se liga a la conciliación sin guardarlo otra vez.',
              );
          }),
          switchMap(() => this.bankReports.match(run.id)),
          switchMap(() => this.bankReports.allResults(run.id)),
        )
        .subscribe({
          next: ({ summary, items }) => {
            // Si responde antes del 80%, se corta el temporizador para que la barra no retroceda.
            ticker.unsubscribe();
            this.validationProgress.set(100);
            this.result.set(toReconciliationResult(summary, items, bank.name));
            this.validationDone.set(true);
          },
          error: (err: unknown) => {
            ticker.unsubscribe();
            this.validationError.set(describeBankReportError(err));
          },
        }),
    );
    this.validationSub = sub;
  }

  // Desde el error del paso 2: vuelve al paso 1 con el mismo archivo.
  protected backToUpload(): void {
    this.validationSub?.unsubscribe();
    this.validationError.set(null);
    this.currentStep.set(0);
  }

  // Volver a pulsar el indicador activo quita el orden; siempre regresa a la página 1.
  protected toggleFocus(focus: KpiFocus): void {
    this.focus.update((current) => (current === focus ? null : focus));
    this.pageIndex.set(1);
  }

  // Movimientos del banco de la línea: los elegidos al ajustar, o los que trajo el back.
  protected movementsOf(row: ReconciliationResultRow): readonly ReconciliationBankMovement[] {
    const saved = this.resolutions().get(row.id);
    return saved?.type === 'ajuste' && saved.movements ? saved.movements : row.bank;
  }

  protected bankAmountOf(row: ReconciliationResultRow): number {
    return bankTotal(this.movementsOf(row));
  }

  protected isAdjusted(row: ReconciliationResultRow): boolean {
    return this.resolutions().get(row.id)?.type === 'ajuste';
  }

  protected noteOf(row: ReconciliationResultRow): string {
    return this.resolutions().get(row.id)?.comment ?? '';
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

  private csvAdjustments(): Map<string, ResultCsvAdjustment> {
    return new Map(
      [...this.resolutions().values()].map((r) => [
        r.rowId,
        { movements: r.type === 'ajuste' ? (r.movements ?? null) : null, note: r.comment },
      ]),
    );
  }

  // CSV con BOM UTF-8 para que Excel respete los acentos.
  protected onDownload(): void {
    const result = this.result();
    const run = this.run();
    if (!result || !run) return;
    const blob = new Blob(['﻿' + buildResultCsv(result.rows, this.csvAdjustments())], {
      type: 'text/csv;charset=utf-8;',
    });
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
    this.readBankFile(file);
  }

  // Cambiar de banco vuelve a leer el archivo ya elegido con el lector de ese banco.
  protected onBankChange(code: string | null): void {
    this.bankCode.set(code);
    const file = this.bankFile();
    if (file) this.readBankFile(file);
  }

  // Vista previa en el back (`POST /reconciliation/bank-reports/read`); una carga nueva cancela la anterior.
  private readBankFile(file: File): void {
    const bank = this.bank();
    this.readSub?.unsubscribe();
    this.statement.set(null);
    if (!bank) {
      this.reading.set(false);
      return;
    }
    this.reading.set(true);
    this.readSub = this.bankReports.read(bank.code, file).subscribe({
      next: (read) => {
        this.statement.set(toStatementResult(read));
        this.reading.set(false);
      },
      error: (err: unknown) => {
        this.statement.set(statementErrorResult(err));
        this.reading.set(false);
      },
    });
  }
}

// Conciliación mínima desde el encabezado de `GET .../results` (no trae empresa, fecha de creación ni ventas).
function runFromHeader(header: ReconciliationHeader): ReconciliationRun {
  return {
    id: String(header.id),
    code: header.code,
    createdAt: '',
    companyName: '',
    storeName: header.store.name,
    periodStart: header.periodStart,
    periodEnd: header.periodEnd,
    status: RUN_STATUS_BY_CODE[header.status.code] ?? 'pendiente',
    comments: '',
    salesCount: 0,
  };
}
