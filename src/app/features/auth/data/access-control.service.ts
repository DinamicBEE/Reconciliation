import { Injectable, computed, inject } from '@angular/core';
import { AppUser, PermissionKey, defaultPermissionsForRoles } from '../../user-management/data/user-management.model';
import { UserManagementService } from '../../user-management/data/user-management.service';
import { AuthService } from './auth.service';

/**
 * Resuelve QUÉ puede ver/hacer el usuario logeado — separado de `AuthService`
 * a propósito: `AuthService` es (y debe seguir siendo) "tonto", solo sabe
 * quién inició sesión (`AuthUser`, con los roles del backend pero sin
 * permisos propios, ver ese archivo). `UserManagementService` ya depende de
 * `AuthService` (para `actorName` en auditoría) — si `AuthService`
 * importara este servicio de vuelta para resolver permisos, sería una
 * dependencia circular. Este servicio vive "por encima" de ambos: lee la
 * sesión de uno y el registro completo del otro, y de ahí deriva
 * `permissions`.
 *
 * `permissions` tiene DOS fuentes, no una:
 * 1. `AppUser.permissions` (el set EFECTIVO del registro mock vinculado,
 *    cuando existe) — un admin puede haber ajustado a mano los permisos de
 *    ESE usuario por debajo/encima del default de su rol (ver "Seguridad y
 *    acceso" en user-detail); la sesión debe respetar esa personalización,
 *    no recalcularla desde el rol.
 * 2. `defaultPermissionsForRoles(auth.currentUser()?.roles)` — para una
 *    cuenta autenticada por el backend real SIN match en el mock (no existe
 *    todavía un backend de administración de usuarios que comparta el mismo
 *    registro): sin esta segunda fuente, quedaría con `permissions: []` y
 *    `homeRoute()` la mandaría siempre a `/login` sin importar su rol real.
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  private readonly auth = inject(AuthService);
  private readonly userMgmt = inject(UserManagementService);

  readonly currentAppUser = computed<AppUser | null>(() => {
    const id = this.auth.currentUser()?.appUserId;
    return id ? this.userMgmt.findUser(id) : null;
  });

  readonly permissions = computed<ReadonlySet<PermissionKey>>(() => {
    const appUser = this.currentAppUser();
    if (appUser) {
      return new Set(appUser.permissions);
    }
    return new Set(defaultPermissionsForRoles(this.auth.currentUser()?.roles ?? []));
  });

  // Leído por `authGuard` (fuerza a `/cambiar-password` antes que cualquier
  // otra ruta protegida) y por `mustChangePasswordGuard` (esa misma ruta,
  // en sentido contrario) — ver MASTER.md, "Patrón: refresh token de un
  // solo uso + cambio obligatorio de contraseña".
  //
  // Dos fuentes, no una: `currentAppUser()?.mustChangePassword` (el registro
  // mock de `user-management`, para las cuentas de demo con `appUserId`
  // vinculado) OR `auth.currentUser()?.mustChangePasswordHint` (lo que
  // devolvió el login REAL contra el auth-service, ver `AuthService`) — una
  // cuenta autenticada por el backend real pero SIN match en el mock (no
  // existe todavía un backend de administración de usuarios que comparta el
  // mismo registro) solo tiene la segunda fuente, y aun así debe respetar
  // el flag.
  readonly mustChangePassword = computed(
    () => (this.currentAppUser()?.mustChangePassword ?? false) || (this.auth.currentUser()?.mustChangePasswordHint ?? false),
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
    // Pasa con `COSTOS` (sin módulo propio, ver `ROLES`) y con cualquier
    // cuenta real sin match en el mock y sin rol reconocido — de vuelta a
    // login en vez de un bucle de redirects entre rutas que tampoco puede
    // ver.
    return '/login';
  }
}
