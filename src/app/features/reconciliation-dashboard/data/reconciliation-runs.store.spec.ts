import { TestBed } from '@angular/core/testing';
import { NewReconciliationRunInput } from './reconciliation-run.model';
import { ReconciliationRunsStore } from './reconciliation-runs.store';

const INPUT: NewReconciliationRunInput = {
  companyName: 'Coctel del Mar',
  storeName: 'Cóctel del Mar Chapinero',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-15',
};

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

  describe('runs', () => {
    it('expone la semilla ordenada por fecha de creación desc y luego por id desc', () => {
      const runs = store.runs();

      expect(runs).toHaveLength(10);
      expect(runs.map((r) => r.id)).toEqual([
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

    it('a igual fecha de creación, el id mayor va primero', () => {
      const runs = store.runs();
      const same = runs.filter((r) => r.createdAt === '2026-09-09');

      expect(same.map((r) => r.id)).toEqual(['CON-0005', 'CON-0004']);
    });

    it('nunca deja una fecha más antigua antes de una más reciente', () => {
      const dates = store.runs().map((r) => r.createdAt);

      expect(dates).toEqual([...dates].sort().reverse());
    });
  });

  describe('find', () => {
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

  describe('create', () => {
    it('nace pendiente y conserva los datos del modal', () => {
      const created = store.create(INPUT, new Date(2026, 10, 5));

      expect(created).toEqual({
        ...INPUT,
        id: 'CON-0011',
        createdAt: '2026-11-05',
        status: 'pendiente',
        comments: '',
      });
    });

    it('asigna un id consecutivo tras el máximo existente', () => {
      const first = store.create(INPUT, new Date(2026, 10, 5));
      const second = store.create(INPUT, new Date(2026, 10, 5));

      expect(first.id).toBe('CON-0011');
      expect(second.id).toBe('CON-0012');
    });

    it('usa la fecha LOCAL del `now` inyectado, sin cruzar de día por UTC', () => {
      // 23:59 locales: en UTC-5/-6 `toISOString()` ya sería el día siguiente.
      expect(store.create(INPUT, new Date(2026, 10, 5, 23, 59, 59)).createdAt).toBe('2026-11-05');
      // 00:01 locales: en UTC+ `toISOString()` sería el día anterior.
      expect(store.create(INPUT, new Date(2026, 0, 1, 0, 1)).createdAt).toBe('2026-01-01');
    });

    it('rellena con ceros mes y día de un solo dígito', () => {
      expect(store.create(INPUT, new Date(2027, 2, 3)).createdAt).toBe('2027-03-03');
    });

    it('la nueva conciliación aparece primero en `runs`', () => {
      const created = store.create(INPUT, new Date(2026, 10, 5));

      expect(store.runs()).toHaveLength(11);
      expect(store.runs()[0]).toEqual(created);
    });

    it('queda localizable con `find`', () => {
      const created = store.create(INPUT, new Date(2026, 10, 5));

      expect(store.find(created.id)).toEqual(created);
    });

    it('sin `now` usa la fecha de hoy', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 11, 24, 12));
        expect(store.create(INPUT).createdAt).toBe('2026-12-24');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('markDesconciliado', () => {
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

    it('con un id inexistente no modifica nada', () => {
      const before = store.runs();

      store.markDesconciliado('CON-9999');

      expect(store.runs()).toEqual(before);
    });
  });

  describe('aislamiento entre pruebas', () => {
    it('una conciliación creada en una prueba no persiste en la siguiente (parte 1)', () => {
      store.create(INPUT, new Date(2026, 10, 5));
      store.markDesconciliado('CON-0001');

      expect(store.runs()).toHaveLength(11);
    });

    it('una conciliación creada en una prueba no persiste en la siguiente (parte 2)', () => {
      expect(store.runs()).toHaveLength(10);
      expect(store.find('CON-0001')?.status).toBe('conciliado');
    });
  });
});
