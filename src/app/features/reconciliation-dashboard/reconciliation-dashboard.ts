import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
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
import { MOCK_SETTLEMENTS } from '../../shared/mock-data/sales-settlements.mock-data';
import { DateRangeFilter, ReconciliationService, StatusFilter, TenderMediaFilter } from './data/reconciliation.service';
import { TenderDaySummary } from './data/group-by-tender-day.util';
import { BankAccount, BANK_ACCOUNTS } from './data/bank-accounts.mock-data';
import {
  BankImportRejection,
  BankImportSummary,
  parseBankImportFile,
  simulateBankImportRejection,
  summarizeBankImport,
} from './data/bank-import.util';

// Tiempo simulado de la llamada al backend (ver `onImportFileSelected`) —
// deliberadamente perceptible para que el spinner/estado "Conectando con el
// banco…" tengan tiempo de leerse, no un valor real de ninguna API.
const IMPORT_SIMULATED_DELAY_MS = 1800;

// "Gestionar" en ambos — un mismo día+medio "no cuadra" ya sea porque el
// proveedor aún no liquida nada (`por_conciliar`) o porque lo liquidado no
// coincide con lo vendido (`desconciliado`, incluye el "Desconciliar"
// manual). "conciliado" ya está resuelto, no tiene nada que gestionar.
const ACTIONABLE_STATUSES = new Set<ReconciliationStatus>(['desconciliado', 'por_conciliar']);

@Component({
  selector: 'app-reconciliation-dashboard',
  imports: [
    CommonModule,
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
  // de un estado de cuenta completo, a diferencia del "Importar CSV" de
  // difference-management (que agrega candidatos para UNA orden puntual).
  // No hay backend real: se simula la llamada con un `setTimeout` de
  // `IMPORT_SIMULATED_DELAY_MS` (ver `onImportFileSelected`, que también
  // loguea en consola lo que el parser obtuvo del archivo) y el resultado
  // nunca se inyecta de vuelta a `MOCK_SALES`/`MOCK_SETTLEMENTS` — es un
  // resumen de la carga, no una fuente nueva de datos para la tabla (ver
  // MASTER.md).
  protected readonly bankAccounts: BankAccount[] = BANK_ACCOUNTS;

  protected readonly importTenderMediaOptions: { value: TenderMedia; label: string }[] = [
    { value: 'bbva', label: 'BBVA' },
    { value: 'rappi', label: 'Rappi' },
    { value: 'didi_food', label: 'DiDi Food' },
    { value: 'efectivo', label: 'Efectivo' },
  ];

  protected readonly importModalOpen = signal(false);
  protected readonly importTenderMedia = signal<TenderMedia | null>(null);
  protected readonly importBankAccountId = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly importSummary = signal<BankImportSummary | null>(null);
  protected readonly importRejection = signal<BankImportRejection | null>(null);
  // Nombre del archivo elegido — se muestra debajo del label del botón de
  // importación en cuanto se selecciona, independiente de si ya hay
  // resultado o todavía está "Conectando con el banco…".
  protected readonly selectedFileName = signal<string | null>(null);

  // Cuenta los intentos de ESTA sesión de la pantalla (se reinicia si se
  // navega fuera de /conciliacion y se vuelve, igual que el resto del
  // estado del componente) — "la segunda vez" del enunciado, no algo que
  // necesite sobrevivir a un refresh real.
  private importAttempts = 0;

  protected openImportModal(): void {
    this.importModalOpen.set(true);
  }

  protected closeImportModal(): void {
    this.importModalOpen.set(false);
    this.importTenderMedia.set(null);
    this.importBankAccountId.set(null);
    this.importSummary.set(null);
    this.importRejection.set(null);
    this.selectedFileName.set(null);
  }

  protected onImportTenderMediaChange(value: TenderMedia): void {
    this.importTenderMedia.set(value);
  }

  protected onImportBankAccountChange(value: string): void {
    this.importBankAccountId.set(value);
  }

  // El botón de importar (dropzone) solo se habilita con AMBOS selectores
  // completos — "una vez que los campos estén completos", tal cual se pidió
  // — y se deshabilita mientras la llamada simulada está en curso.
  protected canImportFile(): boolean {
    return this.importTenderMedia() !== null && this.importBankAccountId() !== null && !this.importing();
  }

  protected onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo dos veces seguidas

    const tenderMedia = this.importTenderMedia();
    if (!file || !tenderMedia || !this.canImportFile()) return;

    this.selectedFileName.set(file.name);
    this.importSummary.set(null);
    this.importRejection.set(null);
    this.importing.set(true);
    this.importAttempts += 1;
    const isSecondAttemptOrLater = this.importAttempts >= 2;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';

      // Un solo parseo — se loguea tal cual (lo que "se obtiene" del
      // archivo) y se reutiliza para el resumen/rechazo de abajo, en vez de
      // volver a leerlo/parsearlo por cada cosa.
      const parsed = parseBankImportFile(text);
      console.log('[Importar movimientos bancarios] archivo procesado', {
        archivo: file.name,
        medioDePago: tenderMedia,
        cuentaBancaria: this.importBankAccountId(),
        intento: this.importAttempts,
        filas: parsed.rows,
        erroresDeFormato: parsed.errors,
      });

      // Simula la latencia de una llamada real al backend.
      setTimeout(() => {
        this.importing.set(false);

        if (isSecondAttemptOrLater) {
          this.importRejection.set(simulateBankImportRejection(parsed));
          return;
        }

        const existingReferences = new Set(MOCK_SETTLEMENTS[tenderMedia].map((s) => s.orderId));
        this.importSummary.set(summarizeBankImport(parsed, existingReferences));
      }, IMPORT_SIMULATED_DELAY_MS);
    };
    reader.readAsText(file);
  }
}
