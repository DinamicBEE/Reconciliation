import { ReconciliationRun } from './reconciliation-run.model';

/**
 * Corridas de ejemplo para las pruebas: la app las lee de `GET /reconciliations`.
 *
 * @see docs/codigo/conciliacion.md#corridas
 */
export const MOCK_RECONCILIATION_RUNS: ReconciliationRun[] = [
  { id: 'CON-0001', code: 'CON-0001', createdAt: '2026-09-02', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'conciliado', comments: 'Sin diferencias entre POS y banco.', salesCount: 412 },
  { id: 'CON-0002', code: 'CON-0002', createdAt: '2026-09-02', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H23E', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'conciliado', comments: 'Cuadró a la primera.', salesCount: 388 },
  { id: 'CON-0003', code: 'CON-0003', createdAt: '2026-09-04', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H69E', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'desconciliado', comments: 'Faltan 3 depósitos del banco; se pidió extracto corregido.', salesCount: 520 },
  { id: 'CON-0004', code: 'CON-0004', createdAt: '2026-09-09', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'conciliado', comments: '', salesCount: 401 },
  { id: 'CON-0005', code: 'CON-0005', createdAt: '2026-09-09', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish HCJE', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'desconciliado', comments: 'Diferencia en comisiones de Rappi.', salesCount: 365 },
  { id: 'CON-0006', code: 'CON-0006', createdAt: '2026-09-14', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H23E', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'conciliado', comments: 'Conciliada tras ajuste manual de 1 movimiento.', salesCount: 447 },
  { id: 'CON-0007', code: 'CON-0007', createdAt: '2026-10-01', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'pendiente', comments: 'En espera del extracto bancario.', salesCount: 290 },
  { id: 'CON-0008', code: 'CON-0008', createdAt: '2026-10-01', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish H69E', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'pendiente', comments: '', salesCount: 0 },
  { id: 'CON-0009', code: 'CON-0009', createdAt: '2026-10-06', companyName: 'Hipermar Fish', storeName: 'Hipermar Fish HCJE', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'conciliado', comments: 'Sin diferencias entre POS y banco.', salesCount: 512 },
  { id: 'CON-0010', code: 'CON-0010', createdAt: '2026-10-13', companyName: 'Coctel del Mar', storeName: 'Cóctel del Mar Chapinero', periodStart: '2026-09-16', periodEnd: '2026-09-30', status: 'desconciliado', comments: 'Desconciliada por reverso de DiDi Food.', salesCount: 433 },
];
