import { MOCK_RECONCILIATION_RESULT } from './reconciliation-result.mock-data';
import { ReconciliationResultStatus } from './reconciliation-result.model';

const { total, totals, kpis, rows } = MOCK_RECONCILIATION_RESULT;

const countOf = (status: ReconciliationResultStatus) => rows.filter((r) => r.status === status).length;
const round1 = (value: number) => Math.round(value * 10) / 10;

describe('MOCK_RECONCILIATION_RESULT', () => {
  it('trae líneas y el total coincide con ellas', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(total).toBe(rows.length);
  });

  it('los conteos de los 3 KPI suman el total y salen de las líneas', () => {
    expect(kpis.coincidencias.count + kpis.diferencias.count + kpis.sinCoincidencias.count).toBe(total);
    expect(kpis.coincidencias.count).toBe(countOf('coincide'));
    expect(kpis.diferencias.count).toBe(countOf('diferencia'));
    expect(kpis.sinCoincidencias.count).toBe(countOf('sin_coincidencia'));
  });

  it('los porcentajes son count/total*100 con un decimal', () => {
    expect(kpis.coincidencias.percentage).toBe(round1((kpis.coincidencias.count / total) * 100));
    expect(kpis.diferencias.percentage).toBe(round1((kpis.diferencias.count / total) * 100));
    expect(kpis.sinCoincidencias.percentage).toBe(round1((kpis.sinCoincidencias.count / total) * 100));
  });

  it('hay al menos una línea de cada estado (la demo cubre los 3 casos)', () => {
    expect(kpis.coincidencias.count).toBeGreaterThan(0);
    expect(kpis.diferencias.count).toBeGreaterThan(0);
    expect(kpis.sinCoincidencias.count).toBeGreaterThan(0);
  });

  it('totals.pos y totals.bank son la suma de los montos de cada lado, con 2 decimales', () => {
    const sumOf = (amounts: number[]) => Math.round(amounts.reduce((acc, n) => acc + n, 0) * 100) / 100;

    expect(totals.pos).toBe(sumOf(rows.map((r) => r.pos?.amount ?? 0)));
    expect(totals.bank).toBe(sumOf(rows.map((r) => r.bank?.amount ?? 0)));
    expect(totals.pos).toBeGreaterThan(0);
    expect(totals.bank).toBeGreaterThan(0);
    expect(Math.round(totals.pos * 100)).toBeCloseTo(totals.pos * 100, 6);
    expect(Math.round(totals.bank * 100)).toBeCloseTo(totals.bank * 100, 6);
  });

  it('totals.pos menos totals.bank es la suma de las diferencias de las líneas', () => {
    const diffs = rows.reduce((acc, r) => acc + r.difference, 0);

    expect(totals.pos - totals.bank).toBeCloseTo(diffs, 2);
  });

  it('los ids son únicos', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('cada línea tiene fecha ISO y referencia', () => {
    for (const r of rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.reference.length).toBeGreaterThan(0);
    }
  });

  it('"coincide": POS y banco existen, con el mismo monto y diferencia 0', () => {
    for (const r of rows.filter((x) => x.status === 'coincide')) {
      expect(r.pos, r.id).not.toBeNull();
      expect(r.bank, r.id).not.toBeNull();
      expect(r.pos!.amount, r.id).toBe(r.bank!.amount);
      expect(r.difference, r.id).toBe(0);
    }
  });

  it('"diferencia": POS y banco existen y los montos difieren', () => {
    for (const r of rows.filter((x) => x.status === 'diferencia')) {
      expect(r.pos, r.id).not.toBeNull();
      expect(r.bank, r.id).not.toBeNull();
      expect(r.pos!.amount, r.id).not.toBe(r.bank!.amount);
      expect(r.difference, r.id).not.toBe(0);
    }
  });

  it('"sin_coincidencia": solo existe de un lado (venta sin liquidar o abono sin venta)', () => {
    for (const r of rows.filter((x) => x.status === 'sin_coincidencia')) {
      const nulls = [r.pos, r.bank].filter((side) => side === null).length;
      expect(nulls, r.id).toBe(1);
    }
  });

  it('la diferencia es POS menos banco, con el lado ausente como 0', () => {
    for (const r of rows) {
      expect(r.difference, r.id).toBeCloseTo((r.pos?.amount ?? 0) - (r.bank?.amount ?? 0), 2);
    }
  });

  it('solo POS: diferencia positiva; solo banco: diferencia negativa', () => {
    for (const r of rows.filter((x) => x.status === 'sin_coincidencia')) {
      if (r.bank === null) expect(r.difference, r.id).toBeGreaterThan(0);
      else expect(r.difference, r.id).toBeLessThan(0);
    }
  });

  it('cada línea trae un comentario del back no vacío', () => {
    for (const r of rows) {
      expect(r.comment.trim().length, r.id).toBeGreaterThan(0);
    }
  });

  it('cada lado presente trae referencia, concepto y método de pago', () => {
    for (const side of rows.flatMap((r) => [r.pos, r.bank]).filter((x) => x !== null)) {
      expect(side.reference.length).toBeGreaterThan(0);
      expect(side.concept.length).toBeGreaterThan(0);
      expect(side.paymentMethod.length).toBeGreaterThan(0);
    }
  });

  it('las filas van ordenadas por fecha descendente', () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].date >= rows[i].date, `${rows[i - 1].id} antes de ${rows[i].id}`).toBe(true);
    }
  });

  describe('líneas por gestionar', () => {
    // Posición base 0 de cada línea no `coincide` en la lista ordenada.
    const manageable = rows.map((r, index) => ({ r, index })).filter(({ r }) => r.status !== 'coincide');

    it('hay exactamente 10 líneas que no coinciden', () => {
      expect(manageable).toHaveLength(10);
      expect(countOf('diferencia') + countOf('sin_coincidencia')).toBe(10);
    });

    it('el total es 57: 47 coinciden, 1 con diferencia y 9 sin coincidencia', () => {
      expect([total, countOf('coincide'), countOf('diferencia'), countOf('sin_coincidencia')]).toEqual([57, 47, 1, 9]);
    });

    it('ninguna cae después de la posición 30 (solo páginas 1 a 3 de 10)', () => {
      for (const { r, index } of manageable) expect(index, r.id).toBeLessThan(30);
    });

    it('cada una de las páginas 1, 2 y 3 tiene al menos una', () => {
      for (const page of [0, 1, 2]) {
        const inPage = manageable.filter(({ index }) => Math.floor(index / 10) === page);
        expect(inPage.length, `página ${page + 1}`).toBeGreaterThan(0);
      }
    });
  });

  it('incluye la orden amount_mismatch de efectivo usada por "Gestión de diferencias"', () => {
    const order = rows.find((r) => r.tenderMedia === 'efectivo' && r.reference === 'CORTE-0827-02');
    expect(order?.status).toBe('diferencia');
  });
});
