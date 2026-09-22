import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AccessControlService } from '../data/access-control.service';
import { AuthService } from '../data/auth.service';
import { UserManagementService } from '../../user-management/data/user-management.service';

// Mínimo 8, al menos una letra y un dígito — más estricto que el `minLength(6)`
// de login.ts a propósito: ahí solo se valida "algo se escribió" para poder
// intentar el login (el backend real decide si es correcta); acá se está
// DEFINIENDO la contraseña nueva, donde sí aplica una regla real de fuerza.
const NEW_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/**
 * Cambio obligatorio de contraseña en el primer inicio de sesión —
 * `mustChangePassword: true` en `AppUser` (dato del backend). Pantalla fuera
 * de Shell (mismo criterio que `login`, ver login.scss): nadie debería ver
 * el header/menú de la app mientras esta obligación siga pendiente.
 * `mustChangePasswordGuard` (ruta) + `authGuard` (todo lo demás) cierran el
 * flujo por los dos lados — ver MASTER.md, "Patrón: refresh token de un
 * solo uso + cambio obligatorio de contraseña".
 */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, NzAlertModule, NzButtonModule, NzFormModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
})
export class ChangePassword {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessControlService);
  private readonly userMgmt = inject(UserManagementService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    currentPassword: this.fb.control('', [Validators.required]),
    newPassword: this.fb.control('', [Validators.required, Validators.pattern(NEW_PASSWORD_PATTERN)]),
    confirmPassword: this.fb.control('', [Validators.required]),
  });

  constructor() {
    const { currentPassword, newPassword, confirmPassword } = this.form.controls;

    // Las validaciones cruzadas se agregan DESPUÉS de construir el form (no
    // se pueden declarar inline arriba: necesitan una referencia a los
    // otros controles del mismo grupo, que ahí todavía no existen). Van
    // atadas al control DEPENDIENTE específico — no como validator de
    // grupo (`fb.group(..., { validators: [...] })`) — porque
    // `nz-form-control`/`nzErrorTip` solo miran el estado del control
    // individual que envuelven, nunca el del grupo: un validator de grupo
    // deja `form.invalid` en `true` (el botón sí se deshabilita) pero jamás
    // marca inválido al control hijo, así que el mensaje de error nunca
    // llegaría a mostrarse.
    newPassword.addValidators(sameAsValidator(currentPassword, 'sameAsCurrent'));
    confirmPassword.addValidators(sameAsValidator(newPassword, 'mismatch', { invertMatch: true }));

    // Sin esto, escribir en `currentPassword`/`newPassword` no re-evalúa la
    // validación de los controles que DEPENDEN de ellos — Angular solo
    // revalida un control cuando cambia SU PROPIO valor.
    currentPassword.valueChanges.subscribe(() => newPassword.updateValueAndValidity({ emitEvent: false }));
    newPassword.valueChanges.subscribe(() => confirmPassword.updateValueAndValidity({ emitEvent: false }));
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);

    const { currentPassword, newPassword } = this.form.getRawValue();

    // Simula latencia de red — mismo criterio que login.ts.
    setTimeout(() => {
      this.submitting.set(false);

      const ok = this.auth.changePassword(currentPassword, newPassword);
      if (!ok) {
        this.formError.set('La contraseña actual es incorrecta.');
        return;
      }

      // AuthService actualizó la CONTRASEÑA (mock de credenciales); acá se
      // apaga la bandera que la sesión sigue viendo en AppUser (ver
      // comentario en AuthService.changePassword sobre por qué son dos
      // servicios distintos, no uno).
      const appUserId = this.auth.currentUser()?.appUserId;
      if (appUserId) {
        this.userMgmt.clearMustChangePassword(appUserId);
      }

      this.message.success('Tu contraseña se actualizó correctamente.');
      this.router.navigateByUrl(this.access.homeRoute());
    }, 400);
  }
}

// `invertMatch: true` → inválido cuando SÍ coinciden (mismaAsCurrent: la
// nueva no puede ser igual a la actual). Sin él → inválido cuando NO
// coinciden (mismatch: confirmar debe ser IGUAL a la nueva). Un solo
// factory para las dos reglas en vez de dos funciones casi idénticas.
function sameAsValidator(
  other: { value: string },
  errorKey: string,
  options?: { invertMatch: boolean },
): ValidatorFn {
  return (control) => {
    const value = control.value as string;
    if (!value || !other.value) return null;
    const matches = value === other.value;
    const invalid = options?.invertMatch ? !matches : matches;
    return invalid ? { [errorKey]: true } : null;
  };
}
