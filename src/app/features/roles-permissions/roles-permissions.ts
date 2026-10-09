import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTableModule } from 'ng-zorro-antd/table';
import { avatarTokensFor, initialsFor } from '../../shared/utils/avatar-color.util';
import { AccessCatalogService } from '../user-management/data/access-catalog.service';
import { AppUser, RoleId, fullName } from '../user-management/data/user-management.model';
import { UserManagementService } from '../user-management/data/user-management.service';

// Una fila de la tabla: el rol, sus permisos (descripción de `GET /permissions`)
// y las personas que lo tienen asignado.
interface RoleRow {
  id: RoleId;
  label: string;
  permissions: string[];
  users: AppUser[];
}

/**
 * "Roles y permisos" — un rol por fila (`GET /roles`, vía `AccessCatalogService`)
 * con los permisos que trae por defecto y las personas que lo tienen
 * (`UserManagementService.allUsers`, la misma colección de "Administración de
 * usuarios", sincronizada con `GET /users` al entrar). Exclusiva del rol ADMIN
 * (`permissionGuard` con `data.role`). Desde aquí se da de alta un rol nuevo.
 */
@Component({
  selector: 'app-roles-permissions',
  imports: [NgStyle, RouterLink, NzPageHeaderModule, NzCardModule, NzTableModule, NzButtonModule, NzAvatarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roles-permissions.html',
  styleUrl: './roles-permissions.scss',
})
export class RolesPermissions {
  protected readonly catalog = inject(AccessCatalogService);
  private readonly users = inject(UserManagementService);

  protected readonly fullName = fullName;

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

  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }
}
