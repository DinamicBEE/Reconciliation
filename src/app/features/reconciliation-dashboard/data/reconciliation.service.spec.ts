import { TestBed } from '@angular/core/testing';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationRunsStore } from './reconciliation-runs.store';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let store: ReconciliationRunsStore;

  beforeEach(() => {
    // Store real (root) + servicio provisto por componente: TestBed nuevo por prueba.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ReconciliationService] });
    service = TestBed.inject(ReconciliationService);
    store = TestBed.inject(ReconciliationRunsStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const ids = () => service.filteredRuns().map((r) => r.id);

  describe('filteredRuns', () => {
    it('sin filtros devuelve todas las conciliaciones, la más reciente primero', () => {
      expect(service.statusFilter()).toBe('all');
      expect(service.dateRange()).toBeNull();
      expect(service.filteredRuns()).toEqual(store.runs());
      expect(service.filteredRuns()).toHaveLength(10);
    });

    describe('filtro de estatus', () => {
      it("'all' no filtra", () => {
        service.setStatusFilter('conciliado');
        service.setStatusFilter('all');

        expect(service.filteredRuns()).toHaveLength(10);
      });

      it('deja solo las conciliadas', () => {
        service.setStatusFilter('conciliado');

        expect(ids()).toEqual(['CON-0009', 'CON-0006', 'CON-0004', 'CON-0002', 'CON-0001']);
      });

      it('deja solo las pendientes', () => {
        service.setStatusFilter('pendiente');

        expect(ids()).toEqual(['CON-0008', 'CON-0007']);
      });

      it('deja solo las desconciliadas', () => {
        service.setStatusFilter('desconciliado');

        expect(ids()).toEqual(['CON-0010', 'CON-0005', 'CON-0003']);
      });

      it('refleja un cambio de estatus hecho en el store', () => {
        service.setStatusFilter('desconciliado');
        store.markDesconciliado('CON-0001');

        expect(ids()).toContain('CON-0001');
      });
    });

    describe('filtro de rango de fechas (fecha de creación)', () => {
      it('incluye ambos extremos', () => {
        // Creadas el 2 (0001, 0002) y el 9 de septiembre (0004, 0005) y el 4 (0003).
        service.setDateRange([new Date(2026, 8, 2), new Date(2026, 8, 9)]);

        expect(ids()).toEqual(['CON-0005', 'CON-0004', 'CON-0003', 'CON-0002', 'CON-0001']);
      });

      it('incluye el día final aunque el extremo traiga hora', () => {
        service.setDateRange([new Date(2026, 8, 2, 18, 30), new Date(2026, 8, 9, 0, 0)]);

        expect(ids()).toEqual(['CON-0005', 'CON-0004', 'CON-0003', 'CON-0002', 'CON-0001']);
      });

      it('excluye lo creado fuera del rango', () => {
        service.setDateRange([new Date(2026, 8, 3), new Date(2026, 8, 8)]);

        expect(ids()).toEqual(['CON-0003']);
      });

      it('un rango de un solo día devuelve las creadas ese día', () => {
        service.setDateRange([new Date(2026, 9, 1), new Date(2026, 9, 1)]);

        expect(ids()).toEqual(['CON-0008', 'CON-0007']);
      });

      it('un rango sin coincidencias devuelve una lista vacía', () => {
        service.setDateRange([new Date(2026, 0, 1), new Date(2026, 0, 31)]);

        expect(service.filteredRuns()).toEqual([]);
      });

      it('filtra por creación, no por el periodo conciliado', () => {
        // Los periodos son de agosto; ninguna se creó en agosto.
        service.setDateRange([new Date(2026, 7, 1), new Date(2026, 7, 31)]);

        expect(service.filteredRuns()).toEqual([]);
      });

      it('al limpiar el rango (null) vuelve a mostrar todo', () => {
        service.setDateRange([new Date(2026, 8, 3), new Date(2026, 8, 8)]);
        service.setDateRange(null);

        expect(service.filteredRuns()).toHaveLength(10);
      });
    });

    describe('combinación de filtros', () => {
      it('aplica estatus y rango a la vez', () => {
        service.setStatusFilter('conciliado');
        service.setDateRange([new Date(2026, 8, 2), new Date(2026, 8, 9)]);

        expect(ids()).toEqual(['CON-0004', 'CON-0002', 'CON-0001']);
      });

      it('devuelve vacío si ninguna cumple ambos', () => {
        service.setStatusFilter('pendiente');
        service.setDateRange([new Date(2026, 8, 1), new Date(2026, 8, 30)]);

        expect(service.filteredRuns()).toEqual([]);
      });
    });
  });

  describe('setDateRange', () => {
    it('conserva un rango completo', () => {
      const range: [Date, Date] = [new Date(2026, 8, 2), new Date(2026, 8, 9)];

      service.setDateRange(range);

      expect(service.dateRange()).toBe(range);
    });

    it('normaliza [undefined, undefined] (botón "x" del range-picker) a null', () => {
      service.setDateRange([new Date(2026, 8, 2), new Date(2026, 8, 9)]);

      service.setDateRange([undefined, undefined] as unknown as [Date, Date]);

      expect(service.dateRange()).toBeNull();
      expect(service.filteredRuns()).toHaveLength(10);
    });

    it('normaliza un rango a medias (un extremo vacío) a null', () => {
      service.setDateRange([new Date(2026, 8, 2), undefined] as unknown as [Date, Date]);
      expect(service.dateRange()).toBeNull();

      service.setDateRange([undefined, new Date(2026, 8, 2)] as unknown as [Date, Date]);
      expect(service.dateRange()).toBeNull();
    });

    it('null se queda en null', () => {
      service.setDateRange(null);

      expect(service.dateRange()).toBeNull();
    });
  });

  describe('create y markDesconciliado', () => {
    it('create delega en el store y la nueva conciliación aparece en la tabla', () => {
      const created = service.create({
        companyName: 'Hipermar Fish',
        storeName: 'Hipermar Fish H23E',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-15',
      });

      expect(created.status).toBe('pendiente');
      expect(store.find(created.id)).toEqual(created);
      expect(service.filteredRuns()[0]).toEqual(created);
    });

    it('markDesconciliado cambia el estatus de esa conciliación en el store', () => {
      const run = store.find('CON-0004')!;

      service.markDesconciliado(run);

      expect(store.find('CON-0004')?.status).toBe('desconciliado');
      expect(store.find('CON-0002')?.status).toBe('conciliado');
    });
  });
});
