import { Injectable } from '@angular/core';
import { Observable, delay, of, switchMap, throwError } from 'rxjs';
import {
  BankImportRejectionBody,
  BankImportRequest,
  BankImportResponse,
  ImportOriginId,
  STATEMENT_REJECTED_CODE,
} from './bank-import.model';

// Endpoint del Reconciliation Service para la carga de extractos (contrato
// propuesto en docs/api-endpoints.csv). Todavía NO existe en el backend.
export const BANK_IMPORT_ENDPOINT = '/bank-imports';

// Cuerpo multipart que se enviará al backend: el archivo SIN tocar, más el
// origen y la cuenta/lote. Función pura — el día que exista el endpoint,
// `upload()` hace `http.post<BankImportResponse>(apiUrl + BANK_IMPORT_ENDPOINT,
// buildBankImportFormData(request))` y nada más cambia.
export function buildBankImportFormData(request: BankImportRequest): FormData {
  const form = new FormData();
  form.append('origin', request.origin);
  form.append('targetKind', request.targetKind);
  form.append('targetId', request.targetId);
  form.append('file', request.file, request.file.name);
  return form;
}

// Latencia simulada — perceptible a propósito para que se vea el estado
// "Enviando archivo…" del modal.
const SIMULATED_DELAY_MS = 1800;

/**
 * Envío del archivo al backend para su normalización por el parser del
 * origen (DED, CU5 pasos 2-6). Hoy SIMULA la respuesta (no hay endpoint):
 * arma el mismo `FormData` que se enviará y devuelve un resultado con la
 * forma del contrato (`BankImportResponse`) o un rechazo
 * (`STATEMENT_REJECTED`, con línea y motivo) como error del Observable.
 * Esta rama no tiene `HttpClient` a propósito (solo datos mock): al conectar
 * el backend, solo cambia el cuerpo de `upload()`.
 */
@Injectable({ providedIn: 'root' })
export class BankImportApi {
  // Intentos de esta sesión — la simulación rechaza el segundo envío y
  // siguientes (mismo comportamiento de demostración que ya tenía el modal),
  // para poder ver el aviso de archivo rechazado.
  private attempts = 0;

  upload(request: BankImportRequest): Observable<BankImportResponse> {
    const payload = buildBankImportFormData(request);
    this.attempts += 1;
    const attempt = this.attempts;

    console.log('[Importar movimientos bancarios] envío simulado', {
      endpoint: `POST ${BANK_IMPORT_ENDPOINT}`,
      origin: payload.get('origin'),
      targetKind: payload.get('targetKind'),
      targetId: payload.get('targetId'),
      file: { name: request.file.name, size: request.file.size, type: request.file.type },
    });

    return of(null).pipe(
      delay(SIMULATED_DELAY_MS),
      switchMap(() => (attempt >= 2 || request.file.size === 0 ? rejected(request) : of(accepted(request)))),
    );
  }
}

// --- Simulación del backend -------------------------------------------------
// Determinística a partir del tamaño del archivo (el frontend no lee su
// contenido): ~120 bytes por movimiento, ~4 % duplicados y 1 línea con error
// si el archivo es grande.

function accepted(request: BankImportRequest): BankImportResponse {
  const rowsProcessed = Math.max(1, Math.round(request.file.size / 120));
  const rowsDuplicated = Math.floor(rowsProcessed * 0.04);
  const rowsRejected = rowsProcessed > 20 ? 1 : 0;
  return {
    importId: `IMP-${Date.now().toString().slice(-6)}`,
    origin: request.origin,
    targetId: request.targetId,
    rowsProcessed,
    rowsImported: rowsProcessed - rowsDuplicated - rowsRejected,
    rowsDuplicated,
    rowsRejected,
    rejections: rowsRejected ? [{ row: Math.min(rowsProcessed, 47), reason: 'Monto inválido' }] : [],
  };
}

const EXPECTED_FORMAT: Record<ImportOriginId, string> = {
  bancolombia: 'el Reporte Conciliar de Bancolombia (Excel)',
  davivienda: 'el CSV de datáfono de Davivienda separado por punto y coma',
  qr_caja_social: 'el CSV de QR Caja Social BREB separado por punto y coma',
  rappi: 'la liquidación de Rappi (Excel)',
};

function rejected(request: BankImportRequest): Observable<never> {
  const body: BankImportRejectionBody =
    request.file.size === 0
      ? { error: 'Archivo rechazado.', code: STATEMENT_REJECTED_CODE, line: 1, reason: 'el archivo está vacío.' }
      : {
          error: 'Archivo rechazado.',
          code: STATEMENT_REJECTED_CODE,
          line: 2,
          reason: `la estructura no corresponde al formato esperado para el origen seleccionado (${EXPECTED_FORMAT[request.origin]}).`,
        };
  return throwError(() => ({ status: 422, error: body }));
}
