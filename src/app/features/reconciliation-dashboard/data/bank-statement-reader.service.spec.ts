import { TestBed } from '@angular/core/testing';
import { BankStatementReader } from './bank-statement-reader.service';

describe('BankStatementReader', () => {
  let reader: BankStatementReader;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reader = TestBed.inject(BankStatementReader);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('un archivo que no es un xlsx devuelve error con el motivo y lo registra en consola', async () => {
    const file = new File(['esto no es un libro de Excel'], 'extracto.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await reader.read(file);

    expect(result).toEqual({
      state: 'error',
      summary: null,
      reason: 'No se pudo leer el archivo.',
      missingColumns: [],
      invalidRows: [],
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('un archivo vacío también devuelve error', async () => {
    const result = await reader.read(new File([], 'vacio.xlsx'));

    expect(result.state).toBe('error');
    expect(result.reason).toBe('No se pudo leer el archivo.');
  });
});
