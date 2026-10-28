import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, untracked } from '@angular/core';
import { DatePipe, NgStyle } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { AuthService } from '../../../core/auth/auth.service';
import { UserManagementService } from '../data/user-management.service';
import { AccessCatalogService } from '../../../core/auth/access-catalog.service';
import { AppUser, GENDER_OPTIONS, PHONE_PATTERN, fullName } from '../data/user-management.model';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { COUNTRY_PROFILE } from '../../../core/country/active-country';
import { parseIsoDate, toIsoDate } from '../../../shared/utils/iso-date.util';

/**
 * Perfil propio: `AppUser` de la sesión (`UserManagementService.currentAppUser`) con edición inline.
 *
 * @see docs/codigo/usuarios-pantallas.md#perfil-propio
 */
@Component({
  selector: 'app-profile',
  imports: [
    NzPageHeaderModule,
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
  private readonly accessCatalog = inject(AccessCatalogService);
  private readonly fb = inject(NonNullableFormBuilder);
  // Vocabulario del país activo: identificación personal, dirección, teléfono.
  protected readonly country = inject(COUNTRY_PROFILE);
  private readonly message = inject(NzMessageService);

  protected readonly fullName = fullName;
  protected readonly genderOptions = GENDER_OPTIONS;

  protected readonly user = this.userMgmt.currentAppUser;

  // Roles de la sesión con el nombre de `GET /roles`.
  protected readonly roleLabel = computed(() =>
    (this.auth.currentUser()?.roles ?? []).map((roleId) => this.accessCatalog.roleLabel(roleId)).join(', '),
  );

  // Email de la sesión: cambia con la persona, no con cada refresh de token.
  private readonly sessionEmail = computed(() => this.auth.currentUser()?.username ?? null);
  // Modo edición de ambas secciones; se reinicia al cambiar la persona de sesión.
  protected readonly isEditing = linkedSignal(() => {
    this.sessionEmail();
    return false;
  });

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
    // Sincroniza el formulario al cambiar la persona; `untracked` evita dispararlo
    // por cambios en el registro de usuarios.
    effect(() => {
      const email = this.sessionEmail();
      const found = email ? untracked(() => this.userMgmt.findUserByEmail(email)) : null;
      untracked(() => this.resetForm(found));
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

  // Descarta lo no guardado y vuelve a solo lectura.
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
