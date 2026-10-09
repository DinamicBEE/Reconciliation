import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  ERROR_CODE_MESSAGES,
  FORBIDDEN_WITHOUT_CODE_MESSAGE,
  PASSWORD_CHANGE_REQUIRED_CODE,
  SERVER_ERROR_MESSAGE,
  backendErrorMessage,
  extractErrorCode,
} from './auth-errors';

// Port de `httpErrorAlertInterceptor` (rama de integración,
// `core/interceptors/`) para el backend SIMULADO: esta rama no tiene
// HttpClient, así que no hay interceptores — `AuthService.request()` llama a
// esta función con cada error del mock. Mismas reglas:
// - Códigos con UI propia (login, cambio de contraseña, inactividad): sin toast.
// - `PASSWORD_CHANGE_REQUIRED` (o 403 sin código con la contraseña pendiente):
//   aviso + marca la sesión + redirige a /cambiar-password.
// - Resto de códigos del catálogo: toast con su mensaje.
// - 403 sin código: "sin permiso"; 5xx: error del servidor.
// - 400 sin código: lo decide cada formulario.
const CODES_WITH_OWN_UI = new Set(['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'SESSION_IDLE_TIMEOUT']);

const CHANGE_PASSWORD_URL = '/cambiar-password';

export interface BackendErrorAlertDeps {
  auth: { currentUser(): { mustChangePasswordHint: boolean } | null; markPasswordChangeRequired(): void };
  message: NzMessageService;
  router: Router;
}

export function notifyBackendError(err: HttpErrorResponse, { auth, message, router }: BackendErrorAlertDeps): void {
  const code = extractErrorCode(err);
  const gatewayPendingPassword = !code && err.status === 403 && auth.currentUser()?.mustChangePasswordHint === true;
  if (code === PASSWORD_CHANGE_REQUIRED_CODE || gatewayPendingPassword) {
    auth.markPasswordChangeRequired();
    if (!router.url.startsWith(CHANGE_PASSWORD_URL)) {
      message.warning(ERROR_CODE_MESSAGES[PASSWORD_CHANGE_REQUIRED_CODE]);
      void router.navigateByUrl(CHANGE_PASSWORD_URL);
    }
  } else if (code) {
    if (!CODES_WITH_OWN_UI.has(code)) {
      message.error(backendErrorMessage(err) ?? `Ocurrió un error inesperado (${code}).`);
    }
  } else if (err.status === 403) {
    message.error(FORBIDDEN_WITHOUT_CODE_MESSAGE);
  } else if (err.status >= 500) {
    message.error(SERVER_ERROR_MESSAGE);
  }
}
