import { TestBed } from '@angular/core/testing';
import { MOCK_RECONCILIATION_RUNS } from './reconciliation-runs.mock-data';
import { ReconciliationRunsStore } from './reconciliation-runs.store';

describe('ReconciliationRunsStore', () => {
  let store: ReconciliationRunsStore;

  beforeEach(() => {
    // El store es `root`: un TestBed nuevo por prueba reinicia su estado.
    TestBed.resetTestingModule();
    store = TestBed.inject(ReconciliationRunsStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const seed = () => store.upsert(MOCK_RECONCILIATION_RUNS);

  it('arranca vacío: sin datos simulados', () => {
    expect(store.runs()).toEqual([]);
    expect(store.find('CON-0001')).toBeNull();
  });

  describe('runs', () => {
    beforeEach(seed);

    it('ordena por fecha de creación desc y luego por id desc', () => {
      expect(store.runs().map((r) => r.id)).toEqual([
        'CON-0010',
        'CON-0009',
        'CON-0008',
        'CON-0007',
        'CON-0006',
        'CON-0005',
        'CON-0004',
        'CON-0003',
        'CON-0002',
        'CON-0001',
      ]);
    });

    it('a igual fecha de creación, el id mayor va primero (comparación numérica)', () => {
      store.upsert([
        { ...MOCK_RECONCILIATION_RUNS[0], id: '9', createdAt: '2026-12-01' },
        { ...MOCK_RECONCILIATION_RUNS[0], id: '10', createdAt: '2026-12-01' },
      ]);

      expect(store.runs().slice(0, 2).map((r) => r.id)).toEqual(['10', '9']);
    });

    it('ordena instantes ISO con hora del más reciente al más antiguo', () => {
      store.upsert([
        { ...MOCK_RECONCILIATION_RUNS[0], id: '100', createdAt: '2026-12-01T08:00:00Z' },
        { ...MOCK_RECONCILIATION_RUNS[0], id: '101', createdAt: '2026-12-01T18:00:00Z' },
      ]);

      expect(store.runs().slice(0, 2).map((r) => r.id)).toEqual(['101', '100']);
    });
  });

  describe('upsert', () => {
    it('guarda las corridas recibidas', () => {
      seed();

      expect(store.runs()).toHaveLength(10);
    });

    it('reemplaza una corrida con el mismo id sin duplicarla', () => {
      seed();
      const updated = { ...MOCK_RECONCILIATION_RUNS[6], status: 'conciliado' as const, salesCount: 999 };

      store.upsert([updated]);

      expect(store.runs()).toHaveLength(10);
      expect(store.find('CON-0007')).toEqual(updated);
    });

    it('una lista vacía no cambia nada', () => {
      seed();
      const before = store.runs();

      store.upsert([]);

      expect(store.runs()).toBe(before);
    });
  });

  describe('find', () => {
    beforeEach(seed);

    it('devuelve la conciliación con ese id', () => {
      expect(store.find('CON-0003')).toMatchObject({
        id: 'CON-0003',
        storeName: 'Hipermar Fish H69E',
        status: 'desconciliado',
      });
    });

    it('devuelve null si el id no existe', () => {
      expect(store.find('CON-9999')).toBeNull();
    });

    it('devuelve null si el id es undefined, null o vacío', () => {
      expect(store.find(undefined)).toBeNull();
      expect(store.find(null)).toBeNull();
      expect(store.find('')).toBeNull();
    });
  });

  describe('markDesconciliado y withLocalStatus', () => {
    beforeEach(seed);

    it('cambia solo esa conciliación a desconciliado', () => {
      const before = store.runs();

      store.markDesconciliado('CON-0001');

      expect(store.find('CON-0001')?.status).toBe('desconciliado');
      for (const run of before.filter((r) => r.id !== 'CON-0001')) {
        expect(store.find(run.id)).toEqual(run);
      }
    });

    it('se refleja en `runs` sin alterar el orden ni la cantidad', () => {
      const idsBefore = store.runs().map((r) => r.id);

      store.markDesconciliado('CON-0009');

      expect(store.runs().map((r) => r.id)).toEqual(idsBefore);
      expect(store.runs().find((r) => r.id === 'CON-0009')?.status).toBe('desconciliado');
    });

    it('se superpone a lo que vuelve a llegar del backend', () => {
      store.markDesconciliado('CON-0001');

      store.upsert([{ ...MOCK_RECONCILIATION_RUNS[0], status: 'conciliado' }]);

      expect(store.find('CON-0001')?.status).toBe('desconciliado');
    });

    it('withLocalStatus aplica el desconciliado de la sesión a cualquier corrida con ese id', () => {
      const run = MOCK_RECONCILIATION_RUNS[1];
      expect(store.withLocalStatus(run)).toBe(run);

      store.markDesconciliado(run.id);

      expect(store.withLocalStatus(run)).toEqual({ ...run, status: 'desconciliado' });
      expect(run.status).toBe('conciliado');
    });

    it('con un id inexistente no modifica nada', () => {
      const before = store.runs();

      store.markDesconciliado('CON-9999');

      expect(store.runs()).toEqual(before);
    });
  });

  describe('aislamiento entre pruebas', () => {
    it('lo guardado en una prueba no persiste en la siguiente (parte 1)', () => {
      seed();
      store.markDesconciliado('CON-0001');

      expect(store.runs()).toHaveLength(10);
    });

    it('lo guardado en una prueba no persiste en la siguiente (parte 2)', () => {
      expect(store.runs()).toEqual([]);
      seed();
      expect(store.find('CON-0001')?.status).toBe('conciliado');
    });
  });
});
