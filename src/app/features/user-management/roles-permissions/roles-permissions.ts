import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { AccessCatalogService } from '../../../core/auth/access-catalog.service';
import { RolesApiService } from '../data/roles-api.service';
import { RoleId } from '../../../shared/models/access.model';
import { AppUser, fullName } from '../data/user-management.model';
import { UserManagementService } from '../data/user-management.service';

// Una fila de la tabla: el rol, sus permisos (descripción de `GET /permissions`)
// y las personas que lo tienen asignado.
interface RoleRow {
  id: RoleId;
  label: string;
  permissions: string[];
  users: AppUser[];
}

/**
 * "Roles y permisos": un rol por fila con sus permisos por defecto y las personas que lo tienen.
 *
 * @remarks Baja con `DELETE /roles/{code}`, deshabilitada mientras el rol tenga usuarios.
 * @see docs/codigo/roles-y-permisos.md#pantalla-roles-y-permisos
 */
@Component({
  selector: 'app-roles-permissions',
  imports: [NgStyle, RouterLink, NzPageHeaderModule, NzCardModule, NzTableModule, NzButtonModule, NzAvatarModule, NzTooltipModule, NzModalModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roles-permissions.html',
  styleUrl: './roles-permissions.scss',
})
export class RolesPermissions {
  protected readonly catalog = inject(AccessCatalogService);
  private readonly users = inject(UserManagementService);

  private readonly rolesApi = inject(RolesApiService);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  protected readonly fullName = fullName;
  // Código del rol cuya baja está en curso (deshabilita su botón mientras tanto).
  protected readonly deleting = signal<string | null>(null);

  protected readonly rows = computed<RoleRow[]>(() => {
    const users = this.users.allUsers();
    return this.catalog.roles().map((role) => ({
      id: role.id,
      label: role.label,
      permissions: role.defaultPermissions.map((key) => this.catalog.permissionLabel(key)),
      users: users
        .filter((u) => u.roleIds.includes(role.id))
        .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es')),
    }));
  });

  constructor() {
    // Mismo criterio que `UserList`: refresca roles/altas hechas fuera de esta sesión.
    this.users.syncFromBackend();
  }

  protected onEdit(role: RoleRow): void {
    void this.router.navigate(['/gestion-de-roles', role.id]);
  }

  protected onDelete(role: RoleRow): void {
    if (role.users.length > 0) return;
    this.modal.confirm({
      nzTitle: '¿Eliminar este rol?',
      nzContent: `Se dará de baja el rol <b>${escapeHtml(role.label)}</b> (${role.id}). Ya no se podrá asignar a nadie. Su nombre queda libre: podrás crear otro rol con el mismo nombre.`,
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: async () => {
        this.deleting.set(role.id);
        try {
          await firstValueFrom(this.rolesApi.deleteRole(role.id));
          this.message.success(`Rol "${role.label}" eliminado.`);
          this.catalog.load();
        } catch {
          // 409 ROLE_IN_USE / 404: el aviso lo da `httpErrorAlertInterceptor`.
        } finally {
          this.deleting.set(null);
        }
      },
    });
  }

  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
