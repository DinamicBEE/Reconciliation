import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import {
  AppUser,
  AUDIT_ACTION_LABEL,
  GENDER_OPTIONS,
  PERMISSIONS,
  PermissionDef,
  PermissionKey,
  PHONE_PATTERN,
  ROLE_LABEL,
  ROLE_OPTIONS,
  RoleId,
  STATUS_META,
  UserStatus,
  defaultPermissionsForRoles,
  fullName,
} from '../data/user-management.model';
import { UserManagementService } from '../data/user-management.service';
import { AREAS, DEPARTMENTS, JOB_TITLES } from '../data/organization-catalog';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { StatusChip } from '../status-chip/status-chip';

// Agrupación estática de PERMISSIONS por `group` — se calcula una sola vez
// al cargar el módulo (la lista de permisos no cambia en runtime), no en
// cada render.
const PERMISSION_GROUPS: { group: string; items: PermissionDef[] }[] = (() => {
  const byGroup = new Map<string, PermissionDef[]>();
  for (const permission of PERMISSIONS) {
    if (!byGroup.has(permission.group)) byGroup.set(permission.group, []);
    byGroup.get(permission.group)!.push(permission);
  }
  return [...byGroup.entries()].map(([group, items]) => ({ group, items }));
})();

// `nz-date-picker` trabaja con `Date | null` — el model guarda fecha (sin
// hora) como ISO string (`'yyyy-MM-dd'`) o `null`. Estas 2 funciones son las
// únicas que cruzan esa frontera, en los 2 sentidos.
function parseIsoDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIsoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

function toIsoDateOrNull(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

@Component({
  selector: 'app-user-detail',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    NzAvatarModule,
    NzButtonModule,
    NzCardModule,
    NzDatePickerModule,
    NzInputModule,
    NzSelectModule,
    NzSwitchModule,
    NzCheckboxModule,
    NzTagModule,
    NzTabsModule,
    NzModalModule,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-detail.html',
  styleUrl: './user-detail.scss',
})
export class UserDetail {
  // Ligado a :userId de la ruta (withComponentInputBinding) — ausente en
  // /usuarios/nuevo, que apunta a este mismo componente en modo creación
  // (ver app.routes.ts).
  readonly userId = input<string>();

  protected readonly service = inject(UserManagementService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  protected readonly fullName = fullName;
  protected readonly statusMeta = STATUS_META;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly permissionGroups = PERMISSION_GROUPS;
  protected readonly auditActionLabel = AUDIT_ACTION_LABEL;
  protected readonly departments = DEPARTMENTS;
  protected readonly areas = AREAS;
  protected readonly jobTitles = JOB_TITLES;
  protected readonly genderOptions = GENDER_OPTIONS;

  protected readonly isCreate = computed(() => !this.userId());

  protected readonly user = computed<AppUser | null>(() => {
    const id = this.userId();
    return id ? (this.service.allUsers().find((u) => u.id === id) ?? null) : null;
  });

  // Hay :userId en la ruta pero no hay usuario con ese id — eliminado o
  // inexistente. Distinto de isCreate() (sin :userId en absoluto).
  protected readonly notFound = computed(() => !!this.userId() && this.user() === null);

  protected readonly userAudit = computed(() => {
    const id = this.userId();
    return id ? this.service.auditForUser(id) : [];
  });

  // Candidatos a "Administrador responsable" — cualquier admin/supervisor
  // EXCEPTO el propio usuario que se está editando (no puede ser su propio
  // responsable).
  protected readonly managerOptions = computed(() => {
    const id = this.userId();
    return this.service
      .managerCandidates()
      .filter((m) => m.id !== id)
      .map((m) => ({ value: m.id, label: fullName(m) }));
  });

  protected readonly manager = computed<AppUser | null>(() => {
    const u = this.user();
    if (!u?.managerId) return null;
    return this.service.allUsers().find((m) => m.id === u.managerId) ?? null;
  });

  // Mismo helper que user-list.ts para el avatar (foto real con fallback a
  // iniciales+color, ver AppUser.avatarUrl) — aquí en un avatar rectangular
  // más grande, no el circular pequeño de la fila de una tabla.
  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }

  // Nombre/correo/teléfono con validación real (requerido, formato) →
  // Reactive Forms, mismo criterio que login.ts. Roles/permisos/estado son
  // controles simples sin reglas de validación propias → ngModel directo
  // (mismo criterio que los filtros de reconciliation-dashboard) — de ahí la
  // mezcla de FormsModule + ReactiveFormsModule en este componente.
  protected readonly infoForm = this.fb.group({
    firstName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    lastName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required, Validators.pattern(PHONE_PATTERN)]),
    // Fecha de nacimiento/SSN/género/dirección — igual que "Organización":
    // no se piden al crear, sin validadores propios (datos de referencia,
    // no credenciales de acceso).
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

  // "Organización" no se pide al crear — solo aplica editando un usuario
  // existente (ver CreateUserInput / UserManagementService.createUser).
  protected readonly orgForm = this.fb.group({
    department: this.fb.control(''),
    area: this.fb.control(''),
    jobTitle: this.fb.control(''),
    managerId: this.fb.control<string | null>(null),
    employeeId: this.fb.control(''),
    hireDate: this.fb.control<Date | null>(null),
    contractEndDate: this.fb.control<Date | null>(null),
  });

  // --- Estado local de creación (solo aplica cuando isCreate()) ---
  protected readonly createRoleIds = signal<RoleId[]>([]);
  protected readonly createActive = signal(true);

  // --- Borrador de "Seguridad y acceso" (solo aplica editando un usuario existente) ---
  protected readonly draftRoleIds = signal<RoleId[]>([]);
  protected readonly draftPermissions = signal<Set<PermissionKey>>(new Set());

  // --- Modo edición de "Información general" (datos personales +
  // organización) — de solo lectura por defecto; el botón "Editar" del
  // header (junto a "Eliminar usuario") lo activa para AMBAS sub-cards a la
  // vez, ya que viven bajo el mismo botón (ver user-detail.html). No aplica
  // a "Seguridad y acceso" (roles/permisos ya tienen su propio flujo de
  // edición directa, con su propio botón "Guardar permisos").
  protected readonly isEditing = signal(false);

  constructor() {
    // effect (no computed): reinicia formularios + borradores al entrar a un
    // usuario distinto — tiene side-effects (patchValue, reset), mismo
    // criterio que DifferenceManagement con tenderMedia()/orderId() (ver
    // difference-management.ts). untracked() al leer el service evita que
    // este effect se re-dispare cada vez que CUALQUIER usuario cambia (solo
    // debe reaccionar a la navegación, no a los propios guardados que este
    // mismo componente dispara).
    effect(() => {
      const id = this.userId();
      const found = id ? untracked(() => this.service.allUsers().find((u) => u.id === id) ?? null) : null;

      if (found) {
        this.infoForm.reset({
          firstName: found.firstName,
          lastName: found.lastName,
          email: found.email,
          phone: found.phone,
          birthDate: parseIsoDate(found.birthDate),
          ssn: found.ssn,
          gender: found.gender,
          address: { ...found.address },
        });
        this.orgForm.reset({
          department: found.department,
          area: found.area,
          jobTitle: found.jobTitle,
          managerId: found.managerId,
          employeeId: found.employeeId,
          hireDate: parseIsoDate(found.hireDate),
          contractEndDate: parseIsoDate(found.contractEndDate),
        });
        this.draftRoleIds.set([...found.roleIds]);
        this.draftPermissions.set(new Set(found.permissions));
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
        this.orgForm.reset({ department: '', area: '', jobTitle: '', managerId: null, employeeId: '', hireDate: null, contractEndDate: null });
        this.createRoleIds.set([]);
        this.createActive.set(true);
        this.draftRoleIds.set([]);
        this.draftPermissions.set(new Set());
      }
      // Nunca entrar a un usuario (o volver a /usuarios/nuevo) ya en modo
      // edición — es estado de ESTA visita a la pantalla, no debe sobrevivir
      // a la navegación.
      this.isEditing.set(false);
    });
  }

  protected onEditClick(): void {
    this.isEditing.set(true);
  }

  // Descarta cambios sin guardar en ambos formularios (info + organización)
  // y vuelve a la vista de solo lectura — sin esto, "Cancelar" dejaría
  // valores a medio escribir visibles la próxima vez que se entre a editar.
  protected onCancelEditClick(): void {
    const user = this.user();
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
      this.orgForm.reset({
        department: user.department,
        area: user.area,
        jobTitle: user.jobTitle,
        managerId: user.managerId,
        employeeId: user.employeeId,
        hireDate: parseIsoDate(user.hireDate),
        contractEndDate: parseIsoDate(user.contractEndDate),
      });
    }
    this.isEditing.set(false);
  }

  protected isPermissionChecked(key: PermissionKey): boolean {
    return this.draftPermissions().has(key);
  }

  protected onPermissionToggle(key: PermissionKey, checked: boolean): void {
    this.draftPermissions.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  // Cambiar los roles asignados resetea el borrador de permisos a la unión
  // de los defaults de esos roles — el admin ajusta desde ahí (ver
  // UserManagementService.changeRoles).
  protected onRolesSelectChange(roleIds: RoleId[]): void {
    this.draftRoleIds.set(roleIds);
    this.draftPermissions.set(new Set(defaultPermissionsForRoles(roleIds)));
  }

  protected onSaveInfo(): void {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const id = this.userId();
    if (!id) return;

    const raw = this.infoForm.getRawValue();
    this.service.updateInfo(id, { ...raw, birthDate: toIsoDate(raw.birthDate) });
    this.message.success('Datos actualizados.');
    this.isEditing.set(false);
  }

  protected onSaveOrganization(): void {
    const id = this.userId();
    if (!id) return;

    const raw = this.orgForm.getRawValue();
    this.service.updateOrganization(id, {
      ...raw,
      hireDate: toIsoDate(raw.hireDate),
      contractEndDate: toIsoDateOrNull(raw.contractEndDate),
    });
    this.message.success('Datos de organización actualizados.');
    this.isEditing.set(false);
  }

  protected onSaveRolesAndPermissions(): void {
    const id = this.userId();
    if (!id) return;

    if (this.draftRoleIds().length === 0) {
      this.message.error('Selecciona al menos un rol.');
      return;
    }

    this.service.changeRoles(id, this.draftRoleIds(), [...this.draftPermissions()]);
    this.message.success('Roles y permisos actualizados.');
  }

  // El chip emite la intención, la confirmación vive aquí — mismo patrón
  // que UserList.onStatusChangeRequest (ver StatusChip).
  protected onStatusChangeRequest(next: UserStatus): void {
    const user = this.user();
    if (!user) return;

    const label = STATUS_META[next].label;
    this.modal.confirm({
      nzTitle: 'Cambiar estado',
      nzContent: `¿Cambiar el estado de <b>${fullName(user)}</b> a <b>${label}</b>?`,
      nzOkText: 'Cambiar',
      nzOnOk: () => {
        this.service.setStatus(user.id, next);
        this.message.success(`Estado actualizado a ${label}.`);
      },
    });
  }

  protected onVerifyEmailClick(): void {
    const id = this.userId();
    if (!id) return;

    this.service.setEmailVerified(id);
    this.message.success('Correo marcado como verificado.');
  }

  protected onCloseSessionsClick(): void {
    const id = this.userId();
    if (!id) return;

    this.service.closeSessions(id);
    this.message.success('Sesiones activas cerradas.');
  }

  protected onResetPasswordClick(): void {
    const user = this.user();
    if (!user) return;

    this.modal.confirm({
      nzTitle: 'Restablecer contraseña',
      nzContent: `¿Restablecer la contraseña de <b>${fullName(user)}</b>? Se generará una nueva contraseña temporal.`,
      nzOkText: 'Restablecer',
      nzOnOk: () => {
        const tempPassword = this.service.resetPassword(user.id);
        if (tempPassword) {
          this.message.success(`Contraseña restablecida. Temporal: ${tempPassword}`, { nzDuration: 8000 });
        }
      },
    });
  }

  protected onDeleteClick(): void {
    const user = this.user();
    if (!user) return;

    this.modal.confirm({
      nzTitle: 'Eliminar usuario',
      nzContent: `¿Eliminar a <b>${fullName(user)}</b>? Esta acción no se puede deshacer.`,
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzOnOk: () => {
        this.service.deleteUser(user.id);
        this.message.success('Usuario eliminado.');
        this.router.navigateByUrl('/usuarios');
      },
    });
  }

  protected onCreateSubmit(): void {
    if (this.infoForm.invalid || this.createRoleIds().length === 0) {
      this.infoForm.markAllAsTouched();
      if (this.createRoleIds().length === 0) {
        this.message.error('Selecciona al menos un rol.');
      }
      return;
    }

    const { firstName, lastName, email, phone } = this.infoForm.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();
    const emailTaken = this.service.allUsers().some((u) => u.email.toLowerCase() === normalizedEmail);
    if (emailTaken) {
      this.message.error('Ya existe un usuario con ese correo.');
      return;
    }

    const user = this.service.createUser({
      firstName,
      lastName,
      email,
      phone,
      roleIds: this.createRoleIds(),
      status: this.createActive() ? 'active' : 'inactive',
    });
    this.message.success(`Usuario ${fullName(user)} creado.`);
    this.router.navigate(['/usuarios', user.id]);
  }
}
