import { Injectable } from '@angular/core';
import { BankStatementResult, analyzeBancolombiaReport } from './bank-statement.util';

/**
 * Lee el extracto bancario (.xlsx) del paso 1 y lo revisa con {@link analyzeBancolombiaReport}.
 *
 * @remarks Carga `read-excel-file` con import dinámico, fuera del bundle inicial.
 * @see docs/codigo/conciliacion.md#extracto-bancario
 */
@Injectable({ providedIn: 'root' })
export class BankStatementReader {
  /** @returns El resultado de la revisión; nunca rechaza: un fallo de lectura da `state: 'error'`. */
  async read(file: File): Promise<BankStatementResult> {
    try {
      // Cede un turno para que se pinte el loading (el reporte trae ~13 mil filas).
      await new Promise<void>((resolve) => setTimeout(resolve));
      const { readSheet } = await import('read-excel-file/browser');
      return analyzeBancolombiaReport(await readSheet(file));
    } catch (error) {
      console.error('[BankStatementReader] No se pudo leer el extracto bancario:', error);
      return { state: 'error', summary: null, reason: 'No se pudo leer el archivo.', missingColumns: [], invalidRows: [] };
    }
  }
}
