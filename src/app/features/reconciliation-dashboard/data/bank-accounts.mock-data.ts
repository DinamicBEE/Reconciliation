export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string; // enmascarado, como se vería en cualquier selector real
  accountType: 'Ahorros' | 'Corriente';
}

// Cuentas bancarias — la app está pensada para conciliaciones en Colombia,
// por eso el catálogo de bancos es colombiano, aunque el "Medio de pago"
// (`TenderMedia`) siga siendo el mismo catálogo ya usado en toda la app
// (BBVA, Rappi, DiDi Food, Efectivo). Son dos catálogos independientes que
// no se cruzan: uno es CÓMO se cobró la venta (tender media), el otro es A
// QUÉ CUENTA propia se importa el estado de cuenta bancario — nada impide
// que la cuenta "BBVA Colombia" reciba liquidaciones de cualquier medio de
// pago, no solo las marcadas `bbva`.
export const BANK_ACCOUNTS: BankAccount[] = [
  { id: 'CTA-001', bankName: 'Bancolombia', accountNumber: '••• 4821', accountType: 'Ahorros' },
  { id: 'CTA-002', bankName: 'Davivienda', accountNumber: '••• 1190', accountType: 'Corriente' },
  { id: 'CTA-003', bankName: 'Banco de Bogotá', accountNumber: '••• 7734', accountType: 'Corriente' },
  { id: 'CTA-004', bankName: 'BBVA Colombia', accountNumber: '••• 5502', accountType: 'Ahorros' },
  { id: 'CTA-005', bankName: 'Nequi', accountNumber: '••• 3390', accountType: 'Ahorros' },
];
