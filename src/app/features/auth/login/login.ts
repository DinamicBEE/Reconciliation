import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { ThemeService } from '../../../core/services/theme.service';
import { AccessControlService } from '../data/access-control.service';
import { AuthService } from '../data/auth.service';

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

    // Simula latencia de red — cuando exista backend, esto se reemplaza por
    // una llamada HTTP real; el resto del componente no se entera.
    setTimeout(() => {
      const ok = this.auth.login(username, password);
      this.submitting.set(false);

      if (ok) {
        // No siempre es /dashboard — Administrador/Contabilidad/Tesorería
        // no pueden verlo, cada uno aterriza en la primera pantalla que sí
        // le corresponde (ver AccessControlService.homeRoute()).
        this.router.navigateByUrl(this.access.homeRoute());
      } else {
        this.loginError.set('Usuario o contraseña incorrectos. Verifica tus datos e intenta de nuevo.');
      }
    }, 400);
  }
}
