import { Injectable, computed, inject } from '@angular/core';
import { PermissionKey, RoleId } from '../../shared/models/access.model';
import { AuthService } from './auth.service';

/**
 * Resuelve QUÉ puede ver/hacer el usuario logeado — separado de `AuthService`
 * a propósito: `AuthService` es (y debe seguir siendo) "tonto", solo sabe
 * quién inició sesión (`AuthUser`). Todo se resuelve con datos del backend
 * (`AuthUser`): este servicio ya NO depende de `UserManagementService` ni del
 * registro mock de `user-management`, lo que rompe el ciclo
 * auth ↔ user-management (ADR-0001, punto 5). El `AppUser` de la sesión, para
 * quien lo necesite, lo expone `UserManagementService.currentAppUser`.
 *
 * `permissions` viene de `AuthUser.permissions` (`UserSummaryDto.permissions`
 * tal cual lo devolvió el backend real en el login/`GET /auth/me`) — FUENTE
 * ÚNICA, ya no de `AppUser.permissions` (el registro mock vinculado). Antes
 * de esta actualización se ignoraba el arreglo real del backend y siempre
 * se recalculaba desde `roles` (o, peor, desde la personalización LOCAL de
 * "Seguridad y acceso", que no persistía) — una de las desviaciones de la matriz
 * 7.16 del DED. Ya no hay recálculo ni fallback por rol: lo que el backend
 * devuelve en `permissions` ES lo que la persona puede hacer (vacío = nada), y
 * `PATCH /users/{id}/roles` es el único que lo cambia.
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  private readonly auth = inject(AuthService);
  readonly permissions = computed<ReadonlySet<PermissionKey>>(() => {
    const user = this.auth.currentUser();
    return new Set<PermissionKey>(user?.permissions ?? []);
  });

  // "Reprocesar" (Resumen de venta) = `POST /sales/capture`, que el backend
  // protege con el permiso `capture_sales` (Guia_Integracion_Frontend §6.3). Antes
  // era una regla por rol (ADMIN/CONTABILIDAD): con el endpoint conectado, mostrar
  // el botón a quien no tiene el permiso solo produciría un 403, y en un DEV sin
  // roles predefinidos nadie lo vería. Se decide por permiso, como el resto.
  readonly canReprocessSales = computed(() => this.permissions().has('capture_sales'));

  // Leído por `authGuard` (fuerza a `/cambiar-password` antes que cualquier
  // otra ruta protegida) y por `mustChangePasswordGuard` (esa misma ruta,
  // en sentido contrario) — ver MASTER.md, "Patrón: refresh token de un
  // solo uso + cambio obligatorio de contraseña".
  //
  // Fuente única: `auth.currentUser()?.mustChangePasswordHint` (lo que
  // devolvió el backend en el login, `GET /auth/me` o un 403
  // `PASSWORD_CHANGE_REQUIRED`).
  readonly mustChangePassword = computed(() => this.auth.currentUser()?.mustChangePasswordHint ?? false);

  hasPermission(key: PermissionKey): boolean {
    return this.permissions().has(key);
  }

  // Por rol REAL del backend (`auth.currentUser()?.roles`) — para pantallas
  // exclusivas de un rol que ningún
  // permiso del catálogo expresa por sí solo (p. ej. "Roles y permisos", solo
  // ADMIN: `manage_roles` también lo tiene ALTAS).
  hasRole(role: RoleId): boolean {
    return (this.auth.currentUser()?.roles ?? []).includes(role);
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
