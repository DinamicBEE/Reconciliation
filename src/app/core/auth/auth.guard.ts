import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessControlService } from './access-control.service';
import { AuthService } from './auth.service';

/**
 * Protege las rutas de `Shell`: sin sesión lleva a `/login` y con cambio de contraseña pendiente a `/cambiar-password`.
 *
 * @see docs/codigo/sesion-y-acceso.md#guards
 */
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
