import { TENDER_MEDIA_LABEL } from '../../../shared/models/reconciliation-item.model';
import { bankTotal } from './reconciliation-result.util';
import { MOCK_RECONCILIATION_RESULT } from './reconciliation-result.mock-data';
import { ReconciliationResultStatus } from './reconciliation-result.model';

const { total, totals, kpis, rows } = MOCK_RECONCILIATION_RESULT;

const countOf = (status: ReconciliationResultStatus) => rows.filter((r) => r.status === status).length;
const sumOf = (amounts: number[]) => Math.round(amounts.reduce((acc, n) => acc + n, 0) * 100) / 100;
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
    expect(totals.pos).toBe(sumOf(rows.map((r) => r.pos?.amount ?? 0)));
    expect(totals.bank).toBe(sumOf(rows.map((r) => bankTotal(r.bank))));
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

  it('"coincide": hay POS y movimientos, la suma del banco iguala al POS y la diferencia es 0', () => {
    for (const r of rows.filter((x) => x.status === 'coincide')) {
      expect(r.pos, r.id).not.toBeNull();
      expect(r.bank.length, r.id).toBeGreaterThan(0);
      expect(bankTotal(r.bank), r.id).toBe(r.pos!.amount);
      expect(r.difference, r.id).toBe(0);
    }
  });

  it('"diferencia": hay POS y movimientos y la suma del banco difiere del POS', () => {
    for (const r of rows.filter((x) => x.status === 'diferencia')) {
      expect(r.pos, r.id).not.toBeNull();
      expect(r.bank.length, r.id).toBeGreaterThan(0);
      expect(bankTotal(r.bank), r.id).not.toBe(r.pos!.amount);
      expect(r.difference, r.id).not.toBe(0);
    }
  });

  it('"sin_coincidencia": solo existe de un lado (venta sin liquidar o abono sin venta)', () => {
    for (const r of rows.filter((x) => x.status === 'sin_coincidencia')) {
      const missing = [r.pos === null, r.bank.length === 0].filter(Boolean).length;
      expect(missing, r.id).toBe(1);
    }
  });

  it('la diferencia es POS menos la suma del banco, con el lado ausente como 0', () => {
    for (const r of rows) {
      expect(r.difference, r.id).toBeCloseTo((r.pos?.amount ?? 0) - bankTotal(r.bank), 2);
    }
  });

  it('solo POS: diferencia positiva; solo banco: diferencia negativa', () => {
    for (const r of rows.filter((x) => x.status === 'sin_coincidencia')) {
      if (r.bank.length === 0) expect(r.difference, r.id).toBeGreaterThan(0);
      else expect(r.difference, r.id).toBeLessThan(0);
    }
  });

  it('cada línea trae un comentario del back no vacío', () => {
    for (const r of rows) {
      expect(r.comment.trim().length, r.id).toBeGreaterThan(0);
    }
  });

  it('cada línea trae medio de pago y su canal es la etiqueta de ese medio', () => {
    for (const r of rows) {
      expect(r.tenderMedia, r.id).not.toBeNull();
      expect(r.channel, r.id).toBe(TENDER_MEDIA_LABEL[r.tenderMedia!]);
    }
  });

  it('cada lado presente trae referencia, concepto y método de pago', () => {
    for (const side of rows.flatMap((r) => [r.pos, ...r.bank]).filter((x) => x !== null)) {
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

    it('el total es 57: 47 coinciden, 2 con diferencia y 8 sin coincidencia', () => {
      expect([total, countOf('coincide'), countOf('diferencia'), countOf('sin_coincidencia')]).toEqual([57, 47, 2, 8]);
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

  describe('movimientos del banco (1 a muchos)', () => {
    const EXPECTED: [string, ReconciliationResultStatus, number][] = [
      ['CORTE-0827-01', 'coincide', 2],
      ['CORTE-0827-02', 'diferencia', 5],
      ['DIDI-041', 'sin_coincidencia', 0],
      ['RAPPI-LIQ-901', 'diferencia', 5],
      ['RAPPI-LIQ-902', 'sin_coincidencia', 0],
      ['SPEI0000129981', 'coincide', 3],
      ['SPEI0000129990', 'coincide', 2],
      ['CORTE-202608260', 'coincide', 2],
      ['CORTE-202608264', 'coincide', 4],
      ['DIDI-202608261', 'coincide', 2],
    ];
    const byReference = (reference: string) => rows.find((r) => r.reference === reference);

    it.each(EXPECTED)('%s es "%s" con %i movimiento(s)', (reference, status, count) => {
      const r = byReference(reference);

      expect(r, reference).toBeDefined();
      expect(r!.status).toBe(status);
      expect(r!.bank).toHaveLength(count);
    });

    it('las 10 líneas esperadas existen una sola vez', () => {
      for (const [reference] of EXPECTED) {
        expect(
          rows.filter((r) => r.reference === reference),
          reference,
        ).toHaveLength(1);
      }
    });

    it('las de varios movimientos que coinciden suman exactamente el POS', () => {
      for (const [reference, status, count] of EXPECTED) {
        if (status !== 'coincide') continue;
        const r = byReference(reference)!;

        expect(r.bank.length, reference).toBe(count);
        expect(bankTotal(r.bank), reference).toBe(r.pos!.amount);
        expect(r.difference, reference).toBe(0);
      }
    });

    it('las de diferencia con movimientos no suman el POS y la diferencia lo refleja', () => {
      for (const reference of ['CORTE-0827-02', 'RAPPI-LIQ-901']) {
        const r = byReference(reference)!;

        expect(bankTotal(r.bank), reference).not.toBe(r.pos!.amount);
        expect(r.difference, reference).toBeCloseTo(r.pos!.amount - bankTotal(r.bank), 2);
        expect(r.difference, reference).not.toBe(0);
      }
    });

    it('las sin coincidencia de esas 10 no tienen movimientos y su diferencia es el POS', () => {
      for (const reference of ['DIDI-041', 'RAPPI-LIQ-902']) {
        const r = byReference(reference)!;

        expect(r.bank, reference).toEqual([]);
        expect(r.difference, reference).toBe(r.pos!.amount);
      }
    });

    it('los ids de los movimientos son únicos en todo el resultado', () => {
      const ids = rows.flatMap((r) => r.bank.map((m) => m.id));

      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('cada movimiento trae fecha ISO, referencia, concepto, método de pago y monto positivo', () => {
      for (const m of rows.flatMap((r) => r.bank)) {
        expect(m.date, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(m.reference.length, m.id).toBeGreaterThan(0);
        expect(m.concept.length, m.id).toBeGreaterThan(0);
        expect(m.paymentMethod.length, m.id).toBeGreaterThan(0);
        expect(m.amount, m.id).toBeGreaterThan(0);
      }
    });

    it('el resto de líneas trae 0 o 1 movimiento', () => {
      const split = new Set(EXPECTED.map(([reference]) => reference));
      for (const r of rows.filter((x) => !split.has(x.reference))) {
        expect(r.bank.length, r.id).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('movimientos candidatos (sin asignar)', () => {
    const toManage = rows.filter((r) => r.status !== 'coincide');
    const matched = rows.filter((r) => r.status === 'coincide');
    const isSynthetic = (id: string) => /-C\d+$/.test(id);

    it('las dos diferencias traen 5 movimientos del banco', () => {
      for (const reference of ['CORTE-0827-02', 'RAPPI-LIQ-901']) {
        const r = rows.find((x) => x.reference === reference)!;

        expect(r.status, reference).toBe('diferencia');
        expect(r.bank, reference).toHaveLength(5);
        expect(bankTotal(r.bank), reference).not.toBe(r.pos!.amount);
      }
    });

    it('las líneas que coinciden no traen candidatos', () => {
      expect(matched.length).toBeGreaterThan(0);
      for (const r of matched) expect(r.candidates, r.id).toEqual([]);
    });

    it('cada línea por gestionar trae exactamente 5 candidatos con ids únicos', () => {
      expect(toManage).toHaveLength(10);
      for (const r of toManage) {
        expect(r.candidates, r.id).toHaveLength(5);
        expect(new Set(r.candidates.map((c) => c.id)).size, r.id).toBe(5);
      }
    });

    it('los ids de los candidatos no se repiten con los del banco de la misma línea', () => {
      for (const r of toManage) {
        const bankIds = new Set(r.bank.map((m) => m.id));
        for (const c of r.candidates) expect(bankIds.has(c.id), `${r.id}: ${c.id}`).toBe(false);
      }
    });

    it('un candidato no es del propio pedido ni de un movimiento ya cruzado', () => {
      const coveredIds = new Set(matched.flatMap((r) => r.bank.map((m) => m.id)));
      for (const r of toManage) {
        for (const c of r.candidates) {
          expect(c.reference, `${r.id}: ${c.id}`).not.toBe(r.reference);
          expect(coveredIds.has(c.id), `${r.id}: ${c.id}`).toBe(false);
        }
      }
    });

    it('cada candidato trae fecha ISO, referencia, concepto, método de pago del medio y monto', () => {
      for (const r of toManage) {
        for (const c of r.candidates) {
          expect(c.date, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(c.reference.length, c.id).toBeGreaterThan(0);
          expect(c.concept.length, c.id).toBeGreaterThan(0);
          expect(c.paymentMethod, c.id).toBe((r.pos ?? r.bank[0]).paymentMethod);
          expect(Number.isFinite(c.amount), c.id).toBe(true);
          expect(c.amount, c.id).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('los sintéticos usan id <ref>-C<n>, referencia DEP-<ref>-<n> y el concepto "Depósito sin conciliar"', () => {
      const synthetic = toManage.flatMap((r) => r.candidates.filter((c) => isSynthetic(c.id)).map((c) => ({ r, c })));

      expect(synthetic.length).toBeGreaterThan(0);
      for (const { r, c } of synthetic) {
        const n = c.id.match(/-C(\d+)$/)![1];
        expect(c.id).toBe(`${r.reference}-C${n}`);
        expect(c.reference).toBe(`DEP-${r.reference}-${n}`);
        expect(c.concept).toBe('Depósito sin conciliar');
      }
    });

    it('los sintéticos van después de las liquidaciones reales', () => {
      for (const r of toManage) {
        const flags = r.candidates.map((c) => isSynthetic(c.id));
        expect(flags, r.id).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
      }
    });

    it('las liquidaciones reales van de la más cercana a la más lejana al monto del POS', () => {
      for (const r of toManage.filter((x) => x.pos)) {
        const real = r.candidates.filter((c) => !isSynthetic(c.id));
        const distances = real.map((c) => Math.abs(c.amount - r.pos!.amount));

        expect(distances, r.id).toEqual([...distances].sort((a, b) => a - b));
      }
    });

    it('los candidatos de las dos diferencias traen 5 movimientos para sumar a los 5 del banco (10 en total)', () => {
      const r = rows.find((x) => x.reference === 'CORTE-0827-02')!;

      expect(new Set([...r.bank, ...r.candidates].map((m) => m.id)).size).toBe(10);
    });
  });

  it('incluye la orden amount_mismatch de efectivo usada por "Gestión de diferencias"', () => {
    const order = rows.find((r) => r.tenderMedia === 'efectivo' && r.reference === 'CORTE-0827-02');
    expect(order?.status).toBe('diferencia');
  });
});
