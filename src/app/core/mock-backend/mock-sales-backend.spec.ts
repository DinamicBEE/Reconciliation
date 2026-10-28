import { MOCK_SALES } from '../../features/sales-dashboard/data/sales-mock.data';
import { MOCK_UBICACIONES } from '../auth/auth-mock.data';
import {
  MOCK_RECONCILIATION_STATUS_OPTIONS,
  MOCK_TENDER_MEDIA_OPTIONS,
  captureMockSales,
  listMockSales,
} from './mock-sales-backend';

describe('listMockSales', () => {
  const all = () => listMockSales({ pageSize: 100 });

  it('devuelve todas las ventas mock con total consistente', () => {
    const page = all();

    expect(page.total).toBe(MOCK_SALES.length);
    expect(page.data).toHaveLength(MOCK_SALES.length);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(100);
  });

  it('ordena por fecha descendente', () => {
    const dates = all().data.map((s) => s.date);

    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('dateFrom y dateTo acotan el rango, inclusive', () => {
    const dates = all().data.map((s) => s.date);
    const from = [...dates].sort()[Math.floor(dates.length / 3)];
    const to = [...dates].sort()[Math.floor((dates.length * 2) / 3)];

    const page = listMockSales({ dateFrom: from, dateTo: to, pageSize: 100 });

    expect(page.total).toBe(dates.filter((d) => d >= from && d <= to).length);
    expect(page.data.every((s) => s.date >= from && s.date <= to)).toBe(true);
  });

  it('un rango sin ventas devuelve vacío', () => {
    const page = listMockSales({ dateFrom: '2000-01-01', dateTo: '2000-01-02' });

    expect(page.total).toBe(0);
    expect(page.data).toEqual([]);
  });

  it('filtra por tienda', () => {
    const storeId = all().data[0].store.id;

    const page = listMockSales({ store: storeId, pageSize: 100 });

    expect(page.total).toBeGreaterThan(0);
    expect(page.data.every((s) => s.store.id === storeId)).toBe(true);
    expect(page.total).toBe(all().data.filter((s) => s.store.id === storeId).length);
  });

  it('filtra por medio de pago principal', () => {
    for (const media of MOCK_TENDER_MEDIA_OPTIONS) {
      const page = listMockSales({ tenderMedia: media.id, pageSize: 100 });

      expect(page.data.every((s) => s.tenderMedia?.id === media.id)).toBe(true);
    }
  });

  it('filtra por estado de conciliación', () => {
    const status = MOCK_RECONCILIATION_STATUS_OPTIONS[0];

    const page = listMockSales({ status: status.id, pageSize: 100 });

    expect(page.data.every((s) => s.reconciliationStatus.code === status.code)).toBe(true);
  });

  it('los estados de todas las ventas suman el total', () => {
    const sum = MOCK_RECONCILIATION_STATUS_OPTIONS.reduce((acc, s) => acc + listMockSales({ status: s.id, pageSize: 100 }).total, 0);

    expect(sum).toBe(MOCK_SALES.length);
  });

  it('busca por folio sin distinguir mayúsculas y recortando espacios', () => {
    const folio = all().data[0].folio;

    const page = listMockSales({ search: `  ${folio.toLowerCase()} `, pageSize: 100 });

    expect(page.data.map((s) => s.folio)).toContain(folio);
    expect(page.data.every((s) => s.folio.toLowerCase().includes(folio.toLowerCase()))).toBe(true);
  });

  it('busca por nombre del cliente', () => {
    const page = listMockSales({ search: 'diego salinas', pageSize: 100 });

    expect(page.total).toBeGreaterThan(0);
    expect(page.data.every((s) => s.customer?.name.toLowerCase().includes('diego salinas'))).toBe(true);
  });

  it('una búsqueda sin coincidencias devuelve vacío', () => {
    expect(listMockSales({ search: 'zzz-no-existe' }).total).toBe(0);
  });

  it('pagina sin repetir ni perder filas y total no depende de la página', () => {
    const first = listMockSales({ page: 1, pageSize: 20 });
    const second = listMockSales({ page: 2, pageSize: 20 });
    const third = listMockSales({ page: 3, pageSize: 20 });
    const ids = [...first.data, ...second.data, ...third.data].map((s) => `${s.folio}|${s.id}`);

    expect(first.data).toHaveLength(20);
    expect(third.data).toHaveLength(MOCK_SALES.length - 40);
    expect(new Set(ids).size).toBe(ids.length);
    expect([first.total, second.total, third.total]).toEqual([MOCK_SALES.length, MOCK_SALES.length, MOCK_SALES.length]);
    expect(ids).toEqual(all().data.map((s) => `${s.folio}|${s.id}`));
  });

  it('una página fuera de rango devuelve data vacía pero conserva total', () => {
    const page = listMockSales({ page: 99, pageSize: 20 });

    expect(page.data).toEqual([]);
    expect(page.total).toBe(MOCK_SALES.length);
  });

  it('pageSize se limita a 100 y a un mínimo de 1; por defecto 20', () => {
    expect(listMockSales({ pageSize: 500 }).pageSize).toBe(100);
    expect(listMockSales({ pageSize: 0 }).pageSize).toBe(1);
    expect(listMockSales({}).pageSize).toBe(20);
    expect(listMockSales({}).data).toHaveLength(20);
  });

  it('page menor a 1 se trata como 1', () => {
    expect(listMockSales({ page: 0 }).page).toBe(1);
  });

  it('cada venta apunta a una ubicación del catálogo y tiene importes positivos', () => {
    for (const sale of all().data) {
      expect(MOCK_UBICACIONES.some((u) => u.id === sale.store.id)).toBe(true);
      expect(Number.isFinite(sale.total) && sale.total > 0 && sale.subtotal > 0).toBe(true);
    }
  });
});

describe('captureMockSales', () => {
  it('devuelve una location por ubicación, con estado OK y sin inserciones', () => {
    const result = captureMockSales({ ubicacionIds: [1, 2, 9], dateFrom: '2026-01-01', dateTo: '2026-12-31' });

    expect(result.status).toBe('OK');
    expect(result.locationsRequested).toBe(3);
    expect(result.locations.map((l) => l.ubicacionId)).toEqual([1, 2, 9]);
    expect(result.locations.every((l) => l.status === 'OK' && l.insertedCount === 0 && l.failedCount === 0)).toBe(true);
    expect(result.insertedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('sin dateTo usa dateFrom como fin', () => {
    const result = captureMockSales({ ubicacionIds: [1], dateFrom: '2026-03-05' });

    expect(result.dateFrom).toBe('2026-03-05');
    expect(result.dateTo).toBe('2026-03-05');
    expect(result.locations[0].dateTo).toBe('2026-03-05');
  });

  it('el total capturado es la suma de las locations y cuenta las ventas existentes', () => {
    const result = captureMockSales({ ubicacionIds: [1, 2, 9, 10], dateFrom: '2000-01-01', dateTo: '2100-01-01' });
    const sum = result.locations.reduce((acc, l) => acc + l.capturedCount, 0);

    expect(result.capturedCount).toBe(sum);
    expect(result.declaredCount).toBe(sum);
    expect(result.skippedCount).toBe(sum);
    expect(sum).toBe(MOCK_SALES.length);
  });

  it('sin ubicaciones devuelve cero locations', () => {
    const result = captureMockSales({ ubicacionIds: [], dateFrom: '2026-01-01' });

    expect(result.locations).toEqual([]);
    expect(result.locationsRequested).toBe(0);
    expect(result.capturedCount).toBe(0);
    expect(result.status).toBe('OK');
  });

  it('una ubicación sin ventas en el rango captura cero', () => {
    const result = captureMockSales({ ubicacionIds: [16], dateFrom: '2000-01-01' });

    expect(result.locations[0].capturedCount).toBe(0);
    expect(result.locations[0].days).toHaveLength(1);
  });
});
