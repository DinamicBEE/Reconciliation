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
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { AppUser, ROLE_OPTIONS, fullName } from '../data/user-management.model';
import { RoleFilter, StatusFilter, UserManagementService } from '../data/user-management.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';

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
    NzSwitchModule,
    NzDropdownModule,
    NzMenuModule,
    NzModalModule,
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

  protected readonly roleOptions: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'Todos los roles' },
    ...ROLE_OPTIONS,
  ];

  protected readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
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

  // El switch vive en una celda con (click)="$event.stopPropagation()" (ver
  // template) para no disparar también onRowClick de la fila completa.
  protected onToggleStatus(user: AppUser, checked: boolean): void {
    this.service.setStatus(user.id, checked ? 'active' : 'inactive');
    this.message.success(checked ? `${fullName(user)} fue activado.` : `${fullName(user)} fue desactivado.`);
  }

  // Confirmación vía NzModalService (no nz-popconfirm) — un popconfirm
  // anidado dentro de un item de nz-dropdown-menu compite con el cierre
  // automático del menú al hacer click; Modal.confirm() es una llamada
  // programática independiente del menú, sin ese conflicto.
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
