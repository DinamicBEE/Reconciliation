import { EMPTY_CATALOG_VALUE, formatCatalogValue } from './catalog-value.util';

const LOCALE = 'en-US';

describe('formatCatalogValue', () => {
  describe('valores vacíos', () => {
    it.each([null, undefined, ''])('muestra "—" para %j en cualquier tipo', (value) => {
      expect(formatCatalogValue(value, 'text', LOCALE)).toBe(EMPTY_CATALOG_VALUE);
      expect(formatCatalogValue(value, 'number', LOCALE)).toBe(EMPTY_CATALOG_VALUE);
      expect(formatCatalogValue(value, 'boolean', LOCALE)).toBe(EMPTY_CATALOG_VALUE);
      expect(formatCatalogValue(value, 'datetime', LOCALE)).toBe(EMPTY_CATALOG_VALUE);
    });

    it('el marcador de vacío es la raya "—"', () => {
      expect(EMPTY_CATALOG_VALUE).toBe('—');
    });
  });

  describe('boolean', () => {
    it('muestra "Sí" para true y para el texto "true"', () => {
      expect(formatCatalogValue(true, 'boolean', LOCALE)).toBe('Sí');
      expect(formatCatalogValue('true', 'boolean', LOCALE)).toBe('Sí');
    });

    it.each([false, 'false', 0, 1, 'TRUE'])('muestra "No" para %j', (value) => {
      expect(formatCatalogValue(value, 'boolean', LOCALE)).toBe('No');
    });
  });

  describe('datetime', () => {
    it('da formato dd/MM/yyyy HH:mm a un ISO local', () => {
      expect(formatCatalogValue('2026-10-20T14:05:00', 'datetime', LOCALE)).toBe('20/10/2026 14:05');
    });

    it('da formato a un timestamp numérico', () => {
      const timestamp = new Date(2026, 0, 3, 9, 7).getTime();
      expect(formatCatalogValue(timestamp, 'datetime', LOCALE)).toBe('03/01/2026 09:07');
    });

    it('devuelve el texto original si no es una fecha válida', () => {
      expect(formatCatalogValue('no-es-fecha', 'datetime', LOCALE)).toBe('no-es-fecha');
    });

    it('convierte a texto los valores que no son string ni number', () => {
      expect(formatCatalogValue(true, 'datetime', LOCALE)).toBe('true');
    });
  });

  describe('number y text', () => {
    it('muestra los números tal cual, sin separadores de miles', () => {
      expect(formatCatalogValue(1234567, 'number', LOCALE)).toBe('1234567');
      expect(formatCatalogValue(0, 'number', LOCALE)).toBe('0');
    });

    it('muestra el texto tal cual', () => {
      expect(formatCatalogValue('Efectivo', 'text', LOCALE)).toBe('Efectivo');
      expect(formatCatalogValue(42, 'text', LOCALE)).toBe('42');
    });
  });
});
