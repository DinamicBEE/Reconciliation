/** Cuenta bancaria propia a la que se importa un estado de cuenta. */
export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string; // enmascarado, como se vería en cualquier selector real
  accountType: 'Ahorros' | 'Corriente';
}

/**
 * Cuentas bancarias mock (bancos de Colombia).
 *
 * @remarks Es un catálogo independiente de `TenderMedia`: una cuenta recibe liquidaciones de cualquier medio.
 * @see docs/codigo/conciliacion.md#datos-mock
 */
export const BANK_ACCOUNTS: BankAccount[] = [
  { id: 'CTA-001', bankName: 'Bancolombia', accountNumber: '••• 4821', accountType: 'Ahorros' },
  { id: 'CTA-002', bankName: 'Davivienda', accountNumber: '••• 1190', accountType: 'Corriente' },
  { id: 'CTA-003', bankName: 'Banco de Bogotá', accountNumber: '••• 7734', accountType: 'Corriente' },
  { id: 'CTA-004', bankName: 'BBVA Colombia', accountNumber: '••• 5502', accountType: 'Ahorros' },
  { id: 'CTA-005', bankName: 'Nequi', accountNumber: '••• 3390', accountType: 'Ahorros' },
];
