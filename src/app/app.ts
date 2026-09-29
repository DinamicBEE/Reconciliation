import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './features/auth/data/auth.service';

// Root sin chrome propio: `login` y lo protegido por Shell (dashboard, etc.)
// se resuelven como rutas hijas (ver app.routes.ts) — antes app-shell vivía
// aquí siempre montado, lo que habría envuelto también a login en el header
// del dashboard.
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
    // Sesión cerrada por inactividad (el refresh respondió
    // SESSION_IDLE_TIMEOUT, ver AuthService.refreshAccessToken): los guards
    // solo actúan al navegar, así que sin esto la pantalla actual se
    // quedaría abierta sin sesión. Vive aquí y no en Shell para cubrir
    // también /cambiar-password, que está fuera de Shell. `Login` muestra el
    // aviso al llegar.
    effect(() => {
      if (this.auth.sessionEndReason() === 'idle_timeout' && !this.router.url.startsWith('/login')) {
        this.router.navigateByUrl('/login');
      }
    });
  }
}
