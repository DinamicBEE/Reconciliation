import { HttpErrorResponse } from '@angular/common/http';
import { describeCaptureError, describeCaptureResult } from './capture-result.util';
import { CaptureBatchResult, CaptureStatus } from './sales-api.service';

const PLACE = 'La tienda Centro del 2026-10-20';

function result(
  status: CaptureStatus,
  overrides: Partial<CaptureBatchResult> = {},
  errorMessage: string | null = null,
): CaptureBatchResult {
  const counts = { status, capturedCount: 5, insertedCount: 3, skippedCount: 2, failedCount: 0, capturedAmount: 1000 };
  return {
    ...counts,
    dateFrom: '2026-10-20',
    dateTo: '2026-10-20',
    locationsRequested: 1,
    daysRequested: 1,
    declaredCount: 5,
    locations: [
      {
        ...counts,
        ubicacionId: 7,
        dateFrom: '2026-10-20',
        dateTo: '2026-10-20',
        daysRequested: 1,
        declaredCount: 5,
        days: [
          {
            ...counts,
            captureLogId: 1,
            ubicacionId: 7,
            businessDate: '2026-10-20',
            declaredCount: 5,
            pages: 1,
            errorMessage,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function httpError(status: number, error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error, url: '/sales/capture' });
}

describe('describeCaptureResult', () => {
  describe('OK', () => {
    it('devuelve éxito con los conteos y pide recargar si hubo documentos nuevos', () => {
      const msg = describeCaptureResult(result('OK'), PLACE);
      expect(msg.level).toBe('success');
      expect(msg.reload).toBe(true);
      expect(msg.text).toContain(PLACE);
      expect(msg.text).toContain('5 documentos recibidos: 3 nuevos, 2 ya existían.');
    });

    it('no pide recargar cuando no se insertó ningún documento', () => {
      const msg = describeCaptureResult(result('OK', { capturedCount: 2, insertedCount: 0, skippedCount: 2 }), PLACE);
      expect(msg.level).toBe('success');
      expect(msg.reload).toBe(false);
      expect(msg.text).toContain('2 documentos recibidos: 0 nuevos, 2 ya existían.');
    });

    it('usa el singular para un documento', () => {
      const msg = describeCaptureResult(result('OK', { capturedCount: 1, insertedCount: 1, skippedCount: 0 }), PLACE);
      expect(msg.text).toContain('1 documento recibidos');
    });
  });

  describe('INCOMPLETE', () => {
    it('devuelve advertencia con los fallidos y el errorMessage del primer día', () => {
      const msg = describeCaptureResult(
        result('INCOMPLETE', { failedCount: 1 }, 'Facturiza declaró 6 documentos y llegaron 5'),
        PLACE,
      );
      expect(msg.level).toBe('warning');
      expect(msg.reload).toBe(true);
      expect(msg.text).toContain('incompleta');
      expect(msg.text).toContain(', 1 con error.');
      expect(msg.text).toContain('Detalle: Facturiza declaró 6 documentos y llegaron 5');
    });

    it('omite el detalle cuando el día no trae errorMessage', () => {
      const msg = describeCaptureResult(result('INCOMPLETE', { insertedCount: 0 }), PLACE);
      expect(msg.level).toBe('warning');
      expect(msg.reload).toBe(false);
      expect(msg.text).not.toContain('Detalle:');
    });
  });

  describe('RUNNING', () => {
    it('devuelve advertencia y nunca pide recargar', () => {
      const msg = describeCaptureResult(result('RUNNING', { insertedCount: 4 }), PLACE);
      expect(msg.level).toBe('warning');
      expect(msg.reload).toBe(false);
      expect(msg.text).toContain('ya se está capturando');
    });
  });

  describe('ERROR', () => {
    it('devuelve error con el errorMessage del primer día', () => {
      const msg = describeCaptureResult(result('ERROR', { insertedCount: 0 }, 'Timeout al consultar Facturiza'), PLACE);
      expect(msg.level).toBe('error');
      expect(msg.reload).toBe(false);
      expect(msg.text).toBe(`No se pudo reprocesar ${PLACE}. Timeout al consultar Facturiza`);
    });

    it('usa un texto de respaldo cuando errorMessage es null', () => {
      const msg = describeCaptureResult(result('ERROR', { insertedCount: 0 }, null), PLACE);
      expect(msg.level).toBe('error');
      expect(msg.text).toBe(`No se pudo reprocesar ${PLACE}. Facturiza no respondió; inténtalo de nuevo.`);
    });

    it('usa el texto de respaldo cuando no hay tiendas en el resultado', () => {
      const msg = describeCaptureResult(result('ERROR', { insertedCount: 0, locations: [] }), PLACE);
      expect(msg.text).toContain('Facturiza no respondió');
    });
  });
});

describe('describeCaptureError', () => {
  it('502 con un CaptureBatchResult en el cuerpo delega en describeCaptureResult', () => {
    const body = result('ERROR', { insertedCount: 0 }, 'Facturiza no respondió (502)');
    const msg = describeCaptureError(httpError(502, body), PLACE);
    expect(msg).toEqual(describeCaptureResult(body, PLACE));
    expect(msg.level).toBe('error');
    expect(msg.text).toContain('Facturiza no respondió (502)');
  });

  it('409 con ProblemDetail devuelve advertencia con el detail', () => {
    const msg = describeCaptureError(httpError(409, { status: 409, detail: 'Captura en curso para la tienda 7' }), PLACE);
    expect(msg).toEqual({ level: 'warning', text: 'Captura en curso para la tienda 7', reload: false });
  });

  it('409 sin detail usa el texto por defecto', () => {
    const msg = describeCaptureError(httpError(409, null), PLACE);
    expect(msg.level).toBe('warning');
    expect(msg.text).toBe(`${PLACE} ya se está capturando; espera a que termine.`);
  });

  it.each([404, 400])('%i con ProblemDetail devuelve error con el detail', (status) => {
    const msg = describeCaptureError(httpError(status, { status, detail: `Detalle del ${status}` }), PLACE);
    expect(msg).toEqual({ level: 'error', text: `Detalle del ${status}`, reload: false });
  });

  it('403 devuelve el mensaje de permiso', () => {
    const msg = describeCaptureError(httpError(403, { detail: 'Forbidden' }), PLACE);
    expect(msg.level).toBe('error');
    expect(msg.reload).toBe(false);
    expect(msg.text).toContain('capture_sales');
  });

  it('status 0 devuelve el mensaje de conexión', () => {
    const msg = describeCaptureError(httpError(0, null), PLACE);
    expect(msg).toEqual({ level: 'error', text: 'No se pudo conectar con el servidor. Intenta de nuevo.', reload: false });
  });

  it('un error HTTP sin detail usa el mensaje genérico', () => {
    const msg = describeCaptureError(httpError(500, 'Internal Server Error'), PLACE);
    expect(msg).toEqual({ level: 'error', text: `No se pudo reprocesar ${PLACE}. Intenta de nuevo.`, reload: false });
  });

  it('un error que no es HTTP devuelve el mensaje genérico', () => {
    const msg = describeCaptureError(new Error('boom'), PLACE);
    expect(msg).toEqual({ level: 'error', text: `No se pudo reprocesar ${PLACE}. Intenta de nuevo.`, reload: false });
  });
});
