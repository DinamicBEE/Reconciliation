import { CurrencyPipe } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { COUNTRY_PROFILE } from './active-country';

/**
 * Formatea un importe en la moneda y el locale del país activo.
 *
 * @example `{{ total | money }}`, o `{{ kpi | money: '1.0-0' }}` para cifras redondas.
 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly country = inject(COUNTRY_PROFILE);
  private readonly currency = new CurrencyPipe(this.country.locale, this.country.currency);

  transform(value: number | null | undefined, digitsInfo = '1.2-2'): string | null {
    return this.currency.transform(value, this.country.currency, 'symbol-narrow', digitsInfo);
  }
}
