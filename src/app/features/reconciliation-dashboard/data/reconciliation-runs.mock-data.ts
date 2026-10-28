import { ReconciliationRun } from './reconciliation-run.model';

/**
 * Corridas iniciales mientras no hay endpoint; empresas y restaurantes son los de los catálogos del DEV.
 *
 * @see docs/codigo/conciliacion.md#corridas
 */
export const MOCK_RECONCILIATION_RUNS: ReconciliationRun[] = [
  { id: 'CON-0001', createdAt: '2026-09-02', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'conciliado', comments: 'Sin diferencias entre POS y banco.' },
  { id: 'CON-0002', createdAt: '2026-09-02', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H23E', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'conciliado', comments: 'Cuadró a la primera.' },
  { id: 'CON-0003', createdAt: '2026-09-04', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H69E', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'desconciliado', comments: 'Faltan 3 depósitos del banco; se pidió extracto corregido.' },
  { id: 'CON-0004', createdAt: '2026-09-09', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'conciliado', comments: '' },
  { id: 'CON-0005', createdAt: '2026-09-09', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish HCJE', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'desconciliado', comments: 'Diferencia en comisiones de Rappi.' },
  { id: 'CON-0006', createdAt: '2026-09-14', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H23E', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'conciliado', comments: 'Conciliada tras ajuste manual de 1 movimiento.' },
  { id: 'CON-0007', createdAt: '2026-10-01', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'pendiente', comments: 'En espera del extracto bancario.' },
  { id: 'CON-0008', createdAt: '2026-10-01', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H69E', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'pendiente', comments: '' },
  { id: 'CON-0009', createdAt: '2026-10-06', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish HCJE', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'conciliado', comments: 'Sin diferencias entre POS y banco.' },
  { id: 'CON-0010', createdAt: '2026-10-13', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-09-16', periodEnd: '2026-09-30', status: 'desconciliado', comments: 'Desconciliada por reverso de DiDi Food.' },
];
