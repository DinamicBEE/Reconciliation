import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { ThemeService } from '../../services/theme.service';
import { PaletteService } from '../../services/palette.service';
import { AuthService } from '../../../features/auth/data/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NzLayoutModule, NzPopoverModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(PaletteService);
  protected readonly auth = inject(AuthService);
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
