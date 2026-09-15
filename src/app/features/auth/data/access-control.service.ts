import { Injectable, computed, inject } from '@angular/core';
import { AppUser, PermissionKey } from '../../user-management/data/user-management.model';
import { UserManagementService } from '../../user-management/data/user-management.service';
import { AuthService } from './auth.service';

/**
 * Resuelve QUÉ puede ver/hacer el usuario logeado — separado de `AuthService`
 * a propósito: `AuthService` es (y debe seguir siendo) "tonto", solo sabe
 * quién inició sesión (`AuthUser`, sin roles ni permisos, ver ese archivo).
 * `UserManagementService` ya depende de `AuthService` (para `actorName` en
 * auditoría) — si `AuthService` importara este servicio de vuelta para
 * resolver permisos, sería una dependencia circular. Este servicio vive
 * "por encima" de ambos: lee la sesión de uno y el registro completo del
 * otro, y de ahí deriva `permissions`.
 *
 * `permissions` lee `AppUser.permissions` (el set EFECTIVO, no
 * `defaultPermissionsForRoles(roleIds)`) porque un admin puede haber
 * ajustado a mano los permisos de un usuario por debajo/encima del default
 * de su rol (ver "Seguridad y acceso" en user-detail) — la sesión debe
 * respetar esa personalización, no recalcularla desde el rol.
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  private readonly auth = inject(AuthService);
  private readonly userMgmt = inject(UserManagementService);

  readonly currentAppUser = computed<AppUser | null>(() => {
    const id = this.auth.currentUser()?.appUserId;
    return id ? this.userMgmt.findUser(id) : null;
  });

  readonly permissions = computed<ReadonlySet<PermissionKey>>(
    () => new Set(this.currentAppUser()?.permissions ?? []),
  );

  hasPermission(key: PermissionKey): boolean {
    return this.permissions().has(key);
  }

  // Primera pantalla accesible para el usuario logeado — usada tanto para
  // aterrizar justo después de login como para el guard de rutas cuando
  // alguien intenta entrar a una pantalla que no le corresponde (ver
  // `permission.guard.ts`). Orden fijo, no alfabético: es el mismo orden en
  // el que aparecen los módulos en el menú lateral.
  homeRoute(): string {
    if (this.hasPermission('view_dashboard')) return '/dashboard';
    if (this.hasPermission('view_reconciliation')) return '/conciliacion';
    if (this.hasPermission('manage_users')) return '/usuarios';
    // No debería pasar con los 4 roles actuales (todos tienen al menos un
    // permiso) — si pasa (usuario con `permissions: []`), de vuelta a login
    // en vez de un bucle de redirects entre rutas que tampoco puede ver.
    return '/login';
  }
}
