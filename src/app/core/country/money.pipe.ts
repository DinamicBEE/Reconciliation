import { CurrencyPipe } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { COUNTRY_PROFILE } from './active-country';

// Importe en la moneda del país activo (MXN / COP) con el formato de su
// locale — reemplaza al `currency: 'MXN' : 'symbol-narrow' : '1.2-2'`
// repetido en las plantillas. `digitsInfo` opcional, igual que `currency`
// (p. ej. `money: '1.0-0'` para cifras redondas de KPI).
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly country = inject(COUNTRY_PROFILE);
  private readonly currency = new CurrencyPipe(this.country.locale, this.country.currency);

  transform(value: number | null | undefined, digitsInfo = '1.2-2'): string | null {
    return this.currency.transform(value, this.country.currency, 'symbol-narrow', digitsInfo);
  }
}
