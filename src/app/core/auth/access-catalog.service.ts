import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionDef, PermissionKey, RoleDef, RoleId } from '../../shared/models/access.model';
import { AuthService } from './auth.service';

/** Rol de `GET /roles` con sus permisos por defecto (catálogo cargado por migración). */
export interface RoleDto {
  code: string;
  name: string;
  defaultPermissions: string[];
}

/** Permiso de `GET /permissions`. */
export interface PermissionDto {
  code: string;
  description: string;
  /** Título del grupo en la pantalla "Seguridad y acceso". */
  module: string;
}

// Cualquiera de los dos permite `GET /roles` y `GET /permissions`.
const CATALOG_PERMISSIONS: PermissionKey[] = ['manage_users', 'manage_roles'];

interface AccessCatalogs {
  roles: readonly RoleDef[];
  permissions: readonly PermissionDef[];
}

const EMPTY_CATALOGS: AccessCatalogs = { roles: [], permissions: [] };

/**
 * Catálogos de roles y permisos del backend (`GET /roles`, `GET /permissions`), única fuente de listas de roles y permisos del portal.
 *
 * @remarks Se cargan al iniciar sesión solo con `manage_users` o `manage_roles`; sin ellos quedan vacíos.
 * @see docs/codigo/sesion-y-acceso.md#catalogos-de-acceso
 */
@Injectable({ providedIn: 'root' })
export class AccessCatalogService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** Indica si la sesión tiene permiso para pedir los catálogos. */
  readonly canLoad = computed(() => {
    const granted = this.auth.currentUser()?.permissions ?? [];
    return CATALOG_PERMISSIONS.some((p) => granted.includes(p));
  });

  // `params` `undefined` (sin sesión o sin permiso) deja el resource en reposo (ADR-0002, punto 3).
  private readonly catalogs = rxResource<AccessCatalogs, true | undefined>({
    params: () => (this.canLoad() ? true : undefined),
    stream: () =>
      forkJoin([
        this.http.get<RoleDto[]>(`${this.apiUrl}/roles`),
        this.http.get<PermissionDto[]>(`${this.apiUrl}/permissions`),
      ]).pipe(map(([roles, permissions]) => ({ roles: roles.map(toRoleDef), permissions: permissions.map(toPermissionDef) }))),
    defaultValue: EMPTY_CATALOGS,
  });

  // Un resource en error lanza al leer `value()`: se usa `hasValue()`. El aviso
  // del error lo da `httpErrorAlertInterceptor`.
  private readonly current = computed(() => (this.catalogs.hasValue() ? this.catalogs.value() : EMPTY_CATALOGS));

  readonly roles = computed<readonly RoleDef[]>(() => this.current().roles);
  readonly permissions = computed<readonly PermissionDef[]>(() => this.current().permissions);
  readonly loading = this.catalogs.isLoading;
  readonly loadFailed = computed(() => !!this.catalogs.error());

  readonly roleOptions = computed<{ value: RoleId; label: string }[]>(() =>
    this.roles().map((r) => ({ value: r.id, label: r.label })),
  );

  /** Permisos agrupados por `module`, en orden de llegada (grid de "Seguridad y acceso"). */
  readonly permissionGroups = computed<{ group: string; items: PermissionDef[] }[]>(() => {
    const byGroup = new Map<string, PermissionDef[]>();
    for (const permission of this.permissions()) {
      if (!byGroup.has(permission.group)) byGroup.set(permission.group, []);
      byGroup.get(permission.group)!.push(permission);
    }
    return [...byGroup.entries()].map(([group, items]) => ({ group, items }));
  });

  /** Vuelve a pedir ambos catálogos (tras un fallo o tras cambiar un rol). */
  load(): void {
    this.catalogs.reload();
  }

  /**
   * Nombre del rol según el catálogo.
   *
   * @returns Una versión legible del código si el catálogo está vacío o no lo contiene.
   */
  roleLabel(id: RoleId | string): string {
    return this.roles().find((r) => r.id === id)?.label ?? humanizeCode(id);
  }

  /** Descripción del permiso; una versión legible del código si no está en el catálogo. */
  permissionLabel(key: PermissionKey | string): string {
    return this.permissions().find((p) => p.key === key)?.label ?? humanizeCode(key);
  }

  /**
   * Unión de los `defaultPermissions` de los roles indicados.
   *
   * @remarks El front aplica "cambio de rol → permisos por defecto"; el backend guarda el resultado tal cual.
   */
  defaultPermissionsForRoles(roleIds: readonly RoleId[]): PermissionKey[] {
    const set = new Set<PermissionKey>();
    for (const roleId of roleIds) {
      this.roles()
        .find((r) => r.id === roleId)
        ?.defaultPermissions.forEach((p) => set.add(p));
    }
    return [...set];
  }
}

function toRoleDef(dto: RoleDto): RoleDef {
  return { id: dto.code as RoleId, label: dto.name, defaultPermissions: dto.defaultPermissions as PermissionKey[] };
}

function toPermissionDef(dto: PermissionDto): PermissionDef {
  return { key: dto.code as PermissionKey, label: dto.description, group: dto.module };
}

// 'CONTABILIDAD' → 'Contabilidad'; 'view_audit_log' → 'View audit log'.
function humanizeCode(code: string): string {
  const text = code.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
