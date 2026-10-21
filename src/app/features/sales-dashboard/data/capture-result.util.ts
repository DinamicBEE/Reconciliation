import { HttpErrorResponse } from '@angular/common/http';
import { CaptureBatchResult, CaptureDayResult } from './sales-api.service';

// Función pura y testeable — sin estado, sin DI (ver MASTER.md, "Estructura de
// carpetas"). Traduce lo que respondió `POST /sales/capture` a un aviso para la
// persona: el resultado (200 OK / 207 parcial / 502 con cuerpo) o el error
// (`ProblemDetail` de 400/404/409, 403 sin permiso, 0 sin conexión).

export type CaptureMessageLevel = 'success' | 'warning' | 'error';

export interface CaptureMessage {
  level: CaptureMessageLevel;
  text: string;
  // true = conviene recargar la tabla (se guardaron documentos nuevos).
  reload: boolean;
}

function firstDay(result: CaptureBatchResult): CaptureDayResult | undefined {
  return result.locations[0]?.days[0];
}

function isCaptureBatchResult(value: unknown): value is CaptureBatchResult {
  return !!value && typeof value === 'object' && 'status' in value && Array.isArray((value as CaptureBatchResult).locations);
}

function summary(result: CaptureBatchResult): string {
  const docs = result.capturedCount === 1 ? 'documento' : 'documentos';
  return `${result.capturedCount} ${docs} recibidos: ${result.insertedCount} nuevos, ${result.skippedCount} ya existían${
    result.failedCount ? `, ${result.failedCount} con error` : ''
  }.`;
}

export function describeCaptureResult(result: CaptureBatchResult, place: string): CaptureMessage {
  const reload = result.insertedCount > 0;
  const detail = firstDay(result)?.errorMessage;
  switch (result.status) {
    case 'OK':
      return { level: 'success', text: `${place} se reprocesó correctamente. ${summary(result)}`, reload };
    case 'INCOMPLETE':
      return {
        level: 'warning',
        text: `${place} se reprocesó de forma incompleta. ${summary(result)}${detail ? ` Detalle: ${detail}` : ''}`,
        reload,
      };
    case 'RUNNING':
      return { level: 'warning', text: `${place} ya se está capturando. Espera a que termine e inténtalo de nuevo.`, reload: false };
    case 'ERROR':
    default:
      return {
        level: 'error',
        text: `No se pudo reprocesar ${place}.${detail ? ` ${detail}` : ' Facturiza no respondió; inténtalo de nuevo.'}`,
        reload,
      };
  }
}

export function describeCaptureError(err: unknown, place: string): CaptureMessage {
  if (err instanceof HttpErrorResponse) {
    // 502: Facturiza no respondió en ninguna captura — trae el resultado completo.
    if (isCaptureBatchResult(err.error)) {
      return describeCaptureResult(err.error, place);
    }
    const detail = typeof err.error?.detail === 'string' ? err.error.detail : null;
    if (err.status === 409) {
      return { level: 'warning', text: detail ?? `${place} ya se está capturando; espera a que termine.`, reload: false };
    }
    if (err.status === 403) {
      return { level: 'error', text: 'Tu cuenta no tiene el permiso para capturar ventas (capture_sales).', reload: false };
    }
    if (err.status === 0) {
      return { level: 'error', text: 'No se pudo conectar con el servidor. Intenta de nuevo.', reload: false };
    }
    if (detail) {
      return { level: 'error', text: detail, reload: false };
    }
  }
  return { level: 'error', text: `No se pudo reprocesar ${place}. Intenta de nuevo.`, reload: false };
}
