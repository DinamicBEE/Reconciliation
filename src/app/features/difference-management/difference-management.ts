import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { MatchStatusTag } from '../../shared/components/match-status-tag/match-status-tag';
import { DifferenceManagementService } from './data/difference-management.service';
import { CandidateList } from './components/candidate-list/candidate-list';
import { SettlementsImport } from './components/settlements-import/settlements-import';
import { TENDER_MEDIA_LABEL, TenderMedia } from '../../shared/models/reconciliation-item.model';
import { MoneyPipe } from '../../core/country/money.pipe';
import { COUNTRY_PROFILE } from '../../core/country/active-country';
import { AccessControlService } from '../../core/auth/access-control.service';
import { PageHeaderService } from '../../core/layout/header/page-header.service';

const VALID_TENDER_MEDIA = new Set<string>(Object.keys(TENDER_MEDIA_LABEL));

/**
 * Resolución manual del cruce de una orden `sale_only` o `amount_mismatch`.
 *
 * @see docs/codigo/diferencias.md#pantalla
 */
@Component({
  selector: 'app-difference-management',
  imports: [
    CommonModule,
    MoneyPipe,
    FormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzInputModule,
    NzModalModule,
    MatchStatusTag,
    CandidateList,
    SettlementsImport,
  ],
  providers: [DifferenceManagementService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './difference-management.html',
  styleUrl: './difference-management.scss',
})
export class DifferenceManagement {
  private readonly pageHeader = inject(PageHeaderService);
  // Ligados a :tenderMedia/:orderId de la ruta (withComponentInputBinding).
  readonly tenderMedia = input<string>();
  readonly orderId = input<string>();

  protected readonly service = inject(DifferenceManagementService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  private readonly country = inject(COUNTRY_PROFILE);
  protected readonly access = inject(AccessControlService);

  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;
  protected readonly noteTouched = signal(false);

  protected readonly validTenderMedia = computed<TenderMedia | null>(() => {
    const value = this.tenderMedia();
    return value && VALID_TENDER_MEDIA.has(value) ? (value as TenderMedia) : null;
  });

  // Falso con tender inválido, orden inexistente o ya resuelta: se muestra el estado vacío.
  protected readonly isUsable = computed(() => {
    const order = this.service.order();
    return this.validTenderMedia() !== null && order !== null && (order.status === 'sale_only' || order.status === 'amount_mismatch');
  });

  constructor() {
    this.pageHeader.bind(() => ({ title: 'Gestión de diferencias — Orden ' + (this.orderId() ?? '') }));
    // Sin `effect` que copie la ruta al servicio (ADR-0002, punto 6).
    this.service.bindOrder(
      this.validTenderMedia,
      computed(() => (this.validTenderMedia() ? (this.orderId() ?? null) : null)),
    );
  }

  protected onNoteChange(value: string): void {
    this.service.setNote(value);
  }

  protected onNoteBlur(): void {
    this.noteTouched.set(true);
  }

  // Se confirma antes: el guardado reasigna liquidaciones y no se deshace.
  protected onSave(): void {
    this.noteTouched.set(true);
    // Requiere `manage_differences` (además del botón deshabilitado).
    // Ver docs/codigo/diferencias.md#permisos
    if (!this.access.hasPermission('manage_differences')) return;
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
    return new Intl.NumberFormat(this.country.locale, { style: 'currency', currency: this.country.currency }).format(amount);
  }
}
