import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { ThemeService } from '../../../core/services/theme.service';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { AuthService } from '../../../core/auth/auth.service';
import { extractErrorCode, serverErrorText } from '../../../core/auth/auth-errors';

// Textos iguales a los del backend ("Códigos de error"). Ver docs/codigo/sesion-y-acceso.md#login
const INVALID_CREDENTIALS_MESSAGE = 'Usuario o contraseña inválidos.';
// Respaldo: el 423 suele traer el texto del backend con los minutos restantes.
const BLOCKED_MESSAGE = 'Usuario bloqueado por intentos fallidos. Contacte al administrador.';
const CONNECTION_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Intenta de nuevo.';
const IDLE_TIMEOUT_MESSAGE = 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo para continuar.';
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
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly submitting = signal(false);
  protected readonly loginError = signal<string | null>(null);
  // Aviso de cierre no pedido; cede el lugar a un error de credenciales.
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

        this.auth.completeLogin(result);

        // Directo a /cambiar-password: evita el salto extra por `authGuard`.
        if (this.access.mustChangePassword()) {
          this.router.navigateByUrl('/cambiar-password');
          return;
        }
        this.router.navigateByUrl(this.access.homeRoute());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        // 423 muestra el texto del backend; status 0 u otro, error de conexión.
        // Ver docs/codigo/sesion-y-acceso.md#login
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
