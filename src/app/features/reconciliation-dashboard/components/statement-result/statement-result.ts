import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { MoneyPipe } from '../../../../core/country/money.pipe';
import { BANK_STATEMENT_STATE_LABEL, BankStatementResult, BankStatementState } from '../../data/bank-statement.util';

// Variante `.status-legend-*` de cada estado: válido verde, campos faltantes ámbar, el resto rojo.
const STATE_VARIANT: Record<BankStatementState, string> = {
  valid: 'success',
  missing_fields: 'warning',
  invalid: 'error',
  error: 'error',
};

/**
 * Resultado de revisar el extracto: loading, resumen, leyenda y el detalle de lo que falla.
 *
 * @see docs/codigo/conciliacion.md#extracto-bancario
 */
@Component({
  selector: 'app-statement-result',
  imports: [DecimalPipe, NzSpinModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './statement-result.html',
  styleUrl: './statement-result.scss',
})
export class StatementResult {
  readonly reading = input(false);
  readonly result = input<BankStatementResult | null>(null);
  /** Texto cuando todavía no hay archivo. */
  readonly placeholder = input<string | null>(null);

  protected readonly label = BANK_STATEMENT_STATE_LABEL;
  protected readonly variant = STATE_VARIANT;

  protected formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }
}
