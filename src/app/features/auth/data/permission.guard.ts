import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionKey } from '../../user-management/data/user-management.model';
import { AccessControlService } from './access-control.service';

// Restringe una ruta hija de Shell a quien tenga el permiso declarado en
// `route.data['permission']` — complementa a `authGuard` (que solo exige
// estar logeado, sin importar el rol). Rutas sin `data.permission` (p. ej.
// `perfil`) quedan abiertas a cualquier usuario autenticado.
//
// Sin el permiso: no bloquea en seco (dejaría al usuario viendo una
// pantalla en blanco) — redirige a la PRIMERA pantalla que sí puede ver
// (`AccessControlService.homeRoute()`), mismo criterio que `authGuard`
// redirige a `/login` en vez de solo devolver `false`.
export const permissionGuard: CanActivateFn = (route) => {
  const access = inject(AccessControlService);
  const router = inject(Router);

  const required = route.data['permission'] as PermissionKey | undefined;
  if (!required || access.hasPermission(required)) {
    return true;
  }
  return router.parseUrl(access.homeRoute());
};
