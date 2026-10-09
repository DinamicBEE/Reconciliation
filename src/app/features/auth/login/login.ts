import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { ThemeService } from '../../../core/services/theme.service';
import { AccessControlService } from '../data/access-control.service';
import { AuthService } from '../data/auth.service';
import { extractErrorCode, serverErrorText } from '../data/auth-errors';
import { UserManagementService } from '../../user-management/data/user-management.service';

// Copys alineados TEXTUAL con el contrato real del backend
// (Auth_Service_Endpoints.pdf, sección "2. Codigos de error").
const INVALID_CREDENTIALS_MESSAGE = 'Usuario o contraseña inválidos.';
// Solo respaldo: el bloqueo temporal (5 intentos → 2 h) llega con el texto del
// backend, que incluye los minutos restantes (`serverErrorText`).
const BLOCKED_MESSAGE = 'Usuario bloqueado por intentos fallidos. Contacte al administrador.';
const CONNECTION_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Intenta de nuevo.';
// Texto propio del frontend (el backend decide por `code`, no por texto —
// ver auth-errors.ts).
const IDLE_TIMEOUT_MESSAGE = 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo para continuar.';
// `AuthService.request` invalida la sesión ante un 401 fuera de la ventana
// de refresco proactivo — ver AuthService.invalidateSession.
const INVALID_TOKEN_MESSAGE = 'Tu sesión ya no es válida. Inicia sesión de nuevo para continuar.';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, NzAlertModule, NzButtonModule, NzFormModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessControlService);
  private readonly userMgmt = inject(UserManagementService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly submitting = signal(false);
  protected readonly loginError = signal<string | null>(null);
  // Aviso de sesión cerrada sin que el usuario lo pidiera (inactividad o
  // token invalidado) — visible hasta el siguiente login exitoso (AuthService
  // limpia el motivo ahí) o hasta que haya un error de credenciales, que
  // tiene prioridad en el mismo lugar.
  protected readonly sessionNotice = computed(() => {
    if (this.loginError()) return null;
    const reason = this.auth.sessionEndReason();
    if (reason === 'idle_timeout') return IDLE_TIMEOUT_MESSAGE;
    if (reason === 'invalid_token') return INVALID_TOKEN_MESSAGE;
    return null;
  });

  protected readonly form = this.fb.group({
    username: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    password: this.fb.control('', [Validators.required, Validators.minLength(6)]),
  });

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loginError.set(null);
    this.submitting.set(true);

    const { username, password } = this.form.getRawValue();

    this.auth.login(username, password).subscribe({
      next: (result) => {
        this.submitting.set(false);

        // Vincula la sesión al registro local de `user-management` cuando el
        // email coincide con una cuenta de demo (ver
        // `UserManagementService.findUserByEmail`) — `null` si no hay match,
        // la sesión queda igual de autenticada, solo sin `AppUser` del que
        // leer permisos/nombre/foto (ver AuthService.AuthUser.appUserId).
        const appUserId = this.userMgmt.findUserByEmail(result.email)?.id ?? null;
        this.auth.completeLogin(result, appUserId);

        // Cambio de contraseña obligatorio pendiente → directo a esa
        // pantalla, ni siquiera pasa por homeRoute() (el propio authGuard
        // rebotaría ahí de todas formas al primer intento de navegación,
        // pero resolverlo aquí evita ese hop extra en el caso más común —
        // mismo criterio que ya se usa para homeRoute() abajo).
        if (this.access.mustChangePassword()) {
          this.router.navigateByUrl('/cambiar-password');
          return;
        }
        // No siempre es /dashboard — Administrador/Contabilidad/Tesorería
        // no pueden verlo, cada uno aterriza en la primera pantalla que sí
        // le corresponde (ver AccessControlService.homeRoute()).
        this.router.navigateByUrl(this.access.homeRoute());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        // 401/423 vienen del backend (GlobalExceptionHandler en
        // auth-service); status 0 es "no se pudo ni conectar" (backend
        // caído, CORS, red) — un mensaje genérico, no "usuario inválido",
        // que llevaría a la persona a sospechar de su contraseña en vez del
        // servidor.
        // Bloqueo (423 / ACCOUNT_LOCKED): se muestra el mensaje del backend
        // tal cual — trae los minutos que faltan para que la cuenta se
        // desbloquee sola (bloqueo temporal) o indica que debe contactar al
        // administrador (bloqueo manual).
        if (err.status === 423 || extractErrorCode(err) === 'ACCOUNT_LOCKED') {
          this.loginError.set(serverErrorText(err) ?? BLOCKED_MESSAGE);
        } else if (err.status === 401) {
          this.loginError.set(INVALID_CREDENTIALS_MESSAGE);
        } else {
          this.loginError.set(CONNECTION_ERROR_MESSAGE);
        }
      },
    });
  }
}
