import { formatNumber } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ACTIVE_COUNTRY, provideCountry } from '../../../../core/country/active-country';
import { MoneyPipe } from '../../../../core/country/money.pipe';
import { BankStatementResult } from '../../data/bank-statement.util';
import { StatementResult } from './statement-result';

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

const VALID: BankStatementResult = {
  state: 'valid',
  summary: { totalRecords: 12345, totalAmount: 1234567.5, dateFrom: '2026-07-02', dateTo: '2026-07-06' },
  reason: null,
  missingColumns: [],
  invalidRows: [],
};

const INVALID: BankStatementResult = {
  state: 'invalid',
  summary: null,
  reason: 'No coincide con el formato del reporte de Bancolombia: faltan columnas.',
  missingColumns: ['NIT', 'VALOR TOTAL', 'FECHA DE CANJE', 'TARJETA', 'FRANQUICIA'],
  invalidRows: [],
};

const OUT_OF_ORDER: BankStatementResult = {
  state: 'invalid',
  summary: null,
  reason: 'Las columnas están fuera de orden: NIT, CODIGO ESTABLECIMIENTO.',
  missingColumns: [],
  invalidRows: [],
};

const MISSING_FIELDS: BankStatementResult = {
  state: 'missing_fields',
  summary: null,
  reason: '3 fila(s) con campos inválidos.',
  missingColumns: [],
  invalidRows: [
    { row: 2, fields: ['VALOR TOTAL'] },
    { row: 7, fields: ['FECHA DE CANJE'] },
    { row: 40, fields: ['VALOR TOTAL', 'FECHA DE CANJE'] },
  ],
};

const ERROR: BankStatementResult = {
  state: 'error',
  summary: null,
  reason: 'No se pudo leer el archivo.',
  missingColumns: [],
  invalidRows: [],
};

describe('StatementResult', () => {
  let fixture: ComponentFixture<StatementResult>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatementResult],
      providers: [provideCountry(ACTIVE_COUNTRY)],
    }).compileComponents();

    fixture = TestBed.createComponent(StatementResult);
    el = fixture.nativeElement as HTMLElement;
  });

  function show(inputs: { reading?: boolean; result?: BankStatementResult | null; placeholder?: string | null }): void {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  const legend = () => el.querySelector<HTMLElement>('.status-legend');
  const reason = () => el.querySelector<HTMLElement>('.statement-result__reason');
  const rows = () =>
    Array.from(el.querySelectorAll<HTMLElement>('.statement-row')).map((row) => [
      norm(row.querySelector('dt')?.textContent),
      norm(row.querySelector('dd')?.textContent),
    ]);
  const items = (selector: string) => Array.from(el.querySelectorAll(selector)).map((li) => norm(li.textContent));

  describe('sin resultado', () => {
    it('sin archivo ni placeholder no pinta nada', () => {
      show({});

      expect(norm(el.textContent)).toBe('');
      expect(legend()).toBeNull();
    });

    it('con placeholder lo muestra como texto atenuado', () => {
      show({ placeholder: 'Carga el extracto bancario para ver su resumen.' });

      expect(norm(el.querySelector('.text-muted')?.textContent)).toBe('Carga el extracto bancario para ver su resumen.');
      expect(legend()).toBeNull();
    });

    it('con un resultado el placeholder desaparece', () => {
      show({ placeholder: 'Carga el extracto.', result: VALID });

      expect(el.textContent).not.toContain('Carga el extracto.');
    });
  });

  describe('leyendo', () => {
    it('muestra el spinner con su texto y oculta resultado y placeholder', () => {
      show({ reading: true, result: VALID, placeholder: 'Carga el extracto.' });

      expect(el.querySelector('.statement-loading nz-spin')).not.toBeNull();
      expect(norm(el.querySelector('.statement-loading')?.textContent)).toContain('Revisando el archivo');
      expect(legend()).toBeNull();
      expect(rows()).toHaveLength(0);
      expect(el.textContent).not.toContain('Carga el extracto.');
    });

    it('al terminar la lectura el spinner cede su lugar al resultado', () => {
      show({ reading: true, result: null });
      show({ reading: false, result: ERROR });

      expect(el.querySelector('.statement-loading')).toBeNull();
      expect(legend()).not.toBeNull();
    });
  });

  describe('archivo válido', () => {
    beforeEach(() => show({ result: VALID }));

    it('muestra el resumen con registros, total de movimientos y rango de fechas', () => {
      const locale = ACTIVE_COUNTRY.locale;
      const money = TestBed.runInInjectionContext(() => new MoneyPipe().transform(1234567.5));

      expect(formatNumber(12345, locale)).not.toBe('12345');
      expect(rows()).toEqual([
        ['Total de registros', formatNumber(12345, locale)],
        ['Total de movimientos', norm(money)],
        ['Rango de fechas', '02/07/2026 – 06/07/2026'],
      ]);
    });

    it('la leyenda es de éxito, con icono, y no hay motivo ni listas', () => {
      expect(norm(legend()!.textContent)).toBe('Archivo válido');
      expect(legend()!.classList.contains('status-legend-success')).toBe(true);
      expect(legend()!.classList.contains('status-legend-warning')).toBe(false);
      expect(legend()!.classList.contains('status-legend-error')).toBe(false);
      expect(legend()!.querySelector('svg')).not.toBeNull();
      expect(reason()).toBeNull();
      expect(el.querySelector('.statement-list')).toBeNull();
    });
  });

  describe('archivo inválido', () => {
    it('leyenda de error, motivo y TODAS las columnas faltantes (sin recortar)', () => {
      show({ result: INVALID });

      expect(norm(legend()!.textContent)).toBe('Archivo inválido');
      expect(legend()!.classList.contains('status-legend-error')).toBe(true);
      expect(legend()!.classList.contains('status-legend-warning')).toBe(false);
      expect(norm(reason()!.textContent)).toBe(INVALID.reason);
      expect(items('ul.statement-list--error li')).toEqual(['NIT', 'VALOR TOTAL', 'FECHA DE CANJE', 'TARJETA', 'FRANQUICIA']);
      expect(el.querySelector('ul.statement-list--error')?.getAttribute('aria-label')).toBe('Columnas faltantes');
      expect(el.querySelector('ul.statement-list--warning')).toBeNull();
      expect(rows()).toHaveLength(0);
    });

    it('con 27 columnas faltantes las lista todas', () => {
      const all = Array.from({ length: 27 }, (_, i) => `COL ${i + 1}`);

      show({ result: { ...INVALID, missingColumns: all } });

      expect(items('ul.statement-list--error li')).toEqual(all);
    });

    it('fuera de orden: motivo con las columnas y sin lista (missingColumns vacío)', () => {
      show({ result: OUT_OF_ORDER });

      expect(legend()!.classList.contains('status-legend-error')).toBe(true);
      expect(norm(reason()!.textContent)).toBe(OUT_OF_ORDER.reason);
      expect(el.querySelector('.statement-list')).toBeNull();
    });
  });

  describe('campos faltantes', () => {
    beforeEach(() => show({ result: MISSING_FIELDS }));

    it('leyenda de advertencia con el motivo', () => {
      expect(norm(legend()!.textContent)).toBe('Campos faltantes');
      expect(legend()!.classList.contains('status-legend-warning')).toBe(true);
      expect(legend()!.classList.contains('status-legend-error')).toBe(false);
      expect(legend()!.classList.contains('status-legend-success')).toBe(false);
      expect(norm(reason()!.textContent)).toBe('3 fila(s) con campos inválidos.');
    });

    it('lista "Fila N: CAMPO, CAMPO" por cada fila inválida y no la de columnas', () => {
      expect(items('ul.statement-list--warning li')).toEqual([
        'Fila 2: VALOR TOTAL',
        'Fila 7: FECHA DE CANJE',
        'Fila 40: VALOR TOTAL, FECHA DE CANJE',
      ]);
      expect(el.querySelector('ul.statement-list--warning')?.getAttribute('aria-label')).toBe('Filas con campos inválidos');
      expect(el.querySelector('ul.statement-list--error')).toBeNull();
      expect(rows()).toHaveLength(0);
    });

    it('con cientos de filas inválidas las lista todas', () => {
      const many = Array.from({ length: 300 }, (_, i) => ({ row: i + 2, fields: ['VALOR TOTAL'] }));

      show({ result: { ...MISSING_FIELDS, invalidRows: many } });

      expect(el.querySelectorAll('ul.statement-list--warning li')).toHaveLength(300);
    });
  });

  describe('error de lectura', () => {
    it('leyenda de error con su motivo y sin listas ni resumen', () => {
      show({ result: ERROR });

      expect(norm(legend()!.textContent)).toBe('Error en el archivo');
      expect(legend()!.classList.contains('status-legend-error')).toBe(true);
      expect(norm(reason()!.textContent)).toBe('No se pudo leer el archivo.');
      expect(el.querySelector('.statement-list')).toBeNull();
      expect(rows()).toHaveLength(0);
    });
  });

  describe('resumen', () => {
    it('solo aparece si el resultado trae `summary`', () => {
      for (const result of [INVALID, MISSING_FIELDS, ERROR]) {
        show({ result });
        expect(el.querySelector('.statement-rows')).toBeNull();
      }
      show({ result: VALID });
      expect(el.querySelector('.statement-rows')).not.toBeNull();
    });

    it('un resultado sin motivo no pinta el texto del motivo', () => {
      show({ result: { ...ERROR, reason: null } });

      expect(legend()).not.toBeNull();
      expect(reason()).toBeNull();
    });
  });
});
