import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionKey, RoleId } from '../../shared/models/access.model';
import { AccessControlService } from './access-control.service';

/**
 * Exige `route.data['permission']` y, si se declara, `route.data['role']`; sin ellos la ruta queda abierta.
 *
 * @returns `true` o un `UrlTree` a `AccessControlService.homeRoute()`, nunca `false`.
 * @see docs/codigo/sesion-y-acceso.md#guards
 */
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
