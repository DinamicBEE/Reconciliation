import { ReconciliationRun, ReconciliationRunStatus } from './reconciliation-run.model';
import {
  RECONCILIATION_RUN_STATUS_LABEL,
  buildRunCsv,
  canDesconciliar,
  canDownload,
  createdDay,
} from './reconciliation-run.util';

function run(overrides: Partial<ReconciliationRun> = {}): ReconciliationRun {
  return {
    id: 'CON-0001',
    code: 'CON-0001',
    createdAt: '2026-09-02',
    companyName: 'Coctel del Mar',
    storeName: 'Cóctel del Mar Chapinero',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-15',
    status: 'conciliado',
    comments: '',
    salesCount: 412,
    ...overrides,
  };
}

describe('reconciliation-run.util', () => {
  describe('RECONCILIATION_RUN_STATUS_LABEL', () => {
    it('etiqueta cada estatus en español', () => {
      expect(RECONCILIATION_RUN_STATUS_LABEL).toEqual({
        conciliado: 'Conciliado',
        pendiente: 'Pendiente',
        desconciliado: 'Desconciliado',
      });
    });
  });

  describe('canDesconciliar', () => {
    it('solo permite desconciliar una conciliación conciliada', () => {
      expect(canDesconciliar(run({ status: 'conciliado' }))).toBe(true);
      expect(canDesconciliar(run({ status: 'pendiente' }))).toBe(false);
      expect(canDesconciliar(run({ status: 'desconciliado' }))).toBe(false);
    });
  });

  describe('canDownload', () => {
    it('permite descargar las conciliaciones completadas (conciliado o desconciliado)', () => {
      expect(canDownload(run({ status: 'conciliado' }))).toBe(true);
      expect(canDownload(run({ status: 'desconciliado' }))).toBe(true);
    });

    it('no permite descargar una pendiente', () => {
      expect(canDownload(run({ status: 'pendiente' }))).toBe(false);
    });
  });

  describe('createdDay', () => {
    it("acepta 'yyyy-MM-dd' tal cual", () => {
      expect(createdDay(run({ createdAt: '2026-09-02' }))).toBe('2026-09-02');
    });

    it('con un instante ISO devuelve el día LOCAL, sin cruzar de día por UTC', () => {
      expect(createdDay(run({ createdAt: new Date(2026, 9, 1, 23, 59).toISOString() }))).toBe('2026-10-01');
      expect(createdDay(run({ createdAt: new Date(2026, 0, 1, 0, 1).toISOString() }))).toBe('2026-01-01');
    });
  });

  describe('buildRunCsv', () => {
    it('arma el encabezado y una sola fila con los datos de la conciliación', () => {
      const [header, row, ...rest] = buildRunCsv(run()).split('\n');

      expect(header).toBe('Fecha de creación,Empresa,Restaurante,Periodo inicio,Periodo fin,Estatus,Ventas');
      expect(row).toBe('2026-09-02,Coctel del Mar,Cóctel del Mar Chapinero,2026-08-01,2026-08-15,Conciliado,412');
      expect(rest).toEqual([]);
    });

    it('usa la etiqueta del estatus, no su valor interno', () => {
      const statuses: ReconciliationRunStatus[] = ['conciliado', 'pendiente', 'desconciliado'];

      for (const status of statuses) {
        const row = buildRunCsv(run({ status })).split('\n')[1];
        expect(row.split(',')[5]).toBe(RECONCILIATION_RUN_STATUS_LABEL[status]);
      }
      expect(buildRunCsv(run({ status: 'desconciliado' }))).not.toContain('desconciliado');
    });

    it('entrecomilla los valores con comas', () => {
      const csv = buildRunCsv(run({ companyName: 'Mariscos, S.A.', storeName: 'Sucursal Centro, Norte' }));

      expect(csv.split('\n')[1]).toBe(
        '2026-09-02,"Mariscos, S.A.","Sucursal Centro, Norte",2026-08-01,2026-08-15,Conciliado,412',
      );
    });

    it('escapa las comillas dobles duplicándolas', () => {
      const csv = buildRunCsv(run({ companyName: 'Pescados "El Güero"', storeName: 'Sucursal "1", Centro' }));

      expect(csv.split('\n')[1]).toBe(
        '2026-09-02,"Pescados ""El Güero""","Sucursal ""1"", Centro",2026-08-01,2026-08-15,Conciliado,412',
      );
    });

    it('no entrecomilla los valores sin caracteres especiales', () => {
      expect(buildRunCsv(run()).split('\n')[1]).not.toContain('"');
    });

    it('la columna "Ventas" lleva el número de ventas, también 0', () => {
      expect(buildRunCsv(run({ salesCount: 0 })).split('\n')[1].split(',').at(-1)).toBe('0');
    });

    it('con createdAt como instante ISO usa el día local de creación', () => {
      const createdAt = new Date(2026, 9, 1, 23, 30).toISOString();

      expect(buildRunCsv(run({ createdAt })).split('\n')[1].startsWith('2026-10-01,')).toBe(true);
    });
  });
});
