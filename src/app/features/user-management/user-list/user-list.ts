import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { AppUser, ROLE_OPTIONS, RoleId, STATUS_META, STATUS_OPTIONS, UserStatus, defaultPermissionsForRoles, fullName } from '../data/user-management.model';
import { RoleFilter, StatusFilter, UserManagementService } from '../data/user-management.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { StatusChip } from '../status-chip/status-chip';

@Component({
  selector: 'app-user-list',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NzButtonModule,
    NzCardModule,
    NzTableModule,
    NzSelectModule,
    NzInputModule,
    NzAvatarModule,
    NzCheckboxModule,
    NzTooltipModule,
    NzModalModule,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
})
export class UserList {
  protected readonly service = inject(UserManagementService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  protected readonly fullName = fullName;
  protected readonly statusMeta = STATUS_META;
  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly roleFilterOptions: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'Todos los roles' },
    ...ROLE_OPTIONS,
  ];

  protected readonly statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    ...STATUS_OPTIONS,
  ];

  protected onSearchChange(value: string): void {
    this.service.setSearch(value);
  }

  protected onRoleFilterChange(value: RoleFilter): void {
    this.service.setRoleFilter(value);
  }

  protected onStatusFilterChange(value: StatusFilter): void {
    this.service.setStatusFilter(value);
  }

  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }

  protected onRowClick(user: AppUser): void {
    this.router.navigate(['/usuarios', user.id]);
  }

  // --- Selección (checkbox de la primera columna) ---
  protected onToggleSelectAll(): void {
    this.service.toggleSelectAllFiltered();
  }

  protected onToggleRowSelect(userId: string): void {
    this.service.toggleSelect(userId);
  }

  // --- Rol: selector sin bordes directo en la fila, sin confirmación (mismo
  // criterio inmediato que el resto de acciones rápidas de la lista) ---
  protected onRoleQuickChange(user: AppUser, roleIds: RoleId[]): void {
    if (roleIds.length === 0) {
      this.message.error('Selecciona al menos un rol.');
      return;
    }
    this.service.changeRoles(user.id, roleIds, defaultPermissionsForRoles(roleIds));
    this.message.success(`Roles de ${fullName(user)} actualizados.`);
  }

  // --- Estado: el chip emite la intención, la confirmación vive aquí (mismo
  // patrón en user-detail, ver StatusChip) ---
  protected onStatusChangeRequest(user: AppUser, next: UserStatus): void {
    const label = STATUS_META[next].label;
    this.modal.confirm({
      nzTitle: 'Cambiar estado',
      nzContent: `¿Cambiar el estado de <b>${fullName(user)}</b> a <b>${label}</b>?`,
      nzOkText: 'Cambiar',
      nzOnOk: () => {
        this.service.setStatus(user.id, next);
        this.message.success(`Estado de ${fullName(user)} actualizado a ${label}.`);
      },
    });
  }

  protected onResetPasswordClick(user: AppUser): void {
    this.modal.confirm({
      nzTitle: 'Restablecer contraseña',
      nzContent: `¿Restablecer la contraseña de <b>${fullName(user)}</b>? Se generará una nueva contraseña temporal.`,
      nzOkText: 'Restablecer',
      nzOnOk: () => {
        const tempPassword = this.service.resetPassword(user.id);
        if (tempPassword) {
          this.message.success(`Contraseña de ${fullName(user)} restablecida. Temporal: ${tempPassword}`, { nzDuration: 8000 });
        }
      },
    });
  }

  protected onDeleteClick(user: AppUser): void {
    this.modal.confirm({
      nzTitle: 'Eliminar usuario',
      nzContent: `¿Eliminar a <b>${fullName(user)}</b>? Esta acción no se puede deshacer.`,
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzOnOk: () => {
        this.service.deleteUser(user.id);
        this.message.success(`${fullName(user)} fue eliminado.`);
      },
    });
  }
}
