import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionKey, RoleId } from '../../user-management/data/user-management.model';
import { AccessControlService } from './access-control.service';

// Restringe una ruta hija de Shell a quien tenga el permiso declarado en
// `route.data['permission']` — complementa a `authGuard` (que solo exige
// estar logeado, sin importar el rol). Rutas sin `data.permission` (p. ej.
// `perfil`) quedan abiertas a cualquier usuario autenticado.
// `route.data['role']` (opcional) exige ADEMÁS ese rol — para pantallas
// exclusivas de un rol (p. ej. "Roles y permisos", solo ADMIN).
//
// Sin el permiso: no bloquea en seco (dejaría al usuario viendo una
// pantalla en blanco) — redirige a la PRIMERA pantalla que sí puede ver
// (`AccessControlService.homeRoute()`), mismo criterio que `authGuard`
// redirige a `/login` en vez de solo devolver `false`.
export const permissionGuard: CanActivateFn = (route) => {
  const access = inject(AccessControlService);
  const router = inject(Router);

  const required = route.data['permission'] as PermissionKey | undefined;
  const role = route.data['role'] as RoleId | undefined;
  if ((!required || access.hasPermission(required)) && (!role || access.hasRole(role))) {
    return true;
  }
  return router.parseUrl(access.homeRoute());
};
