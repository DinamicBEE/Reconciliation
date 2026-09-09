import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MenuService } from '../../services/menu.service';
import { AuthService } from '../../../features/auth/data/auth.service';

/**
 * Menú lateral del layout principal — navegación entre los módulos de nivel
 * superior (antes vivía como texto plano en `app-header__nav`, ver
 * MASTER.md "Patrón: navegación entre módulos"). Contraído muestra solo
 * iconos; expandido agrega la etiqueta de cada pantalla.
 *
 * También aloja, al fondo, "Cerrar sesión" — paleta de colores y modo
 * oscuro vivieron aquí brevemente y se movieron al menú del avatar en el
 * Header (`core/layout/header`, junto con "Perfil"), que es donde ahora
 * vive toda acción de sesión/preferencias del usuario logeado.
 */
@Component({
  selector: 'app-menu',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
})
export class Menu {
  protected readonly menu = inject(MenuService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected onLogout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
