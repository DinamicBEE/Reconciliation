import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, NgStyle } from '@angular/common';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzCardModule } from 'ng-zorro-antd/card';
import { AuthService } from '../auth/data/auth.service';
import { UserManagementService } from '../user-management/data/user-management.service';
import { AppUser, ROLE_LABEL, fullName } from '../user-management/data/user-management.model';
import { avatarTokensFor, initialsFor } from '../../shared/utils/avatar-color.util';

/**
 * Perfil del usuario logeado — por ahora solo muestra, de solo lectura y en
 * un único card (sin `nz-tabs`), la sección "Información general" que
 * `UserDetail` expone para cualquier usuario administrado (ver
 * `features/user-management/user-detail`). Mismo registro, misma fuente de
 * verdad: se resuelve el `AppUser` vinculado a la sesión actual
 * (`AuthUser.appUserId`) vía `UserManagementService.findUser`, nunca datos
 * propios de esta pantalla.
 */
@Component({
  selector: 'app-profile',
  imports: [NzAvatarModule, NzCardModule, NgStyle, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly auth = inject(AuthService);
  private readonly userMgmt = inject(UserManagementService);

  protected readonly fullName = fullName;

  protected readonly user = computed<AppUser | null>(() => {
    const id = this.auth.currentUser()?.appUserId;
    return id ? this.userMgmt.findUser(id) : null;
  });

  protected readonly roleLabel = computed(() =>
    (this.user()?.roleIds ?? []).map((roleId) => ROLE_LABEL[roleId]).join(', '),
  );

  protected readonly address = computed(() => {
    const addr = this.user()?.address;
    if (!addr || (!addr.street1 && !addr.city)) return '';
    const street = [addr.street1, addr.street2].filter(Boolean).join(', ');
    return [street, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ');
  });

  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }
}
