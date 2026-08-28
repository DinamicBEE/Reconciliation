import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

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
export class App {}
