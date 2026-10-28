import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

// Root sin chrome propio: `login` y `Shell` son rutas hijas (ver app.routes.ts).
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // Lleva a /login tras un cierre no pedido; los guards solo actúan al navegar.
    // Ver docs/codigo/sesion-y-acceso.md#cierre-de-sesion
    effect(() => {
      const reason = this.auth.sessionEndReason();
      if (reason !== null && !this.router.url.startsWith('/login')) {
        this.router.navigateByUrl('/login');
      }
    });
  }
}
