import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Protege todo lo que cuelga de Shell (dashboard y lo que venga después).
// Sin sesión → redirige a /login en vez de bloquear la navegación en seco.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/login');
};
