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
import { UserManagementService } from '../../user-management/data/user-management.service';

// Copys alineados TEXTUAL con el contrato real del backend
// (Auth_Service_Endpoints.pdf, sección "2. Codigos de error") — no
// paráfrasis propia, para que el usuario vea el MISMO mensaje el día que
// esto se conecte a la API real.
const INVALID_CREDENTIALS_MESSAGE = 'Usuario o contraseña inválidos.';
const BLOCKED_MESSAGE = 'Usuario bloqueado por intentos fallidos. Contacte al administrador.';
// Texto propio del frontend (el backend decide por `code`, no por texto —
// ver auth-errors.ts).
const IDLE_TIMEOUT_MESSAGE = 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo para continuar.';

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
  // Aviso de sesión cerrada por inactividad — visible hasta el siguiente
  // login exitoso (AuthService limpia el motivo ahí) o hasta que haya un
  // error de credenciales, que tiene prioridad en el mismo lugar.
  protected readonly sessionNotice = computed(() =>
    this.auth.sessionEndReason() === 'idle_timeout' && !this.loginError() ? IDLE_TIMEOUT_MESSAGE : null,
  );

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
    // Resuelto ANTES del intento (no depende de si la contraseña es
    // correcta) — el backend real bloquea por cuenta, no por intento
    // puntual: una cuenta ya bloqueada rechaza incluso con la contraseña
    // correcta (HTTP 423), mismo criterio aquí. `null` si el username no
    // corresponde a ninguna cuenta — ver `recordFailedLogin`/bloque `else`
    // abajo, donde ese caso simplemente no contabiliza nada (no hay cuenta
    // real a la que sumarle un intento fallido).
    const appUserId = this.auth.findAppUserIdForUsername(username);

    // Simula latencia de red — cuando exista backend, esto se reemplaza por
    // una llamada HTTP real; el resto del componente no se entera.
    setTimeout(() => {
      if (appUserId && this.userMgmt.findUser(appUserId)?.status === 'blocked') {
        this.submitting.set(false);
        this.loginError.set(BLOCKED_MESSAGE);
        return;
      }

      const ok = this.auth.login(username, password);
      this.submitting.set(false);

      if (ok) {
        if (appUserId) {
          this.userMgmt.clearFailedLogins(appUserId);
        }
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
        return;
      }

      // Contraseña incorrecta sobre una cuenta real (appUserId no nulo) —
      // cuenta el intento. Si ESTE intento es el que llega al umbral,
      // `recordFailedLogin` ya dejó la cuenta bloqueada: se muestra el
      // mensaje de bloqueo en vez del genérico, igual que mostraría el
      // backend real en la siguiente petición.
      if (appUserId) {
        this.userMgmt.recordFailedLogin(appUserId);
        if (this.userMgmt.findUser(appUserId)?.status === 'blocked') {
          this.loginError.set(BLOCKED_MESSAGE);
          return;
        }
      }
      this.loginError.set(INVALID_CREDENTIALS_MESSAGE);
    }, 400);
  }
}
