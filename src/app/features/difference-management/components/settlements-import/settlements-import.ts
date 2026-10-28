import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TenderMedia } from '../../../../shared/models/reconciliation-item.model';
import { parseSettlementsCsv } from '../../data/csv-import.util';
import { DifferenceManagementService } from '../../data/difference-management.service';

/**
 * Botón que importa liquidaciones desde un CSV al `DifferenceManagementService` del anfitrión.
 *
 * @see docs/codigo/diferencias.md#importacion-csv
 */
@Component({
  selector: 'app-settlements-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settlements-import.html',
  styleUrl: './settlements-import.scss',
})
export class SettlementsImport {
  readonly tenderMedia = input.required<TenderMedia | null>();

  private readonly service = inject(DifferenceManagementService);
  private readonly message = inject(NzMessageService);

  protected onSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const tenderMedia = this.tenderMedia();
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!tenderMedia) return;
      const { rows, errors } = parseSettlementsCsv(text, tenderMedia);
      this.service.importSettlements(rows);
      this.service.setImportErrors(errors);

      if (rows.length > 0) this.message.success(`Se importaron ${rows.length} transacción(es) del CSV.`);
      if (errors.length > 0) this.message.warning(`${errors.length} línea(s) del CSV no se pudieron importar.`);
    };
    reader.readAsText(file);

    // Permite elegir el mismo archivo dos veces seguidas.
    input.value = '';
  }
}
