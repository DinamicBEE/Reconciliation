import { buildSaleListCsv } from './sale-list-export.util';
import { SaleListItem } from './sales-api.service';

const HEADER =
  'Folio,Tipo,Fecha,Hora,Sucursal,Cliente,Documento del cliente,Medio de pago,Pagos,Estado,Subtotal,Impuestos,Total';

function row(overrides: Partial<SaleListItem> = {}): SaleListItem {
  return {
    id: 1,
    folio: 'A-100',
    documentType: 'INVOICE',
    date: '2026-10-20',
    time: '14:05',
    store: { id: 7, name: 'Centro' },
    customer: { id: 3, document: 'XAXX010101000', name: 'Público en general', finalConsumer: true },
    tenderMedia: { id: 1, code: 'EF', description: 'Efectivo', mixed: false, paymentCount: 1 },
    reconciliationStatus: { id: 10, code: 'por_conciliar', description: 'Por conciliar' },
    subtotal: 100,
    taxes: 16,
    total: 116,
    ...overrides,
  };
}

// Las filas de datos (sin el encabezado) como arreglo de líneas.
function dataLines(csv: string): string[] {
  return csv.split('\n').slice(1);
}

describe('buildSaleListCsv', () => {
  it('sin filas devuelve solo el encabezado', () => {
    expect(buildSaleListCsv([], { location: 'Sucursal' })).toBe(HEADER);
  });

  it('usa la etiqueta de ubicación del país en el encabezado', () => {
    const csv = buildSaleListCsv([], { location: 'Ubicación' });
    expect(csv.split(',')[4]).toBe('Ubicación');
  });

  it('arma una línea por fila con importes a 2 decimales, separadas por \\n', () => {
    const csv = buildSaleListCsv([row(), row({ id: 2, folio: 'A-101', subtotal: 10.5, taxes: 1.68, total: 12.175 })], {
      location: 'Sucursal',
    });
    expect(csv).toBe(
      [
        HEADER,
        'A-100,Factura,2026-10-20,14:05,Centro,Público en general,XAXX010101000,Efectivo,1,Por conciliar,100.00,16.00,116.00',
        `A-101,Factura,2026-10-20,14:05,Centro,Público en general,XAXX010101000,Efectivo,1,Por conciliar,10.50,1.68,${(12.175).toFixed(2)}`,
      ].join('\n'),
    );
  });

  it('traduce el tipo de documento y deja el código si no lo conoce', () => {
    const csv = buildSaleListCsv(
      [row({ documentType: 'CREDIT_NOTE' }), row({ documentType: 'TICKET' as SaleListItem['documentType'] })],
      { location: 'Sucursal' },
    );
    const [credit, unknown] = dataLines(csv);
    expect(credit.split(',')[1]).toBe('Nota crédito');
    expect(unknown.split(',')[1]).toBe('TICKET');
  });

  it('deja vacíos hora, cliente y medio de pago ausentes, y 0 pagos', () => {
    const csv = buildSaleListCsv([row({ time: null, customer: null, tenderMedia: null })], { location: 'Sucursal' });
    expect(dataLines(csv)[0]).toBe('A-100,Factura,2026-10-20,,Centro,,,,0,Por conciliar,100.00,16.00,116.00');
  });

  it('reporta el número de pagos del medio principal', () => {
    const csv = buildSaleListCsv(
      [row({ tenderMedia: { id: 2, code: 'TC', description: 'Tarjeta', mixed: true, paymentCount: 3 } })],
      { location: 'Sucursal' },
    );
    const cells = dataLines(csv)[0].split(',');
    expect(cells[7]).toBe('Tarjeta');
    expect(cells[8]).toBe('3');
  });

  describe('escapado', () => {
    function customerCell(name: string): string {
      const csv = buildSaleListCsv([row({ customer: { id: 1, document: 'D', name, finalConsumer: false } })], {
        location: 'Sucursal',
      });
      // El cliente va entre "Centro," y ",D," (documento).
      const line = csv.slice(HEADER.length + 1);
      return line.slice(line.indexOf('Centro,') + 'Centro,'.length, line.lastIndexOf(',D,'));
    }

    it('entrecomilla un valor con coma', () => {
      expect(customerCell('Pérez, Juan')).toBe('"Pérez, Juan"');
    });

    it('entrecomilla un valor con punto y coma', () => {
      expect(customerCell('A;B')).toBe('"A;B"');
    });

    it('duplica las comillas dobles internas', () => {
      expect(customerCell('Taller "El Güero"')).toBe('"Taller ""El Güero"""');
    });

    it('entrecomilla un valor con salto de línea \\n', () => {
      expect(customerCell('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');
    });

    it('un retorno de carro \\r solo NO se entrecomilla (comportamiento actual)', () => {
      expect(customerCell('A\rB')).toBe('A\rB');
    });

    it('no altera valores que empiezan con =, +, - o @ (comportamiento actual)', () => {
      expect(customerCell('=SUMA(A1)')).toBe('=SUMA(A1)');
      expect(customerCell('@cmd')).toBe('@cmd');
    });

    it('deja sin comillas un texto sin caracteres especiales', () => {
      expect(customerCell('Ana López')).toBe('Ana López');
    });

    it('también escapa la etiqueta de ubicación del encabezado', () => {
      const csv = buildSaleListCsv([], { location: 'Tienda, sucursal' });
      expect(csv).toContain(',Hora,"Tienda, sucursal",Cliente,');
    });
  });
});
