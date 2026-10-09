import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { ReconciliationStatusTag } from '../../shared/components/reconciliation-status-tag/reconciliation-status-tag';
import { Sparkline } from '../../shared/components/sparkline/sparkline';
import { RadialProgress } from '../../shared/components/radial-progress/radial-progress';
import { ReconciliationStatus, TENDER_MEDIA_LABEL, TenderMedia } from '../../shared/models/reconciliation-item.model';
import { DateRangeFilter, ReconciliationService, StatusFilter, TenderMediaFilter } from './data/reconciliation.service';
import { TenderDaySummary } from './data/group-by-tender-day.util';
import { importTargetsFor } from './data/bank-accounts.mock-data';
import { BankImportApi } from './data/bank-import.api';
import {
  BankImportRejection,
  BankImportSummary,
  IMPORT_FILE_ACCEPT,
  IMPORT_ORIGINS,
  ImportOrigin,
  ImportOriginId,
  ImportTarget,
  extractImportRejection,
  isAcceptedImportFile,
  summaryFromResponse,
} from './data/bank-import.model';
import { MoneyPipe } from '../../core/country/money.pipe';
import { AccessControlService } from '../auth/data/access-control.service';

// "Gestionar" en ambos — un mismo día+medio "no cuadra" ya sea porque el
// proveedor aún no liquida nada (`por_conciliar`) o porque lo liquidado no
// coincide con lo vendido (`desconciliado`, incluye el "Desconciliar"
// manual). "conciliado" ya está resuelto, no tiene nada que gestionar.
const ACTIONABLE_STATUSES = new Set<ReconciliationStatus>(['desconciliado', 'por_conciliar']);

@Component({
  selector: 'app-reconciliation-dashboard',
  imports: [
    NzPageHeaderModule,
    CommonModule,
    MoneyPipe,
    FormsModule,
    RouterLink,
    NzCardModule,
    NzTableModule,
    NzSelectModule,
    NzDatePickerModule,
    NzButtonModule,
    NzTooltipModule,
    NzModalModule,
    NzAlertModule,
    ReconciliationStatusTag,
    Sparkline,
    RadialProgress,
  ],
  providers: [ReconciliationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reconciliation-dashboard.html',
  styleUrl: './reconciliation-dashboard.scss',
})
export class ReconciliationDashboard {
  protected readonly service = inject(ReconciliationService);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  protected readonly access = inject(AccessControlService);
  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;

  protected readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'conciliado', label: 'Conciliado' },
    { value: 'desconciliado', label: 'Desconciliado' },
    { value: 'por_conciliar', label: 'Por conciliar' },
  ];

  protected readonly tenderMediaOptions: { value: TenderMediaFilter; label: string }[] = [
    { value: 'all', label: 'Todos los medios' },
    { value: 'bbva', label: 'BBVA' },
    { value: 'rappi', label: 'Rappi' },
    { value: 'didi_food', label: 'DiDi Food' },
    { value: 'efectivo', label: 'Efectivo' },
  ];

  // KPI 2 — % conciliado, comparado contra ayer.
  protected readonly reconciledPct = computed(() => {
    const trend = this.service.reconciledPctTrend();
    const today = trend.at(-1)?.value ?? 0;
    const yesterday = trend.at(-2)?.value ?? today;
    return { today, delta: today - yesterday };
  });

  // KPI 3 — monto en discrepancia, comparado contra ayer.
  protected readonly discrepancyTrendSummary = computed(() => {
    const trend = this.service.discrepancyAmountTrend();
    const today = trend.at(-1)?.value ?? 0;
    const yesterday = trend.at(-2)?.value ?? today;
    return { today, delta: today - yesterday, values: trend.map((p) => p.value) };
  });

  protected onStatusFilterChange(value: StatusFilter): void {
    this.service.setStatusFilter(value);
  }

  protected onTenderMediaFilterChange(value: TenderMediaFilter): void {
    this.service.setTenderMediaFilter(value);
  }

  protected onDateRangeChange(value: [Date, Date] | null): void {
    this.service.setDateRange(value as DateRangeFilter);
  }

  protected tenderLabel(tenderMedia: TenderMedia): string {
    return TENDER_MEDIA_LABEL[tenderMedia];
  }

  // "Desconciliado"/"Por conciliar" abren "Gestión de diferencias" — ahí se
  // resuelve manualmente contra candidatos bancarios, siempre por orden
  // puntual, aunque la fila que se ve en esta tabla ya sea un total
  // agrupado por día + medio de pago. Solo el status decide si se muestra
  // (no `actionableOrder !== null`, a diferencia de antes): un grupo
  // "Desconciliado" a mano (ver `onDesconciliarClick`) no tiene una orden
  // con discrepancia real que ofrecer, y aun así debe mostrar "Gestionar"
  // — `resolveLink` ya trae su propio fallback para ese caso.
  protected isActionable(group: TenderDaySummary): boolean {
    return ACTIONABLE_STATUSES.has(group.status);
  }

  // `actionableOrder` es la orden CON discrepancia real (ver
  // group-by-tender-day.util.ts) — cuando no existe (grupo "Desconciliado" a
  // mano, o una anomalía `settlement_only` pura), se cae a la referencia de
  // la primera transacción bancaria del grupo, que sigue siendo un `orderId`
  // válido para la ruta aunque `difference-management` no tenga nada
  // accionable que ofrecerle (ver su propio `isUsable` — muestra un estado
  // vacío, no un error). Null solo si el grupo no tiene ninguna referencia
  // (no debería ocurrir: todo grupo tiene al menos una venta o liquidación).
  protected resolveLink(group: TenderDaySummary): unknown[] | null {
    const orderId = group.actionableOrder?.orderId ?? group.settlements[0]?.orderId ?? null;
    if (!orderId) return null;
    return ['/conciliacion', group.tenderMedia, 'diferencias', orderId];
  }

  // --- "Ver detalles"/"Desconciliar": solo para filas "Conciliado" ---
  // "Ver detalles" abre un modal de solo lectura con las transacciones
  // bancarias que componen el total liquidado ese día para ese medio de
  // pago (`group.settlements`, puede ser más de una: un lote puede llegar en
  // varios abonos, ver sales-settlements.mock-data.ts).
  protected readonly selectedGroup = signal<TenderDaySummary | null>(null);

  protected isConciliado(group: TenderDaySummary): boolean {
    return group.status === 'conciliado';
  }

  // "Desconciliar": manual, irreversible en esta sesión (no hay "volver a
  // conciliar" todavía, ver ReconciliationOverridesStore) — se confirma
  // antes, mismo patrón que onDeleteClick/onStatusChangeRequest en
  // user-list.ts.
  protected onDesconciliarClick(group: TenderDaySummary): void {
    this.modal.confirm({
      nzTitle: 'Desconciliar',
      nzContent: `¿Desconciliar <b>${this.tenderLabel(group.tenderMedia)}</b> del <b>${this.formatDate(group.date)}</b>? Pasará a la lista de pendientes por gestionar.`,
      nzOkText: 'Desconciliar',
      nzOkDanger: true,
      nzOnOk: () => {
        this.service.markDesconciliado(group);
        this.message.success(`${this.tenderLabel(group.tenderMedia)} del ${this.formatDate(group.date)} se marcó como desconciliado.`);
      },
    });
  }

  private formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  // Título del modal — por medio de pago + fecha (ya no por orden, la fila
  // que lo abre es un total agrupado). Formateo manual de la fecha (ISO
  // `YYYY-MM-DD` → `DD/MM/YYYY`) para no depender de un pipe dentro de un
  // binding de `[nzTitle]`.
  protected readonly modalTitle = computed(() => {
    const group = this.selectedGroup();
    if (!group) return '';
    return `Transacciones bancarias — ${TENDER_MEDIA_LABEL[group.tenderMedia]} · ${this.formatDate(group.date)}`;
  });

  protected openDetails(group: TenderDaySummary): void {
    this.selectedGroup.set(group);
  }

  protected closeDetails(): void {
    this.selectedGroup.set(null);
  }

  // --- "Importar movimientos bancarios" -----------------------------------
  // Botón propio arriba de la tabla (no una fila de acción) — carga masiva
  // de un estado de cuenta o liquidación completo (DED, CU5), a diferencia
  // del "Importar CSV" de difference-management (que agrega candidatos para
  // UNA orden puntual). El frontend no lee ni normaliza el archivo: lo envía
  // tal cual al backend con su origen y cuenta/lote (`BankImportApi`, hoy
  // simulado) y muestra el resultado — el import no se inyecta de vuelta a
  // `MOCK_SETTLEMENTS` (ver MASTER.md).
  private readonly bankImportApi = inject(BankImportApi);
  protected readonly importOrigins: ImportOrigin[] = IMPORT_ORIGINS;
  protected readonly importFileAccept = IMPORT_FILE_ACCEPT;

  protected readonly importModalOpen = signal(false);
  protected readonly importOrigin = signal<ImportOriginId | null>(null);
  protected readonly importTargetId = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importSummary = signal<BankImportSummary | null>(null);
  protected readonly importRejection = signal<BankImportRejection | null>(null);
  // Nombre del archivo elegido — se muestra debajo del label del botón de
  // importación en cuanto se selecciona, independiente de si ya hay
  // resultado o todavía se está enviando.
  protected readonly selectedFileName = signal<string | null>(null);

  // Opciones de "Cuenta/lote" — dependen del origen: cuentas bancarias del
  // banco del origen, o lotes de liquidación (Rappi).
  protected readonly importTargets = computed<ImportTarget[]>(() => {
    const origin = this.importOrigin();
    return origin ? importTargetsFor(origin) : [];
  });

  protected readonly importTargetPlaceholder = computed(() => {
    const origin = IMPORT_ORIGINS.find((o) => o.id === this.importOrigin());
    if (!origin) return 'Selecciona primero un origen';
    return origin.targetKind === 'batch' ? 'Selecciona un lote de liquidación' : 'Selecciona una cuenta bancaria';
  });

  protected openImportModal(): void {
    // Matriz 7.16 del DED: "Carga de extractos y liquidaciones" requiere
    // `import_settlements` propio — hoy coincide con quien ve la pantalla
    // (`view_reconciliation`, solo Admin/Tesorería tienen ambos), pero ahora
    // se evalúa de verdad en vez de depender de esa coincidencia. El botón
    // en el template ya lo oculta; este guard es defensa en profundidad.
    if (!this.access.hasPermission('import_settlements')) return;
    this.importModalOpen.set(true);
  }

  protected closeImportModal(): void {
    this.importModalOpen.set(false);
    this.importOrigin.set(null);
    this.importTargetId.set(null);
    this.importSummary.set(null);
    this.importRejection.set(null);
    this.selectedFileName.set(null);
  }

  // Cambiar el origen invalida la cuenta/lote elegida (pertenece a otro
  // origen).
  protected onImportOriginChange(value: ImportOriginId): void {
    this.importOrigin.set(value);
    this.importTargetId.set(null);
  }

  protected onImportTargetChange(value: string): void {
    this.importTargetId.set(value);
  }

  // El botón de importar (dropzone) solo se habilita con origen y
  // cuenta/lote elegidos, y se deshabilita mientras el envío está en curso.
  protected canImportFile(): boolean {
    return this.importOrigin() !== null && this.importTargetId() !== null && !this.importing();
  }

  protected onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo dos veces seguidas

    const origin = IMPORT_ORIGINS.find((o) => o.id === this.importOrigin());
    const targetId = this.importTargetId();
    if (!file || !origin || !targetId || !this.canImportFile()) return;

    this.selectedFileName.set(file.name);
    this.importSummary.set(null);
    this.importRejection.set(null);

    // Única validación del lado del frontend: la extensión (CSV, Excel o
    // TXT). Estructura, separador y contenido los valida el backend.
    if (!isAcceptedImportFile(file.name)) {
      this.importRejection.set({ line: 0, reason: 'formato no admitido. Usa un archivo .csv, .xlsx, .xls o .txt.' });
      return;
    }

    this.importing.set(true);
    this.bankImportApi.upload({ origin: origin.id, targetKind: origin.targetKind, targetId, file }).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importSummary.set(summaryFromResponse(res));
      },
      error: (err: unknown) => {
        this.importing.set(false);
        this.importRejection.set(
          extractImportRejection(err) ?? { line: 0, reason: 'no se pudo enviar el archivo. Intenta de nuevo.' },
        );
      },
    });
  }

}
