import { Injectable, computed, inject } from '@angular/core';
import { AppUser, PermissionKey, defaultPermissionsForRoles } from '../../user-management/data/user-management.model';
import { UserManagementService } from '../../user-management/data/user-management.service';
import { AuthService } from './auth.service';

/**
 * Resuelve QUÉ puede ver/hacer el usuario logeado — separado de `AuthService`
 * a propósito: `AuthService` es (y debe seguir siendo) "tonto", solo sabe
 * quién inició sesión (`AuthUser`). `UserManagementService` ya depende de
 * `AuthService` (para `actorName` en auditoría) — si `AuthService`
 * importara este servicio de vuelta para resolver permisos, sería una
 * dependencia circular. Este servicio vive "por encima" de ambos: lee la
 * sesión de uno y el registro completo del otro.
 *
 * `permissions` viene de `AuthUser.permissions` (`UserSummaryDto.permissions`
 * tal cual lo devolvió el backend real en el login/`GET /auth/me`) — FUENTE
 * ÚNICA, ya no de `AppUser.permissions` (el registro mock vinculado). Antes
 * de esta actualización se ignoraba el arreglo real del backend y siempre
 * se recalculaba desde `roles` vía `defaultPermissionsForRoles` (o, peor,
 * desde la personalización LOCAL de "Seguridad y acceso" en user-detail, que
 * nunca persiste en el backend — ver `UserManagementService.changeRoles`);
 * eso era una de las desviaciones documentadas en la matriz 7.16 del DED
 * ("el arreglo permissions que devuelve el backend en el login se ignora").
 * `defaultPermissionsForRoles` se queda solo como fallback de seguridad si
 * por lo que sea el backend devolviera un arreglo vacío (no debería pasar
 * tras sembrar el catálogo de 9 permisos).
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
    const user = this.auth.currentUser();
    if (!user) return new Set<PermissionKey>();
    if (user.permissions.length > 0) return new Set(user.permissions);
    return new Set(defaultPermissionsForRoles(user.roles));
  });

  // "Reproceso de ventas" (matriz 7.16 del DED): sin permiso propio — el DED
  // lo limita a Admin/Contabilidad directamente por rol, un subconjunto MÁS
  // ANGOSTO que `view_dashboard` (que desde esta actualización también
  // incluye Tesorería y Costos, ver ROLES en user-management.model.ts) — por
  // eso no puede expresarse con `hasPermission('view_dashboard')` sola. Vive
  // aquí (no en sales-dashboard) por el mismo motivo que `hasPermission`: un
  // solo lugar que sabe "quién puede qué". Por rol REAL del backend
  // (`auth.currentUser()?.roles`), no por el registro mock editable —
  // consistente con `permissions` arriba.
  readonly canReprocessSales = computed(() => {
    const roles = this.auth.currentUser()?.roles ?? [];
    return roles.includes('ADMIN') || roles.includes('CONTABILIDAD');
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
    if (this.hasPermission('view_catalogs')) return '/catalogos';
    if (this.hasPermission('manage_users')) return '/usuarios';
    // Sesión sin ningún permiso reconocido (p. ej. sin `AppUser` vinculado y
    // con un rol que este frontend no conoce) — de vuelta a login en vez de
    // un bucle de redirects entre rutas que tampoco puede ver.
    return '/login';
  }
}
