import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { HttpErrorResponse } from '@angular/common/http';
import { AppUser, RoleId, STATUS_META, STATUS_OPTIONS, UserStatus, fullName } from '../data/user-management.model';
import { AccessCatalogService } from '../data/access-catalog.service';
import { AccessControlService } from '../../auth/data/access-control.service';
import { RoleFilter, StatusFilter, UserManagementService } from '../data/user-management.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { StatusChip } from '../status-chip/status-chip';

@Component({
  selector: 'app-user-list',
  imports: [
    NzPageHeaderModule,
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
  private readonly accessCatalog = inject(AccessCatalogService);
  private readonly access = inject(AccessControlService);

  protected readonly fullName = fullName;
  protected readonly statusMeta = STATUS_META;
  // Roles de `GET /roles` (ver AccessCatalogService) — filtro y selector de la fila.
  protected readonly roleOptions = this.accessCatalog.roleOptions;
  protected readonly rolesLoading = this.accessCatalog.loading;
  // Cambiar roles exige `manage_roles` (403 ROLE_ASSIGNMENT_FORBIDDEN si falta).
  protected readonly canChangeRoles = computed(() => this.access.hasPermission('manage_roles'));

  protected readonly roleFilterOptions = computed<{ value: RoleFilter; label: string }[]>(() => [
    { value: 'all', label: 'Todos los roles' },
    ...this.accessCatalog.roleOptions(),
  ]);

  protected readonly statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos los estados' },
    ...STATUS_OPTIONS,
  ];

  constructor() {
    // Reconcilia la lista mock con el backend real (GET /users) al entrar a
    // la pantalla, best-effort — ver UserManagementService.syncFromBackend.
    this.service.syncFromBackend();
  }

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
    // `PATCH /users/{id}/roles` real: el cambio de rol restablece los permisos a
    // los defaults de los nuevos roles (la regla la aplica el front, el backend
    // guarda el resultado final). Si falla, `user.roleIds` no cambió y el
    // selector vuelve a mostrar los roles reales al re-renderizar.
    this.service.changeRoles(user.id, roleIds, this.accessCatalog.defaultPermissionsForRoles(roleIds)).subscribe({
      next: () => this.message.success(`Roles de ${fullName(user)} actualizados.`),
      error: (err: unknown) => this.showMutationError(err),
    });
  }

  // El 403 (falta `manage_roles`), 400 y 404 con código los avisa
  // `notifyBackendError`; aquí solo la caída de red y los errores locales
  // del servicio.
  private showMutationError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) this.message.error('No se pudo conectar con el servidor. Intenta de nuevo.');
      return;
    }
    this.message.error(err instanceof Error ? err.message : 'No se pudo completar la acción.');
  }

  // --- Estado: el chip emite la intención, la confirmación vive aquí (mismo
  // patrón en user-detail, ver StatusChip). `PATCH /users/{id}/status` real
  // (ver `UserManagementService.setStatus`) — el modal se queda abierto/
  // girando (`nzOnOk` devuelve una Promise) hasta que el backend responde. ---
  protected onStatusChangeRequest(user: AppUser, next: UserStatus): void {
    const label = STATUS_META[next].label;
    this.modal.confirm({
      nzTitle: 'Cambiar estado',
      nzContent: `¿Cambiar el estado de <b>${fullName(user)}</b> a <b>${label}</b>?`,
      nzOkText: 'Cambiar',
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          this.service.setStatus(user.id, next).subscribe({
            next: () => {
              this.message.success(`Estado de ${fullName(user)} actualizado a ${label}.`);
              resolve();
            },
            error: (err: unknown) => {
              // Errores con respuesta del backend (403 sin permiso, códigos
              // de negocio) los avisa `notifyBackendError`; aquí solo
              // la caída de red y los errores locales del servicio.
              if (err instanceof HttpErrorResponse) {
                if (err.status === 0) this.message.error('No se pudo conectar con el servidor. Intenta de nuevo.');
              } else {
                this.message.error(err instanceof Error ? err.message : 'No se pudo completar la acción.');
              }
              reject();
            },
          });
        }),
    });
  }

  // `POST /users/{id}/reset-password` real: la persona vuelve a su contraseña
  // temporal, debe cambiarla al entrar y SE CIERRAN todas sus sesiones. El modal
  // queda girando hasta que el backend responde.
  protected onResetPasswordClick(user: AppUser): void {
    this.modal.confirm({
      nzTitle: 'Restablecer contraseña',
      nzContent: `¿Restablecer la contraseña de <b>${fullName(user)}</b>? Se generará una nueva contraseña temporal, deberá cambiarla al iniciar sesión y se cerrarán todas sus sesiones activas.`,
      nzOkText: 'Restablecer',
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          this.service.resetPassword(user.id).subscribe({
            next: (tempPassword) => {
              this.message.success(`Contraseña de ${fullName(user)} restablecida. Temporal: ${tempPassword}`, { nzDuration: 8000 });
              resolve();
            },
            error: (err: unknown) => {
              this.showMutationError(err);
              reject();
            },
          });
        }),
    });
  }

  // Nadie puede darse de baja a sí mismo (409 CANNOT_DELETE_SELF) — se deshabilita
  // el botón de la propia cuenta.
  protected isSelf(user: AppUser): boolean {
    return this.access.currentAppUser()?.id === user.id;
  }

  // `DELETE /users/{id}` real: baja LÓGICA — la cuenta deja de poder entrar y sale
  // de la lista, pero su historial se conserva y su correo queda libre.
  protected onDeleteClick(user: AppUser): void {
    this.modal.confirm({
      nzTitle: 'Eliminar usuario',
      nzContent: `¿Eliminar a <b>${fullName(user)}</b>? Dejará de poder iniciar sesión y se cerrarán sus sesiones. Su historial se conserva y su correo quedará libre.`,
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          this.service.deleteUser(user.id).subscribe({
            next: () => {
              this.message.success(`${fullName(user)} fue eliminado.`);
              resolve();
            },
            error: (err: unknown) => {
              this.showMutationError(err);
              reject();
            },
          });
        }),
    });
  }

}
