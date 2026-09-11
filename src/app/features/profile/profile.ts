import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe, NgStyle } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { AuthService } from '../auth/data/auth.service';
import { UserManagementService } from '../user-management/data/user-management.service';
import { AppUser, GENDER_OPTIONS, PHONE_PATTERN, ROLE_LABEL, fullName } from '../user-management/data/user-management.model';
import { avatarTokensFor, initialsFor } from '../../shared/utils/avatar-color.util';

// `nz-date-picker` trabaja con `Date | null` — el model guarda la fecha
// (sin hora) como ISO string (`'yyyy-MM-dd'`) o `null`. Mismo cruce de
// frontera que `user-detail.ts` (ver ese archivo); se duplica aquí en vez
// de compartirse porque, por ahora, sigue siendo el único otro consumidor
// de `nz-date-picker` sobre este mismo campo.
function parseIsoDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIsoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/**
 * Perfil del usuario logeado — mismo registro, misma fuente de verdad que
 * `UserDetail` (ver `features/user-management/user-detail`): se resuelve el
 * `AppUser` vinculado a la sesión actual (`AuthUser.appUserId`) vía
 * `UserManagementService.findUser`, nunca datos propios de esta pantalla.
 * "Información general" + "Dirección" son de solo lectura por defecto; el
 * botón "Editar" del header habilita `infoForm` para ambas secciones a la
 * vez y guarda con el MISMO `UserManagementService.updateInfo` que usa
 * `UserDetail.onSaveInfo` — mismo criterio de edición inline (`isEditing`,
 * el `.info-field` cambia de valor a control sin cambiar de estructura, ver
 * MASTER.md).
 */
@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    NzAvatarModule,
    NzButtonModule,
    NzCardModule,
    NzDatePickerModule,
    NzInputModule,
    NzSelectModule,
    NgStyle,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly auth = inject(AuthService);
  private readonly userMgmt = inject(UserManagementService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly message = inject(NzMessageService);

  protected readonly fullName = fullName;
  protected readonly genderOptions = GENDER_OPTIONS;

  protected readonly user = computed<AppUser | null>(() => {
    const id = this.auth.currentUser()?.appUserId;
    return id ? this.userMgmt.findUser(id) : null;
  });

  protected readonly roleLabel = computed(() =>
    (this.user()?.roleIds ?? []).map((roleId) => ROLE_LABEL[roleId]).join(', '),
  );

  // Modo edición de "Información general" + "Dirección" — de solo lectura
  // por defecto; el botón "Editar" del header lo activa para AMBAS
  // secciones a la vez (un único `infoForm`, un único "Guardar cambios"),
  // igual criterio que `UserDetail.isEditing` (ver user-detail.ts).
  protected readonly isEditing = signal(false);

  protected readonly infoForm = this.fb.group({
    firstName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    lastName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required, Validators.pattern(PHONE_PATTERN)]),
    birthDate: this.fb.control<Date | null>(null),
    ssn: this.fb.control(''),
    gender: this.fb.control(''),
    address: this.fb.group({
      city: this.fb.control(''),
      state: this.fb.control(''),
      zipCode: this.fb.control(''),
      street1: this.fb.control(''),
      street2: this.fb.control<string | null>(null),
      exteriorNumber: this.fb.control(''),
      interiorNumber: this.fb.control<string | null>(null),
    }),
  });

  constructor() {
    // effect (no computed): reinicia el form + sale de modo edición cada vez
    // que cambia el usuario de sesión vinculado — mismo criterio que el
    // effect de `UserDetail` (ver ese archivo). untracked() al leer el
    // service evita que este effect se re-dispare por cualquier cambio en
    // el registro de usuarios, solo por un cambio de sesión real.
    effect(() => {
      const id = this.auth.currentUser()?.appUserId;
      const found = id ? untracked(() => this.userMgmt.findUser(id)) : null;
      this.resetForm(found);
      this.isEditing.set(false);
    });
  }

  private resetForm(user: AppUser | null): void {
    if (user) {
      this.infoForm.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        birthDate: parseIsoDate(user.birthDate),
        ssn: user.ssn,
        gender: user.gender,
        address: { ...user.address },
      });
    } else {
      this.infoForm.reset({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        birthDate: null,
        ssn: '',
        gender: '',
        address: { city: '', state: '', zipCode: '', street1: '', street2: null, exteriorNumber: '', interiorNumber: null },
      });
    }
  }

  protected onEditClick(): void {
    this.isEditing.set(true);
  }

  // Descarta cambios sin guardar y vuelve a la vista de solo lectura — sin
  // esto, "Cancelar edición" dejaría valores a medio escribir visibles la
  // próxima vez que se entre a editar.
  protected onCancelEditClick(): void {
    this.resetForm(this.user());
    this.isEditing.set(false);
  }

  protected onSaveInfo(): void {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const id = this.user()?.id;
    if (!id) return;

    const raw = this.infoForm.getRawValue();
    this.userMgmt.updateInfo(id, { ...raw, birthDate: toIsoDate(raw.birthDate) });
    this.message.success('Datos actualizados.');
    this.isEditing.set(false);
  }

  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }
}
