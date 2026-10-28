import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessControlService } from './access-control.service';
import { AuthService } from './auth.service';

/**
 * Protege `/cambiar-password`: sin sesión lleva a `/login` y sin cambio pendiente a `homeRoute()`.
 *
 * @remarks Contraparte de {@link authGuard}; juntos no forman bucles.
 * @see docs/codigo/sesion-y-acceso.md#guards
 */
export const mustChangePasswordGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const access = inject(AccessControlService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.parseUrl('/login');
  }
  if (!access.mustChangePassword()) {
    return router.parseUrl(access.homeRoute());
  }
  return true;
};
