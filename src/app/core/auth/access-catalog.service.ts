import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionDef, PermissionKey, RoleDef, RoleId } from '../../shared/models/access.model';
import { AuthService } from './auth.service';

// `GET /roles` — catálogo de roles con los permisos que traen por defecto
// (solo lectura: se cargan por migración). Exige `manage_users` o `manage_roles`.
export interface RoleDto {
  code: string;
  name: string;
  defaultPermissions: string[];
}

// `GET /permissions` — catálogo de permisos; `module` es el título del grupo en
// la pantalla "Seguridad y acceso". Exige `manage_users` o `manage_roles`.
export interface PermissionDto {
  code: string;
  description: string;
  module: string;
}

// Permisos del backend que dan acceso a los catálogos (`GET /roles`, `GET
// /permissions`: "manage_users o manage_roles", ver la guía de endpoints).
const CATALOG_PERMISSIONS: PermissionKey[] = ['manage_users', 'manage_roles'];

interface AccessCatalogs {
  roles: readonly RoleDef[];
  permissions: readonly PermissionDef[];
}

const EMPTY_CATALOGS: AccessCatalogs = { roles: [], permissions: [] };

/**
 * Catálogos REALES de roles y permisos (`GET /roles`, `GET /permissions`).
 *
 * REGLA GENERAL (mismo criterio que `CatalogService` con subsidiarias/ubicaciones):
 * toda lista de roles o de permisos del portal — selects de rol, filtro de la
 * tabla, grid de permisos, etiquetas — sale de aquí; no existe ni debe volver
 * a existir un arreglo `ROLES`/`PERMISSIONS` propio del front. Un rol o permiso
 * nuevo que el backend agregue por migración aparece solo.
 *
 * Los dos endpoints exigen `manage_users` o `manage_roles`. Para quien no los
 * tiene (Contabilidad, Tesorería, Costos) el catálogo NO se pide (daría 403) y
 * queda vacío: no hay pantalla de ese usuario que lo necesite salvo las
 * etiquetas de rol del encabezado/perfil, que caen a una versión legible del
 * código (`roleLabel`) — ver MASTER.md.
 *
 * Vive en `core/auth` (ADR-0001): lo consumen el layout (etiqueta de rol del
 * header) y varias features. Los dos GET de catálogo se piden aquí mismo; el
 * CRUD de roles es de `RolesApiService` (`user-management/data`).
 *
 * Se carga solo: un `rxResource` observa la sesión y pide ambos catálogos al
 * iniciar sesión (si hay permiso); al cerrarla vuelven a vacío.
 */
@Injectable({ providedIn: 'root' })
export class AccessCatalogService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // ¿La sesión actual puede consultar los catálogos?
  readonly canLoad = computed(() => {
    const granted = this.auth.currentUser()?.permissions ?? [];
    return CATALOG_PERMISSIONS.some((p) => granted.includes(p));
  });

  // ADR-0002, punto 3: un `rxResource` en vez de `effect` + `subscribe`. Pide al
  // iniciar sesión con permiso; sin permiso (o sin sesión) `params` es
  // `undefined`, el resource queda en reposo y el catálogo vuelve a vacío.
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

  // Permisos agrupados por `module` (orden de llegada) — el grid de "Seguridad y acceso".
  readonly permissionGroups = computed<{ group: string; items: PermissionDef[] }[]>(() => {
    const byGroup = new Map<string, PermissionDef[]>();
    for (const permission of this.permissions()) {
      if (!byGroup.has(permission.group)) byGroup.set(permission.group, []);
      byGroup.get(permission.group)!.push(permission);
    }
    return [...byGroup.entries()].map(([group, items]) => ({ group, items }));
  });

  // Vuelve a pedir ambos catálogos (p. ej. tras un fallo de red o tras crear,
  // editar o dar de baja un rol).
  load(): void {
    this.catalogs.reload();
  }

  // Nombre del rol según el catálogo; sin catálogo (sesión sin permiso para
  // pedirlo) o con un código que no está en él, una versión legible del código.
  roleLabel(id: RoleId | string): string {
    return this.roles().find((r) => r.id === id)?.label ?? humanizeCode(id);
  }

  permissionLabel(key: PermissionKey | string): string {
    return this.permissions().find((p) => p.key === key)?.label ?? humanizeCode(key);
  }

  // Unión de los `defaultPermissions` de cada rol — punto de partida al cambiar
  // los roles de una persona (la regla "cambio de rol → permisos por defecto"
  // la aplica el front y envía el resultado final; el backend lo guarda tal cual).
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
