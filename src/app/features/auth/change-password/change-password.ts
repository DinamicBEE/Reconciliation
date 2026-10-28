import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { AuthService } from '../../../core/auth/auth.service';

// Mínimo 8, con letra y dígito: más estricto que login, que solo exige que se escriba algo.
const NEW_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/**
 * Cambio obligatorio de contraseña, fuera de `Shell` (sin header ni menú mientras esté pendiente).
 *
 * @see docs/codigo/sesion-y-acceso.md#cambio-de-contrasena
 * @see design-system/conciliation/MASTER.md "Patrón: refresh token de un solo uso + cambio obligatorio de contraseña + bloqueo por intentos fallidos"
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

    // En el control dependiente, no en el grupo: `nzErrorTip` solo lee el control.
    // Ver docs/codigo/sesion-y-acceso.md#cambio-de-contrasena
    newPassword.addValidators(sameAsValidator(currentPassword, 'sameAsCurrent'));
    confirmPassword.addValidators(sameAsValidator(newPassword, 'mismatch', { invertMatch: true }));

    // Angular solo revalida un control cuando cambia su propio valor.
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

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.submitting.set(false);

        // `AuthService` ya apagó `mustChangePasswordHint` en la sesión.

        this.message.success('Tu contraseña se actualizó correctamente.');
        this.router.navigateByUrl(this.access.homeRoute());
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        // 401: contraseña actual incorrecta; 400: nueva rechazada. El resto lo avisa el interceptor.
        if (err.status === 401) {
          this.formError.set('La contraseña actual es incorrecta.');
        } else if (err.status === 400) {
          this.formError.set('La contraseña nueva no cumple los requisitos (mínimo 8 caracteres).');
        } else if (err.status === 0) {
          this.formError.set('No se pudo conectar con el servidor. Intenta de nuevo.');
        } else {
          this.formError.set('No se pudo actualizar la contraseña. Intenta de nuevo.');
        }
      },
    });
  }
}

// Inválido si coincide con `other`; con `invertMatch`, si no coincide.
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
