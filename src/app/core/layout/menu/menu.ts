import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuService } from '../../services/menu.service';

/**
 * Menú lateral del layout principal — navegación entre los módulos de nivel
 * superior (antes vivía como texto plano en `app-header__nav`, ver
 * MASTER.md "Patrón: navegación entre módulos"). Contraído muestra solo
 * iconos; expandido agrega la etiqueta de cada pantalla.
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
}
