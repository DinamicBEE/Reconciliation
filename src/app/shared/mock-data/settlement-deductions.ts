import { SettlementTransaction, TenderMedia } from '../models/reconciliation-item.model';

// Comisión y retenciones que el banco/adquirente/agregador descuenta del
// importe bruto, por medio de pago — tasas ILUSTRATIVAS del mock, para que
// los movimientos traigan bruto, neto, comisiones y retenciones como los
// entregará el parser del backend (DED, CU5 paso 3 y 7.24). Rappi/DiDi: 6 %
// de comisión de plataforma (DED 7.24); tarjeta (BBVA): comisión de
// adquirencia; efectivo: depósito sin descuentos.
const DEDUCTION_RATES: Record<TenderMedia, { commission: number; withholdings: number }> = {
  bbva: { commission: 0.025, withholdings: 0.015 },
  rappi: { commission: 0.06, withholdings: 0.01 },
  didi_food: { commission: 0.06, withholdings: 0.01 },
  efectivo: { commission: 0, withholdings: 0 },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Neto = bruto − comisión − retenciones, redondeado a centavos.
export function settlementDeductions(
  tenderMedia: TenderMedia,
  grossAmount: number,
): Pick<SettlementTransaction, 'commission' | 'withholdings' | 'netAmount'> {
  const rates = DEDUCTION_RATES[tenderMedia];
  const commission = round2(grossAmount * rates.commission);
  const withholdings = round2(grossAmount * rates.withholdings);
  return { commission, withholdings, netAmount: round2(grossAmount - commission - withholdings) };
}
