import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgStyle } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { ThemeService } from '../../services/theme.service';
import { PaletteService } from '../../services/palette.service';
import { AuthService } from '../../../features/auth/data/auth.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';

/**
 * Header del layout principal (`Shell`). Extraído de `shell.html`/`.ts` para
 * aislar navegación + acciones + card de usuario en su propio componente —
 * `Shell` solo orquesta `<app-header>` + `<router-outlet>`.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, NzPopoverModule, NzAvatarModule, NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(PaletteService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // "Ana Martínez López" -> "Ana Martínez": primer nombre + primer apellido,
  // para el card compacto del header (el resto del nombre no cabe ahí y no
  // aporta para identificar de un vistazo quién tiene la sesión abierta).
  protected readonly shortName = computed(() => {
    const fullName = this.auth.currentUser()?.fullName ?? '';
    const [firstName = '', firstLastName = ''] = fullName.trim().split(/\s+/);
    return [firstName, firstLastName].filter(Boolean).join(' ');
  });

  protected readonly avatarStyle = computed(() => avatarTokensFor(this.auth.currentUser()?.username ?? ''));
  protected readonly initials = computed(() => initialsFor(this.auth.currentUser()?.fullName ?? ''));

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
