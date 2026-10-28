import { ReconciliationLineSide, ReconciliationResultRow } from './reconciliation-result.model';
import { RECONCILIATION_RESULT_STATUS_LABEL, buildResultCsv } from './reconciliation-result.util';

const side = (amount: number): ReconciliationLineSide => ({
  reference: 'A-1',
  amount,
  concept: 'Concepto',
  paymentMethod: 'BBVA',
});

const row = (overrides: Partial<ReconciliationResultRow> = {}): ReconciliationResultRow => ({
  id: 'bbva:A-1',
  date: '2026-09-02',
  reference: 'A-1',
  tenderMedia: 'bbva',
  pos: side(100),
  bank: side(100),
  difference: 0,
  comment: 'Coincide sin diferencias.',
  status: 'coincide',
  ...overrides,
});

describe('RECONCILIATION_RESULT_STATUS_LABEL', () => {
  it('etiqueta cada estado en español', () => {
    expect(RECONCILIATION_RESULT_STATUS_LABEL).toEqual({
      coincide: 'Coincide',
      diferencia: 'Diferencia',
      sin_coincidencia: 'Sin coincidencia',
    });
  });
});

describe('buildResultCsv', () => {
  it('sin filas devuelve solo el encabezado', () => {
    expect(buildResultCsv([])).toBe('Fecha,Referencia,Medio de pago,POS,Banco,Estado');
  });

  it('escribe una línea por fila, en el mismo orden, sin salto de línea final', () => {
    const csv = buildResultCsv([
      row({ reference: 'A-1', date: '2026-09-02' }),
      row({ id: 'rappi:B-2', reference: 'B-2', date: '2026-09-01', tenderMedia: 'rappi' }),
    ]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Fecha,Referencia,Medio de pago,POS,Banco,Estado');
    expect(lines[1]).toBe('2026-09-02,A-1,BBVA,100.00,100.00,Coincide');
    expect(lines[2]).toBe('2026-09-01,B-2,Rappi,100.00,100.00,Coincide');
    expect(csv.endsWith('\n')).toBe(false);
  });

  it('los montos llevan siempre 2 decimales y no tienen formato de moneda', () => {
    const csv = buildResultCsv([row({ pos: side(1234.5), bank: side(0.1 + 0.2), status: 'diferencia' })]);

    expect(csv.split('\n')[1]).toBe('2026-09-02,A-1,BBVA,1234.50,0.30,Diferencia');
  });

  it('un lado null queda vacío (y un monto 0 no se confunde con null)', () => {
    const csv = buildResultCsv([
      row({ pos: side(80), bank: null, status: 'sin_coincidencia' }),
      row({ id: 'x', reference: 'X', pos: null, bank: side(55.25), status: 'sin_coincidencia' }),
      row({ id: 'z', reference: 'Z', pos: side(0), bank: side(0) }),
    ]);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('2026-09-02,A-1,BBVA,80.00,,Sin coincidencia');
    expect(lines[2]).toBe('2026-09-02,X,BBVA,,55.25,Sin coincidencia');
    expect(lines[3]).toBe('2026-09-02,Z,BBVA,0.00,0.00,Coincide');
  });

  it('usa la etiqueta del medio de pago y del estado', () => {
    const csv = buildResultCsv([
      row({ tenderMedia: 'didi_food', status: 'diferencia' }),
      row({ tenderMedia: 'efectivo', status: 'sin_coincidencia' }),
    ]);
    const lines = csv.split('\n');

    expect(lines[1]).toContain(',DiDi Food,');
    expect(lines[1].endsWith(',Diferencia')).toBe(true);
    expect(lines[2]).toContain(',Efectivo,');
    expect(lines[2].endsWith(',Sin coincidencia')).toBe(true);
  });

  it('escapa comas, comillas, punto y coma y saltos de línea en la referencia', () => {
    const csv = buildResultCsv([
      row({ reference: 'A,1' }),
      row({ reference: 'say "hi"' }),
      row({ reference: 'a;b' }),
      row({ reference: 'l1\nl2' }),
    ]);

    expect(csv).toContain('2026-09-02,"A,1",BBVA');
    expect(csv).toContain('2026-09-02,"say ""hi""",BBVA');
    expect(csv).toContain('2026-09-02,"a;b",BBVA');
    expect(csv).toContain('2026-09-02,"l1\nl2",BBVA');
  });

  it('no entrecomilla una referencia normal', () => {
    expect(buildResultCsv([row({ reference: 'CORTE-0827-02' })])).not.toContain('"');
  });
});
