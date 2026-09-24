import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessControlService } from './access-control.service';
import { AuthService } from './auth.service';

// Protege /cambiar-password (fuera de Shell, ver app.routes.ts) — la
// contraparte de `authGuard`, que empuja HACIA acá cuando hace falta.
// Sin sesión → /login (no tiene sentido cambiar la contraseña de nadie).
// Con sesión pero SIN el cambio pendiente → de vuelta a `homeRoute()`, no
// hay razón para estar aquí (evita que alguien la visite a mano por
// curiosidad, o se quede pegado tras completar el cambio y navegar "atrás").
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
