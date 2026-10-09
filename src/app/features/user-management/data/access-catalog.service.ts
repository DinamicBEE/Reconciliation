import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AuthService, PermissionDto, RoleDto } from '../../auth/data/auth.service';
import { PermissionDef, PermissionKey, RoleDef, RoleId } from './user-management.model';

// Permisos del backend que dan acceso a los catálogos (`GET /roles`, `GET
// /permissions`: "manage_users o manage_roles", ver la guía de endpoints).
const CATALOG_PERMISSIONS: PermissionKey[] = ['manage_users', 'manage_roles'];

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
 * Se carga solo: un `effect` observa la sesión y pide ambos catálogos al iniciar
 * sesión (si hay permiso) y los limpia al cerrarla.
 */
@Injectable({ providedIn: 'root' })
export class AccessCatalogService {
  private readonly auth = inject(AuthService);

  readonly roles = signal<readonly RoleDef[]>([]);
  readonly permissions = signal<readonly PermissionDef[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  // ¿La sesión actual puede consultar los catálogos?
  readonly canLoad = computed(() => {
    const granted = this.auth.currentUser()?.permissions ?? [];
    return CATALOG_PERMISSIONS.some((p) => granted.includes(p));
  });

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

  constructor() {
    effect(() => {
      const canLoad = this.canLoad();
      untracked(() => (canLoad ? this.load() : this.clear()));
    });
  }

  // Vuelve a pedir ambos catálogos (p. ej. tras un fallo de red).
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadFailed.set(false);
    forkJoin([this.auth.listRoles(), this.auth.listPermissions()]).subscribe({
      next: ([roles, permissions]) => {
        this.roles.set(roles.map(toRoleDef));
        this.permissions.set(permissions.map(toPermissionDef));
        this.loading.set(false);
      },
      // El aviso al usuario lo da `notifyBackendError`.
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  private clear(): void {
    this.roles.set([]);
    this.permissions.set([]);
    this.loading.set(false);
    this.loadFailed.set(false);
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
