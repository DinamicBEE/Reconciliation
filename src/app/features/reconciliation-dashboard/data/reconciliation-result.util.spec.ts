import { SettlementTransaction, TENDER_MEDIA_LABEL } from '../../../shared/models/reconciliation-item.model';
import {
  ReconciliationBankMovement,
  ReconciliationLineSide,
  ReconciliationResultRow,
} from './reconciliation-result.model';
import {
  RECONCILIATION_RESULT_STATUS_LABEL,
  ResultCsvAdjustment,
  bankTotal,
  buildResultCsv,
  movementFromSettlement,
  settlementFromMovement,
} from './reconciliation-result.util';

const side = (amount: number): ReconciliationLineSide => ({
  reference: 'A-1',
  amount,
  concept: 'Concepto',
  paymentMethod: 'BBVA',
});

const movement = (amount: number, id = 'M1'): ReconciliationBankMovement => ({
  id,
  date: '2026-09-02',
  reference: `REF-${id}`,
  amount,
  concept: 'Abono',
  paymentMethod: 'BBVA',
});

const row = (overrides: Partial<ReconciliationResultRow> = {}): ReconciliationResultRow => ({
  id: 'bbva:A-1',
  date: '2026-09-02',
  reference: 'A-1',
  tenderMedia: 'bbva',
  channel: 'BBVA',
  pos: side(100),
  bank: [movement(100)],
  candidates: [],
  difference: 0,
  comment: 'Coincide sin diferencias.',
  status: 'coincide',
  ...overrides,
});

const HEADER = 'Fecha,Referencia,Medio de pago,POS,Banco,Movimientos banco,Estado,Notas';

describe('RECONCILIATION_RESULT_STATUS_LABEL', () => {
  it('etiqueta cada estado en español', () => {
    expect(RECONCILIATION_RESULT_STATUS_LABEL).toEqual({
      coincide: 'Coincide',
      diferencia: 'Diferencia',
      sin_coincidencia: 'Sin coincidencia',
    });
  });
});

describe('bankTotal', () => {
  it('sin movimientos es 0', () => {
    expect(bankTotal([])).toBe(0);
  });

  it('suma los montos de los movimientos', () => {
    expect(bankTotal([movement(100, 'a'), movement(50.5, 'b'), movement(0.25, 'c')])).toBe(150.75);
  });

  it('redondea a 2 decimales (sin ruido de punto flotante)', () => {
    expect(bankTotal([movement(0.1, 'a'), movement(0.2, 'b')])).toBe(0.3);
    expect(bankTotal([movement(10.005, 'a'), movement(0.001, 'b')])).toBe(10.01);
  });
});

describe('movementFromSettlement', () => {
  const settlement: SettlementTransaction = {
    id: 'S-1',
    date: '2026-08-27',
    orderId: 'RAPPI-LIQ-901',
    tenderMedia: 'rappi',
    amount: 83.5,
    batchId: 'B-1',
    description: 'Liquidación Rappi',
  };

  it('mapea id, fecha, referencia, monto y concepto de la liquidación', () => {
    expect(movementFromSettlement(settlement)).toEqual({
      id: 'S-1',
      date: '2026-08-27',
      reference: 'RAPPI-LIQ-901',
      amount: 83.5,
      concept: 'Liquidación Rappi',
      paymentMethod: 'Rappi',
    });
  });

  it('usa la etiqueta del medio de pago como método de pago', () => {
    expect(movementFromSettlement({ ...settlement, tenderMedia: 'didi_food' }).paymentMethod).toBe('DiDi Food');
    expect(movementFromSettlement({ ...settlement, tenderMedia: 'efectivo' }).paymentMethod).toBe('Efectivo');
  });
});

describe('settlementFromMovement', () => {
  const bankMovement: ReconciliationBankMovement = {
    id: 'CORTE-0827-02-M1',
    date: '2026-08-27',
    reference: 'CORTE-0827-02-1',
    amount: 370.35,
    concept: 'Abono 1 de 5 — CORTE-0827-02',
    paymentMethod: 'Efectivo',
  };

  it('mapea id, fecha, referencia, monto y concepto del movimiento', () => {
    expect(settlementFromMovement(bankMovement, 'efectivo')).toEqual({
      id: 'CORTE-0827-02-M1',
      date: '2026-08-27',
      orderId: 'CORTE-0827-02-1',
      tenderMedia: 'efectivo',
      amount: 370.35,
      batchId: 'LOTE-CORTE-0827-02-1',
      description: 'Abono 1 de 5 — CORTE-0827-02',
    });
  });

  it('toma el medio de pago del argumento y arma el lote como LOTE-<referencia>', () => {
    const settlement = settlementFromMovement({ ...bankMovement, reference: 'DEP-X-1' }, 'didi_food');

    expect(settlement.tenderMedia).toBe('didi_food');
    expect(settlement.batchId).toBe('LOTE-DEP-X-1');
  });

  it('ida y vuelta: movimiento -> liquidación -> movimiento devuelve el mismo movimiento', () => {
    for (const tenderMedia of ['bbva', 'rappi', 'efectivo', 'didi_food'] as const) {
      const original = { ...bankMovement, paymentMethod: TENDER_MEDIA_LABEL[tenderMedia] };

      expect(movementFromSettlement(settlementFromMovement(original, tenderMedia))).toEqual(original);
    }
  });

  it('ida y vuelta: liquidación -> movimiento -> liquidación conserva todo salvo el lote', () => {
    const settlement: SettlementTransaction = {
      id: 'S-9',
      date: '2026-09-01',
      orderId: 'RAPPI-LIQ-950',
      tenderMedia: 'rappi',
      amount: 12.5,
      batchId: 'B-9',
      description: 'Liquidación Rappi',
    };

    expect(settlementFromMovement(movementFromSettlement(settlement), 'rappi')).toEqual({
      ...settlement,
      batchId: 'LOTE-RAPPI-LIQ-950',
    });
  });
});

describe('buildResultCsv', () => {
  it('sin filas devuelve solo el encabezado', () => {
    expect(buildResultCsv([])).toBe(HEADER);
  });

  it('escribe una línea por fila, en el mismo orden, sin salto de línea final', () => {
    const csv = buildResultCsv([
      row({ reference: 'A-1', date: '2026-09-02' }),
      row({ id: 'rappi:B-2', reference: 'B-2', date: '2026-09-01', tenderMedia: 'rappi', channel: 'Rappi' }),
    ]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe('2026-09-02,A-1,BBVA,100.00,100.00,1,Coincide,');
    expect(lines[2]).toBe('2026-09-01,B-2,Rappi,100.00,100.00,1,Coincide,');
    expect(csv.endsWith('\n')).toBe(false);
  });

  it('los montos llevan siempre 2 decimales y no tienen formato de moneda', () => {
    const csv = buildResultCsv([
      row({
        pos: side(1234.5),
        bank: [movement(0.1, 'a'), movement(0.2, 'b')],
        status: 'diferencia',
      }),
    ]);

    expect(csv.split('\n')[1]).toBe('2026-09-02,A-1,BBVA,1234.50,0.30,2,Diferencia,');
  });

  it('el banco es la suma de los movimientos y se cuenta cuántos son', () => {
    const csv = buildResultCsv([
      row({ bank: [movement(60, 'a'), movement(40, 'b')] }),
      row({ id: 'x', bank: [movement(50, 'a'), movement(30, 'b'), movement(20, 'c')] }),
    ]);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('2026-09-02,A-1,BBVA,100.00,100.00,2,Coincide,');
    expect(lines[2]).toBe('2026-09-02,A-1,BBVA,100.00,100.00,3,Coincide,');
  });

  it('sin POS o sin movimientos del banco el monto queda vacío (y un 0 no se confunde con vacío)', () => {
    const csv = buildResultCsv([
      row({ pos: side(80), bank: [], status: 'sin_coincidencia' }),
      row({
        id: 'x',
        reference: 'X',
        pos: null,
        bank: [movement(55.25)],
        status: 'sin_coincidencia',
      }),
      row({ id: 'z', reference: 'Z', pos: side(0), bank: [movement(0)] }),
    ]);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('2026-09-02,A-1,BBVA,80.00,,0,Sin coincidencia,');
    expect(lines[2]).toBe('2026-09-02,X,BBVA,,55.25,1,Sin coincidencia,');
    expect(lines[3]).toBe('2026-09-02,Z,BBVA,0.00,0.00,1,Coincide,');
  });

  it('usa el canal de la fila como medio de pago y la etiqueta del estado', () => {
    const csv = buildResultCsv([
      row({ tenderMedia: 'didi_food', channel: 'DiDi Food', status: 'diferencia' }),
      row({ tenderMedia: 'efectivo', channel: 'Efectivo', status: 'sin_coincidencia' }),
    ]);
    const lines = csv.split('\n');

    expect(lines[1]).toContain(',DiDi Food,');
    expect(lines[1].endsWith(',Diferencia,')).toBe(true);
    expect(lines[2]).toContain(',Efectivo,');
    expect(lines[2].endsWith(',Sin coincidencia,')).toBe(true);
  });

  it('sin medio de pago (cruce del banco) usa el canal: franquicia o nombre del banco', () => {
    const csv = buildResultCsv([
      row({ tenderMedia: null, channel: 'VISA' }),
      row({ tenderMedia: null, channel: 'Bancolombia' }),
    ]);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('2026-09-02,A-1,VISA,100.00,100.00,1,Coincide,');
    expect(lines[2]).toBe('2026-09-02,A-1,Bancolombia,100.00,100.00,1,Coincide,');
  });

  it('escapa el canal si trae comas', () => {
    expect(buildResultCsv([row({ channel: 'Banco, S.A.' })]).split('\n')[1]).toContain(',"Banco, S.A.",');
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

  describe('con ajustes', () => {
    const adjustments = (entries: [string, ResultCsvAdjustment][]) => new Map(entries);

    it('los movimientos ajustados reemplazan a los del back en la suma y el conteo', () => {
      const original = row({
        pos: side(100),
        bank: [movement(70, 'a')],
        status: 'diferencia',
        difference: 30,
      });
      const csv = buildResultCsv(
        [original],
        adjustments([[original.id, { movements: [movement(60, 'x'), movement(40, 'y')], note: 'Cuadrado' }]]),
      );

      expect(csv.split('\n')[1]).toBe('2026-09-02,A-1,BBVA,100.00,100.00,2,Diferencia,Cuadrado');
    });

    it('un ajuste sin movimientos conserva los del back y solo aporta la nota', () => {
      const original = row({ bank: [movement(100)] });
      const csv = buildResultCsv([original], adjustments([[original.id, { movements: null, note: 'Revisado' }]]));

      expect(csv.split('\n')[1]).toBe('2026-09-02,A-1,BBVA,100.00,100.00,1,Coincide,Revisado');
    });

    it('una línea sin ajuste mantiene lo del back y la nota vacía', () => {
      const adjusted = row({ id: 'bbva:A', reference: 'A', bank: [] });
      const plain = row({ id: 'bbva:B', reference: 'B' });
      const csv = buildResultCsv(
        [adjusted, plain],
        adjustments([[adjusted.id, { movements: [movement(100)], note: 'Ok' }]]),
      );
      const lines = csv.split('\n');

      expect(lines[1]).toBe('2026-09-02,A,BBVA,100.00,100.00,1,Coincide,Ok');
      expect(lines[2]).toBe('2026-09-02,B,BBVA,100.00,100.00,1,Coincide,');
    });

    it('escapa comas, comillas y saltos de línea en las notas', () => {
      const original = row();
      const csv = buildResultCsv(
        [original],
        adjustments([[original.id, { movements: null, note: 'Dijo "ok", pero\nfalta' }]]),
      );

      expect(csv).toContain(',Coincide,"Dijo ""ok"", pero\nfalta"');
    });

    it('el mapa vacío equivale a no pasar ajustes', () => {
      const rows = [row(), row({ id: 'y', bank: [] })];

      expect(buildResultCsv(rows, new Map())).toBe(buildResultCsv(rows));
    });
  });
});
