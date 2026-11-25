import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { AccessCatalogService } from '../../../core/auth/access-catalog.service';
import { COUNTRY_PROFILE } from '../../../core/country/active-country';
import { OrganizationCatalogService } from '../../../core/services/organization-catalog.service';
import { PHONE_PATTERN, RoleId, fullName } from '../data/user-management.model';
import { UserManagementService } from '../data/user-management.service';

/**
 * Modal de alta de usuario (`POST /users`); al crear, abre el detalle del usuario nuevo.
 *
 * @see docs/codigo/usuarios-pantallas.md#alta-de-usuario
 */
@Component({
  selector: 'app-user-create-modal',
  imports: [ReactiveFormsModule, NzButtonModule, NzCardModule, NzInputModule, NzModalModule, NzSelectModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-create-modal.html',
  styleUrl: './user-create-modal.scss',
})
export class UserCreateModal {
  readonly open = model(false);

  private readonly service = inject(UserManagementService);
  private readonly accessCatalog = inject(AccessCatalogService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);
  protected readonly catalog = inject(OrganizationCatalogService);
  protected readonly country = inject(COUNTRY_PROFILE);

  protected readonly roleOptions = this.accessCatalog.roleOptions;
  protected readonly catalogLoading = this.accessCatalog.loading;

  // `required` sobre `roleIds` exige al menos un rol; `managerId` `null` = sin supervisor.
  protected readonly form = this.fb.group({
    firstName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    lastName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required, Validators.pattern(PHONE_PATTERN)]),
    roleIds: this.fb.control<RoleId[]>([], [Validators.required]),
    subsidiariaIds: this.fb.control<number[]>([]),
    ubicacionIds: this.fb.control<number[]>([]),
    managerId: this.fb.control<string | null>(null),
    active: this.fb.control(true),
  });

  // Signals para la plantilla: en zoneless `control.value` no dispara detección de cambios.
  private readonly subsidiariaIds = toSignal(this.form.controls.subsidiariaIds.valueChanges, {
    initialValue: this.form.controls.subsidiariaIds.value,
  });
  protected readonly isActive = toSignal(this.form.controls.active.valueChanges, {
    initialValue: this.form.controls.active.value,
  });

  protected readonly ubicacionOptions = computed(() => this.catalog.ubicacionesFor(this.subsidiariaIds()));
  protected readonly managerOptions = computed(() =>
    this.service.managerCandidates().map((m) => ({ value: m.id, label: fullName(m) })),
  );
  protected readonly submitting = signal(false);

  constructor() {
    // Quitar una subsidiaria quita sus ubicaciones elegidas.
    this.form.controls.subsidiariaIds.valueChanges.pipe(takeUntilDestroyed()).subscribe((ids) => {
      const ubicaciones = this.form.controls.ubicacionIds;
      ubicaciones.setValue(this.catalog.pruneUbicaciones(ubicaciones.value, ids));
    });

    // Al abrir se piden los combos (una vez por sesión); al cerrar el formulario vuelve en blanco.
    effect(() => {
      if (this.open()) {
        this.catalog.ensureLoaded();
      } else {
        this.form.reset();
      }
    });
  }

  protected onCancel(): void {
    if (this.submitting()) return;
    this.open.set(false);
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { firstName, lastName, email, phone, roleIds, subsidiariaIds, ubicacionIds, managerId, active } =
      this.form.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();
    if (this.service.allUsers().some((u) => u.email.toLowerCase() === normalizedEmail)) {
      this.message.error('Ya existe un usuario con ese correo.');
      return;
    }

    this.submitting.set(true);
    this.service
      .createUser({
        firstName,
        lastName,
        email,
        phone,
        roleIds,
        status: active ? 'active' : 'inactive',
        subsidiariaIds,
        ubicacionIds,
        managerId,
      })
      .subscribe({
        next: (user) => {
          this.submitting.set(false);
          this.open.set(false);
          this.message.success(`Usuario ${fullName(user)} creado. Su contraseña temporal aparece en "Organización".`);
          void this.router.navigate(['/usuarios', user.id]);
        },
        // El interceptor muestra el error (409, 400, 403); aquí solo se reactiva el formulario.
        error: () => this.submitting.set(false),
      });
  }
}
