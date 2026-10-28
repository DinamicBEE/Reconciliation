import {
  BANCOLOMBIA_COLUMNS,
  BANK_STATEMENT_STATE_LABEL,
  analyzeBancolombiaReport,
} from './bank-statement.util';

const TOTAL_INDEX = BANCOLOMBIA_COLUMNS.indexOf('VALOR TOTAL');
const DATE_INDEX = BANCOLOMBIA_COLUMNS.indexOf('FECHA DE CANJE');

type Cell = string | number | null | undefined;

// Encabezado válido de 27 columnas.
function header(): Cell[] {
  return [...BANCOLOMBIA_COLUMNS];
}

// Movimiento de 27 columnas: solo VALOR TOTAL y FECHA DE CANJE importan.
function movement(total: Cell, canje: Cell): Cell[] {
  const row: Cell[] = BANCOLOMBIA_COLUMNS.map(() => 'x');
  row[TOTAL_INDEX] = total;
  row[DATE_INDEX] = canje;
  return row;
}

function emptyRow(): Cell[] {
  return BANCOLOMBIA_COLUMNS.map(() => null);
}

describe('BANCOLOMBIA_COLUMNS', () => {
  it('tiene las 27 columnas del reporte, con VALOR TOTAL en la N y FECHA DE CANJE en la H', () => {
    expect(BANCOLOMBIA_COLUMNS).toHaveLength(27);
    expect(TOTAL_INDEX).toBe(13);
    expect(DATE_INDEX).toBe(7);
  });
});

describe('BANK_STATEMENT_STATE_LABEL', () => {
  it('etiqueta cada estado', () => {
    expect(BANK_STATEMENT_STATE_LABEL).toEqual({
      valid: 'Archivo válido',
      invalid: 'Archivo inválido',
      missing_fields: 'Campos faltantes',
      error: 'Error en el archivo',
    });
  });
});

describe('analyzeBancolombiaReport', () => {
  describe('archivo válido', () => {
    it('cuenta los movimientos sin el encabezado y arma el resumen', () => {
      const result = analyzeBancolombiaReport([
        header(),
        movement(100, '20260702'),
        movement(250.5, '20260704'),
        movement(49.5, '20260706'),
      ]);

      expect(result).toEqual({
        state: 'valid',
        summary: { totalRecords: 3, totalAmount: 400, dateFrom: '2026-07-02', dateTo: '2026-07-06' },
        reason: null,
        missingColumns: [],
        invalidRows: [],
      });
    });

    it('suma en centavos sin error de flotante (0.1 + 0.2 = 0.3)', () => {
      const result = analyzeBancolombiaReport([header(), movement(0.1, '20260702'), movement(0.2, '20260702')]);

      expect(result.summary?.totalAmount).toBe(0.3);
    });

    it('no acumula error de flotante con muchos decimales', () => {
      const rows = [header(), ...Array.from({ length: 1000 }, () => movement(0.1, '20260702'))];

      expect(analyzeBancolombiaReport(rows).summary?.totalAmount).toBe(100);
    });

    it('el rango de fechas es el mínimo y el máximo de FECHA DE CANJE, en cualquier orden', () => {
      const result = analyzeBancolombiaReport([
        header(),
        movement(1, '20260705'),
        movement(1, '20260630'),
        movement(1, '20260710'),
        movement(1, '20260702'),
      ]);

      expect(result.summary?.dateFrom).toBe('2026-06-30');
      expect(result.summary?.dateTo).toBe('2026-07-10');
    });

    it('con una sola fecha el rango empieza y termina el mismo día', () => {
      const result = analyzeBancolombiaReport([header(), movement(5, '20260702')]);

      expect(result.summary?.dateFrom).toBe('2026-07-02');
      expect(result.summary?.dateTo).toBe('2026-07-02');
    });

    it('ignora las filas vacías (no cuentan como registros)', () => {
      const result = analyzeBancolombiaReport([
        header(),
        movement(10, '20260702'),
        emptyRow(),
        [],
        movement(20, '20260703'),
        ['  ', '', null, undefined],
      ]);

      expect(result.state).toBe('valid');
      expect(result.summary?.totalRecords).toBe(2);
      expect(result.summary?.totalAmount).toBe(30);
    });

    it('acepta el encabezado en minúsculas y con espacios alrededor', () => {
      const lowerHeader = BANCOLOMBIA_COLUMNS.map((name) => `  ${name.toLowerCase()} `);

      const result = analyzeBancolombiaReport([lowerHeader, movement(10, '20260702')]);

      expect(result.state).toBe('valid');
      expect(result.summary?.totalRecords).toBe(1);
    });

    it('acepta valores numéricos como string (VALOR TOTAL y fecha)', () => {
      const result = analyzeBancolombiaReport([header(), movement('1500.25', ' 20260702 '), movement(' 10 ', '20260703')]);

      expect(result.state).toBe('valid');
      expect(result.summary?.totalAmount).toBe(1510.25);
    });

    it('acepta la fecha como número (20260702)', () => {
      const result = analyzeBancolombiaReport([header(), movement(10, 20260702)]);

      expect(result.state).toBe('valid');
      expect(result.summary?.dateFrom).toBe('2026-07-02');
    });

    it('acepta montos negativos y cero', () => {
      const result = analyzeBancolombiaReport([header(), movement(-50, '20260702'), movement(0, '20260702')]);

      expect(result.state).toBe('valid');
      expect(result.summary?.totalAmount).toBe(-50);
      expect(result.summary?.totalRecords).toBe(2);
    });

    it('acepta filas con columnas de más al final del encabezado', () => {
      const result = analyzeBancolombiaReport([[...header(), 'EXTRA'], movement(10, '20260702')]);

      expect(result.state).toBe('valid');
    });
  });

  describe('archivo vacío', () => {
    it('sin filas es invalid con "El archivo está vacío."', () => {
      expect(analyzeBancolombiaReport([])).toEqual({
        state: 'invalid',
        summary: null,
        reason: 'El archivo está vacío.',
        missingColumns: [],
        invalidRows: [],
      });
    });

    it('con la primera fila vacía es invalid con "El archivo está vacío."', () => {
      expect(analyzeBancolombiaReport([[]]).reason).toBe('El archivo está vacío.');
      expect(analyzeBancolombiaReport([emptyRow(), movement(1, '20260702')]).reason).toBe('El archivo está vacío.');
      expect(analyzeBancolombiaReport([['', '  ', null]]).state).toBe('invalid');
    });
  });

  describe('encabezado sin las columnas esperadas', () => {
    it('devuelve invalid con TODAS las columnas faltantes en el orden del reporte', () => {
      const result = analyzeBancolombiaReport([BANCOLOMBIA_COLUMNS.map(() => 'OTRA'), movement(1, '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.summary).toBeNull();
      expect(result.reason).toBe('No coincide con el formato del reporte de Bancolombia: faltan columnas.');
      expect(result.missingColumns).toEqual([...BANCOLOMBIA_COLUMNS]);
      expect(result.missingColumns).toHaveLength(27);
      expect(result.invalidRows).toEqual([]);
    });

    it('un encabezado más corto lista solo las columnas que faltan', () => {
      const result = analyzeBancolombiaReport([header().slice(0, 25), movement(1, '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.missingColumns).toEqual(['COMISION BASE', 'FECHA DE COMPENSACION']);
    });

    it('una columna renombrada se reporta como faltante', () => {
      const renamed = header();
      renamed[TOTAL_INDEX] = 'TOTAL';

      const result = analyzeBancolombiaReport([renamed, movement(1, '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.missingColumns).toEqual(['VALOR TOTAL']);
      expect(result.reason).toContain('faltan columnas');
    });

    it('con columnas faltantes no revisa las filas (invalidRows vacío)', () => {
      const result = analyzeBancolombiaReport([header().slice(1), movement('x', '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.invalidRows).toEqual([]);
    });
  });

  describe('columnas fuera de orden', () => {
    it('con todas presentes pero intercambiadas es invalid, lista las mal ubicadas y missingColumns queda vacío', () => {
      const swapped = header();
      [swapped[0], swapped[1]] = [swapped[1], swapped[0]];

      const result = analyzeBancolombiaReport([swapped, movement(1, '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.summary).toBeNull();
      expect(result.reason).toBe('Las columnas están fuera de orden: NIT, CODIGO ESTABLECIMIENTO.');
      expect(result.missingColumns).toEqual([]);
      expect(result.invalidRows).toEqual([]);
    });

    it('un encabezado invertido no vuelve válido al archivo', () => {
      const result = analyzeBancolombiaReport([header().reverse(), movement(1, '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.reason).toMatch(/^Las columnas están fuera de orden: /);
      expect(result.missingColumns).toEqual([]);
    });

    it('una columna extra al inicio desplaza a las demás y cuenta como fuera de orden', () => {
      const result = analyzeBancolombiaReport([['EXTRA', ...header()], movement(1, '20260702')]);

      expect(result.state).toBe('invalid');
      expect(result.reason).toContain('fuera de orden');
      expect(result.missingColumns).toEqual([]);
    });
  });

  describe('sin movimientos', () => {
    it('solo el encabezado es invalid con "El archivo no contiene movimientos."', () => {
      expect(analyzeBancolombiaReport([header()])).toEqual({
        state: 'invalid',
        summary: null,
        reason: 'El archivo no contiene movimientos.',
        missingColumns: [],
        invalidRows: [],
      });
    });

    it('encabezado y solo filas vacías también es "sin movimientos"', () => {
      const result = analyzeBancolombiaReport([header(), emptyRow(), []]);

      expect(result.state).toBe('invalid');
      expect(result.reason).toBe('El archivo no contiene movimientos.');
    });
  });

  describe('filas con campos ilegibles (missing_fields)', () => {
    it('VALOR TOTAL no numérico: missing_fields con el número de fila de la hoja', () => {
      const result = analyzeBancolombiaReport([header(), movement(10, '20260702'), movement('abc', '20260702')]);

      expect(result).toEqual({
        state: 'missing_fields',
        summary: null,
        reason: '1 fila(s) con campos inválidos.',
        missingColumns: [],
        invalidRows: [{ row: 3, fields: ['VALOR TOTAL'] }],
      });
    });

    it('FECHA DE CANJE ilegible: el campo es FECHA DE CANJE', () => {
      const result = analyzeBancolombiaReport([header(), movement(10, '20261340')]);

      expect(result.state).toBe('missing_fields');
      expect(result.invalidRows).toEqual([{ row: 2, fields: ['FECHA DE CANJE'] }]);
    });

    it('ambos campos ilegibles en la misma fila: se listan los dos, VALOR TOTAL primero', () => {
      const result = analyzeBancolombiaReport([header(), movement('y', 'z')]);

      expect(result.invalidRows).toEqual([{ row: 2, fields: ['VALOR TOTAL', 'FECHA DE CANJE'] }]);
    });

    it('VALOR TOTAL vacío, en blanco o nulo es ilegible', () => {
      for (const total of ['', '   ', null, undefined]) {
        const result = analyzeBancolombiaReport([header(), movement(total, '20260702')]);
        expect(result.state).toBe('missing_fields');
        expect(result.invalidRows).toEqual([{ row: 2, fields: ['VALOR TOTAL'] }]);
      }
    });

    it('VALOR TOTAL infinito o NaN es ilegible', () => {
      expect(analyzeBancolombiaReport([header(), movement(Infinity, '20260702')]).state).toBe('missing_fields');
      expect(analyzeBancolombiaReport([header(), movement(NaN, '20260702')]).state).toBe('missing_fields');
    });

    it('fecha con mes/día imposibles o inexistente en el calendario es ilegible', () => {
      expect(analyzeBancolombiaReport([header(), movement(10, '20261340')]).state).toBe('missing_fields');
      expect(analyzeBancolombiaReport([header(), movement(10, '20260230')]).state).toBe('missing_fields');
    });

    it('fecha con otro formato (2026-07-02) o vacía es ilegible', () => {
      const other = analyzeBancolombiaReport([header(), movement(10, '2026-07-02')]);

      expect(other.invalidRows[0].fields).toEqual(['FECHA DE CANJE']);
      expect(analyzeBancolombiaReport([header(), movement(10, '')]).state).toBe('missing_fields');
      expect(analyzeBancolombiaReport([header(), movement(10, null)]).state).toBe('missing_fields');
    });

    it('el número de fila cuenta las filas vacías intermedias', () => {
      const result = analyzeBancolombiaReport([
        header(),
        movement(10, '20260702'), // fila 2
        emptyRow(), // fila 3
        movement('x', '20260702'), // fila 4
      ]);

      expect(result.invalidRows).toEqual([{ row: 4, fields: ['VALOR TOTAL'] }]);
    });

    it('reporta TODAS las filas malas, no solo la primera', () => {
      const result = analyzeBancolombiaReport([
        header(),
        movement('x', '20260702'), // fila 2
        movement(10, '20260702'),
        movement(10, '20261340'), // fila 4
        movement('y', 'z'), // fila 5
      ]);

      expect(result.state).toBe('missing_fields');
      expect(result.reason).toBe('3 fila(s) con campos inválidos.');
      expect(result.invalidRows).toEqual([
        { row: 2, fields: ['VALOR TOTAL'] },
        { row: 4, fields: ['FECHA DE CANJE'] },
        { row: 5, fields: ['VALOR TOTAL', 'FECHA DE CANJE'] },
      ]);
    });

    it('una fila mala marca missing_fields aunque las demás sean válidas, sin resumen', () => {
      const rows = [header(), ...Array.from({ length: 50 }, () => movement(1, '20260702')), movement('x', '20260702')];

      const result = analyzeBancolombiaReport(rows);

      expect(result.state).toBe('missing_fields');
      expect(result.summary).toBeNull();
      expect(result.invalidRows).toEqual([{ row: 52, fields: ['VALOR TOTAL'] }]);
    });
  });
});
