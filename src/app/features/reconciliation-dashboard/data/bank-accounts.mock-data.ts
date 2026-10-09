import { MOCK_SETTLEMENTS } from '../../../shared/mock-data/sales-settlements.mock-data';
import { IMPORT_ORIGINS, ImportOriginId, ImportTarget } from './bank-import.model';

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string; // enmascarado, como se vería en cualquier selector real
  accountType: 'Ahorros' | 'Corriente';
}

// Cuentas bancarias propias contra las que se cargan los extractos — las de
// los bancos de los orígenes del DED (Bancolombia, Davivienda, Banco Caja
// Social). En el flujo real llegan de `GET /bank-accounts` (ver
// docs/api-endpoints.csv).
export const BANK_ACCOUNTS: BankAccount[] = [
  { id: 'CTA-001', bankName: 'Bancolombia', accountNumber: '••• 4821', accountType: 'Ahorros' },
  { id: 'CTA-002', bankName: 'Bancolombia', accountNumber: '••• 9035', accountType: 'Corriente' },
  { id: 'CTA-003', bankName: 'Davivienda', accountNumber: '••• 1190', accountType: 'Corriente' },
  { id: 'CTA-004', bankName: 'Banco Caja Social', accountNumber: '••• 2208', accountType: 'Ahorros' },
];

// Lotes de liquidación Rappi — los mismos `batchId` que ya traen las
// liquidaciones Rappi del mock (`MOCK_SETTLEMENTS`), más recientes primero.
const RAPPI_BATCHES: ImportTarget[] = [...new Set(MOCK_SETTLEMENTS.rappi.map((s) => s.batchId))]
  .sort()
  .reverse()
  .map((batchId) => ({ id: batchId, label: `Lote ${batchId}` }));

// Opciones del selector "Cuenta/lote" para un origen: sus cuentas bancarias
// (extractos de banco/adquirencia) o sus lotes (liquidación de agregador).
export function importTargetsFor(originId: ImportOriginId): ImportTarget[] {
  const origin = IMPORT_ORIGINS.find((o) => o.id === originId);
  if (!origin) return [];
  if (origin.targetKind === 'batch') return RAPPI_BATCHES;
  return BANK_ACCOUNTS.filter((a) => a.bankName === origin.bankName).map((a) => ({
    id: a.id,
    label: `${a.bankName} ${a.accountType} ${a.accountNumber}`,
  }));
}
