import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import {
  AppUser,
  AUDIT_ACTION_LABEL,
  PERMISSIONS,
  PermissionDef,
  PermissionKey,
  ROLE_OPTIONS,
  ROLES,
  RoleId,
} from '../data/user-management.model';
import { UserManagementService } from '../data/user-management.service';

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

@Component({
  selector: 'app-user-detail',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    NzButtonModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzSwitchModule,
    NzCheckboxModule,
    NzTabsModule,
    NzModalModule,
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

  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly permissionGroups = PERMISSION_GROUPS;
  protected readonly auditActionLabel = AUDIT_ACTION_LABEL;

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

  // Nombre/correo con validación real (requerido, formato) → Reactive Forms,
  // mismo criterio que login.ts. Rol/estado/permisos son controles simples
  // sin reglas de validación propias → ngModel directo (mismo criterio que
  // los filtros de reconciliation-dashboard) — de ahí la mezcla de
  // FormsModule + ReactiveFormsModule en este componente.
  protected readonly infoForm = this.fb.group({
    fullName: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    email: this.fb.control('', [Validators.required, Validators.email]),
  });

  // --- Estado local de creación (solo aplica cuando isCreate()) ---
  protected readonly createRoleId = signal<RoleId | null>(null);
  protected readonly createActive = signal(true);

  // --- Borrador de "Roles y permisos" (solo aplica editando un usuario existente) ---
  protected readonly draftRoleId = signal<RoleId | null>(null);
  protected readonly draftPermissions = signal<Set<PermissionKey>>(new Set());

  constructor() {
    // effect (no computed): reinicia formulario + borradores al entrar a un
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
        this.infoForm.reset({ fullName: found.fullName, email: found.email });
        this.draftRoleId.set(found.roleId);
        this.draftPermissions.set(new Set(found.permissions));
      } else {
        this.infoForm.reset({ fullName: '', email: '' });
        this.createRoleId.set(null);
        this.createActive.set(true);
        this.draftRoleId.set(null);
        this.draftPermissions.set(new Set());
      }
    });
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

  // Cambiar de rol resetea el borrador de permisos a los defaults de ese rol
  // — el admin ajusta desde ahí (ver UserManagementService.changeRole).
  protected onRoleSelectChange(roleId: RoleId): void {
    this.draftRoleId.set(roleId);
    const role = ROLES.find((r) => r.id === roleId)!;
    this.draftPermissions.set(new Set(role.defaultPermissions));
  }

  protected onSaveInfo(): void {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const id = this.userId();
    if (!id) return;

    this.service.updateInfo(id, this.infoForm.getRawValue());
    this.message.success('Datos actualizados.');
  }

  protected onSaveRoleAndPermissions(): void {
    const id = this.userId();
    const roleId = this.draftRoleId();
    if (!id || !roleId) return;

    this.service.changeRole(id, roleId, [...this.draftPermissions()]);
    this.message.success('Rol y permisos actualizados.');
  }

  protected onToggleStatus(checked: boolean): void {
    const id = this.userId();
    if (!id) return;

    this.service.setStatus(id, checked ? 'active' : 'inactive');
    this.message.success(checked ? 'Cuenta activada.' : 'Cuenta desactivada.');
  }

  protected onResetPasswordClick(): void {
    const user = this.user();
    if (!user) return;

    this.modal.confirm({
      nzTitle: 'Restablecer contraseña',
      nzContent: `¿Restablecer la contraseña de <b>${user.fullName}</b>? Se generará una nueva contraseña temporal.`,
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
      nzContent: `¿Eliminar a <b>${user.fullName}</b>? Esta acción no se puede deshacer.`,
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
    if (this.infoForm.invalid || !this.createRoleId()) {
      this.infoForm.markAllAsTouched();
      return;
    }

    const { fullName, email } = this.infoForm.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();
    const emailTaken = this.service.allUsers().some((u) => u.email.toLowerCase() === normalizedEmail);
    if (emailTaken) {
      this.message.error('Ya existe un usuario con ese correo.');
      return;
    }

    const user = this.service.createUser({
      fullName,
      email,
      roleId: this.createRoleId()!,
      status: this.createActive() ? 'active' : 'inactive',
    });
    this.message.success(`Usuario ${user.fullName} creado.`);
    this.router.navigate(['/usuarios', user.id]);
  }
}
