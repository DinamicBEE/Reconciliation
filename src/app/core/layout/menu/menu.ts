import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { MenuService } from '../../services/menu.service';
import { AccessControlService } from '../../auth/access-control.service';
import { AuthService } from '../../auth/auth.service';

/**
 * Menú lateral: navegación entre módulos y "Cerrar sesión" al pie.
 *
 * @remarks Contraído muestra solo iconos; expandido agrega la etiqueta. Estado en {@link MenuService}.
 * @see docs/codigo/layout-y-tema.md#menu-lateral
 */
@Component({
  selector: 'app-menu',
  imports: [RouterLink, RouterLinkActive, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
})
export class Menu {
  protected readonly menu = inject(MenuService);
  protected readonly access = inject(AccessControlService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
