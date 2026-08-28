import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { MatchStatusTag } from '../../shared/components/match-status-tag/match-status-tag';
import {
  TENDER_MEDIA_LABEL,
  TenderMedia,
  TransactionMatch,
} from '../../shared/models/reconciliation-item.model';
import { APP_TODAY_ISO, MatchStatusFilter, TenderDetailService } from './data/tender-detail.service';

const VALID_TENDER_MEDIA = new Set<string>(Object.keys(TENDER_MEDIA_LABEL));

@Component({
  selector: 'app-tender-detail',
  imports: [CommonModule, FormsModule, RouterLink, NzCardModule, NzTableModule, NzSelectModule, MatchStatusTag],
  providers: [TenderDetailService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tender-detail.html',
  styleUrl: './tender-detail.scss',
})
export class TenderDetail {
  // Ligados automáticamente a :tenderMedia (path) y ?date= (query) de la ruta
  // (withComponentInputBinding en app.config.ts) — llegan como string, se
  // validan/normalizan antes de usarlos.
  readonly tenderMedia = input<string>();
  readonly date = input<string>();

  protected readonly service = inject(TenderDetailService);
  protected readonly tenderMediaLabel = TENDER_MEDIA_LABEL;
  protected readonly isToday = computed(() => (this.date() ?? APP_TODAY_ISO) === APP_TODAY_ISO);

  protected readonly isValidTenderMedia = computed(() => this.validTenderMedia() !== null);

  // Cast único y seguro tras validar contra VALID_TENDER_MEDIA — evita
  // repetir `as TenderMedia` en la plantilla.
  protected readonly validTenderMedia = computed<TenderMedia | null>(() => {
    const value = this.tenderMedia();
    return value && VALID_TENDER_MEDIA.has(value) ? (value as TenderMedia) : null;
  });

  protected readonly statusOptions: { value: MatchStatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'matched', label: 'Cruzado' },
    { value: 'sale_only', label: 'Por liquidar' },
    { value: 'amount_mismatch', label: 'Monto distinto' },
    { value: 'settlement_only', label: 'Sin venta' },
  ];

  constructor() {
    // effect (no computed): setTenderMedia/setDateFilter tienen side-effects
    // (llenan el servicio), no derivan un valor — por eso no son computed.
    effect(() => {
      const tenderMedia = this.tenderMedia();
      if (tenderMedia && VALID_TENDER_MEDIA.has(tenderMedia)) {
        this.service.setTenderMedia(tenderMedia as TenderMedia);
      }
    });

    effect(() => {
      // Entrada desde "Medios de pago" (sin ?date en la URL) → hoy.
      // Entrada desde una fila de la tabla del dashboard → la fecha de esa
      // fila, pasada como ?date=.
      this.service.setDateFilter(this.date() ?? APP_TODAY_ISO);
    });
  }

  protected difference(match: TransactionMatch): number {
    return match.difference;
  }

  protected onStatusFilterChange(value: MatchStatusFilter): void {
    this.service.setStatusFilter(value);
  }
}
