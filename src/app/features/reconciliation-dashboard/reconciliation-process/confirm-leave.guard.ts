import { CanDeactivateFn } from '@angular/router';

/** Pantalla que pide confirmación antes de salir; `confirmLeave` resuelve `true` para dejar salir. */
export interface ConfirmLeave {
  confirmLeave(nextUrl: string): boolean | Promise<boolean>;
}

/**
 * Pregunta a la pantalla antes de cualquier salida: volver, breadcrumb, menú lateral o "atrás" del navegador.
 *
 * @see docs/codigo/conciliacion.md#proceso-paso-a-paso
 */
export const confirmLeaveGuard: CanDeactivateFn<ConfirmLeave> = (component, _route, _state, nextState) =>
  component.confirmLeave(nextState.url);
