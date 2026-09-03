import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { MenuService } from '../../services/menu.service';
import { ThemeService } from '../../services/theme.service';
import { PaletteService } from '../../services/palette.service';
import { AuthService } from '../../../features/auth/data/auth.service';

/**
 * Menú lateral del layout principal — navegación entre los módulos de nivel
 * superior (antes vivía como texto plano en `app-header__nav`, ver
 * MASTER.md "Patrón: navegación entre módulos"). Contraído muestra solo
 * iconos; expandido agrega la etiqueta de cada pantalla.
 *
 * También aloja, al fondo, las acciones de sesión/preferencias (paleta,
 * tema, logout) — antes vivían como botones sueltos en `Header`; se
 * movieron aquí para aprovechar el alto completo del sidebar en vez de
 * apretar el Header, que ya tiene búsqueda + notificaciones + card de
 * usuario del lado derecho.
 */
@Component({
  selector: 'app-menu',
  imports: [RouterLink, RouterLinkActive, NzPopoverModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
})
export class Menu {
  protected readonly menu = inject(MenuService);
  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(PaletteService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Click de nuevo sobre el color ya activo = quitarlo (vuelve a la paleta
  // por defecto) en vez de quedar sin forma de deseleccionar desde la UI.
  protected onSwatchClick(hex: string): void {
    if (this.palette.selected() === hex) {
      this.palette.reset();
    } else {
      this.palette.select(hex);
    }
  }

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
