import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessControlService } from './access-control.service';
import { AuthService } from './auth.service';

// Protege todo lo que cuelga de Shell (dashboard y lo que venga después).
// Sin sesión → redirige a /login. Con sesión pero con cambio obligatorio de
// contraseña pendiente → redirige a /cambiar-password (fuera de Shell, ver
// app.routes.ts) ANTES de dejar pasar a ninguna pantalla real — ese flujo
// tiene su propio guard en sentido contrario (`mustChangePasswordGuard`),
// así que no hay riesgo de loop entre los dos.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const access = inject(AccessControlService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.parseUrl('/login');
  }
  if (access.mustChangePassword()) {
    return router.parseUrl('/cambiar-password');
  }
  return true;
};
