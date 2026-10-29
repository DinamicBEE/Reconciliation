import { Injectable, computed, inject } from '@angular/core';
import { PermissionKey, RoleId } from '../../shared/models/access.model';
import { AuthService } from './auth.service';

/**
 * Permisos y pantallas accesibles del usuario en sesión, derivados de {@link AuthService}.
 *
 * @remarks La única fuente es `AuthUser.permissions` del backend; no se recalcula por rol.
 * @see docs/codigo/sesion-y-acceso.md#permisos-efectivos
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  private readonly auth = inject(AuthService);
  /** Permisos efectivos del usuario en sesión; vacío si no tiene sesión o permisos. */
  readonly permissions = computed<ReadonlySet<PermissionKey>>(() => {
    const user = this.auth.currentUser();
    return new Set<PermissionKey>(user?.permissions ?? []);
  });

  /** Muestra "Reprocesar": `POST /sales/capture` exige `capture_sales`. */
  readonly canReprocessSales = computed(() => this.permissions().has('capture_sales'));

  /**
   * Cambio de contraseña pendiente, según `AuthUser.mustChangePasswordHint`.
   *
   * @remarks Lo leen `authGuard` y `mustChangePasswordGuard`.
   * @see docs/codigo/sesion-y-acceso.md#guards
   */
  readonly mustChangePassword = computed(() => this.auth.currentUser()?.mustChangePasswordHint ?? false);

  hasPermission(key: PermissionKey): boolean {
    return this.permissions().has(key);
  }

  /**
   * Indica si el usuario tiene el código de rol del backend.
   *
   * @remarks Solo para pantallas exclusivas de un rol que ningún permiso expresa (p. ej. "Roles y permisos", solo `ADMIN`).
   */
  hasRole(role: RoleId): boolean {
    return (this.auth.currentUser()?.roles ?? []).includes(role);
  }

  /**
   * Primera pantalla accesible, en el orden del menú lateral.
   *
   * @returns `'/catalogos'` si no tiene otra: la ve cualquier usuario autenticado (evita bucles de redirección).
   */
  homeRoute(): string {
    if (this.hasPermission('view_dashboard')) return '/dashboard';
    if (this.hasPermission('view_reconciliation')) return '/conciliacion';
    if (this.hasPermission('manage_users')) return '/usuarios';
    return '/catalogos';
  }
}
