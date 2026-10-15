import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AuthService } from '../../../../core/auth/auth.service';
import { AccessCatalogService } from '../../../../core/auth/access-catalog.service';
import { RolesApiService } from '../../data/roles-api.service';
import { PermissionDef, PermissionKey } from '../../../../shared/models/access.model';
import { fullName } from '../../data/user-management.model';
import { UserManagementService } from '../../data/user-management.service';
import { toRoleCode } from '../../data/role-code.util';

// Mismo límite que el backend (`CreateRoleRequest.name`, @Size(max = 80)).
const ROLE_NAME_MAX_LENGTH = 80;

// Un permiso agrupado por módulo, con cuántos de ese módulo van marcados —
// alimenta el header del panel (contador) y el resumen del modal de confirmación.
interface PermissionModule {
  module: string;
  items: PermissionDef[];
  selectedCount: number;
}

/**
 * Alta y edición de un rol — nombre + permisos agrupados por módulo (`GET
 * /permissions`, vía `AccessCatalogService`; nunca una lista propia del front).
 * Exclusiva de ADMIN (`permissionGuard` con `data.role`).
 *
 * - `/gestion-de-roles/nuevo` → `POST /roles`. El backend deriva el `code` del
 *   nombre (`toRoleCode`); el nombre se valida contra los roles existentes por
 *   nombre Y por código derivado (el backend responde 409 `ROLE_ALREADY_EXISTS`).
 * - `/gestion-de-roles/:code` → precarga con `GET /roles/{code}`, guarda con
 *   `PATCH /roles/{code}` (solo lo que cambió) y da de baja con
 *   `DELETE /roles/{code}`. Editar los permisos se PROPAGA a las personas que
 *   tienen el rol (lo explica la confirmación); la baja se deshabilita mientras
 *   alguien lo tenga asignado (el backend respondería 409 `ROLE_IN_USE`).
 */
@Component({
  selector: 'app-role-create',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzButtonModule,
    NzCardModule,
    NzCheckboxModule,
    NzCollapseModule,
    NzInputModule,
    NzModalModule,
    NzTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role-create.html',
  styleUrl: './role-create.scss',
})
export class RoleCreate {
  // Ligado a :code de la ruta (withComponentInputBinding) — ausente en
  // /gestion-de-roles/nuevo (modo alta).
  readonly code = input<string>();

  protected readonly catalog = inject(AccessCatalogService);
  private readonly auth = inject(AuthService);
  private readonly rolesApi = inject(RolesApiService);
  private readonly users = inject(UserManagementService);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  private readonly confirmContent = viewChild.required<TemplateRef<unknown>>('confirmContent');

  protected readonly maxLength = ROLE_NAME_MAX_LENGTH;
  protected readonly isEdit = computed(() => !!this.code());

  // Estado del rol que se edita (lo que devolvió `GET /roles/{code}`).
  protected readonly loadingRole = signal(false);
  protected readonly roleNotFound = signal(false);
  private readonly original = signal<{ name: string; permissions: ReadonlySet<PermissionKey> } | null>(null);

  // Nombre: reglas reales (requerido, largo, no repetido) → Reactive Forms,
  // mismo criterio que nombre/correo en `user-detail`.
  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(ROLE_NAME_MAX_LENGTH), (c) => this.duplicateName(c)],
  });
  private readonly nameValue = toSignal(this.nameControl.valueChanges, { initialValue: '' });
  protected readonly roleName = computed(() => this.nameValue().trim());
  // Código que tendrá el rol: el que ya tiene (edición) o el que derivará el back.
  protected readonly roleCode = computed(() => this.code() ?? (this.roleName() ? toRoleCode(this.roleName()) : ''));

  protected readonly selected = signal<ReadonlySet<PermissionKey>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly totalPermissions = computed(() => this.catalog.permissions().length);

  protected readonly modules = computed<PermissionModule[]>(() => {
    const selected = this.selected();
    return this.catalog.permissionGroups().map(({ group, items }) => ({
      module: group,
      items,
      selectedCount: items.filter((p) => selected.has(p.key)).length,
    }));
  });

  // Resumen del modal: solo los módulos con al menos un permiso marcado.
  protected readonly summary = computed(() => this.modules().filter((m) => m.selectedCount > 0));

  // Edición: qué cambia respecto del rol cargado (alimenta la confirmación).
  protected readonly nameChanged = computed(() => {
    const original = this.original();
    return !!original && this.roleName() !== original.name;
  });
  protected readonly addedPermissions = computed(() => {
    const original = this.original()?.permissions ?? new Set<PermissionKey>();
    return [...this.selected()].filter((p) => !original.has(p)).map((p) => this.catalog.permissionLabel(p));
  });
  protected readonly removedPermissions = computed(() => {
    const original = this.original()?.permissions ?? new Set<PermissionKey>();
    return [...original].filter((p) => !this.selected().has(p)).map((p) => this.catalog.permissionLabel(p));
  });
  protected readonly permissionsChanged = computed(
    () => this.addedPermissions().length > 0 || this.removedPermissions().length > 0,
  );

  // Personas con el rol (misma colección que "Administración de usuarios").
  protected readonly assignedUsers = computed(() => {
    const code = this.code();
    if (!code) return [];
    return this.users
      .allUsers()
      .filter((u) => (u.roleIds as readonly string[]).includes(code))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
  });

  protected readonly saving = signal(false);

  protected readonly canSave = computed(() => {
    this.nameValue(); // re-evaluar al escribir (la validez del control no es un signal)
    if (!this.nameControl.valid || this.selectedCount() === 0 || this.saving()) return false;
    return this.isEdit() ? !!this.original() && (this.nameChanged() || this.permissionsChanged()) : true;
  });

  protected readonly canDelete = computed(() => this.isEdit() && !!this.original() && this.assignedUsers().length === 0);

  constructor() {
    // Los usuarios del rol (baja deshabilitada si tiene, impacto de la edición).
    this.users.syncFromBackend();

    effect(() => {
      const code = this.code();
      untracked(() => this.loadRole(code));
    });
  }

  private loadRole(code: string | undefined): void {
    this.original.set(null);
    this.roleNotFound.set(false);
    if (!code) {
      this.nameControl.reset('');
      this.selected.set(new Set());
      return;
    }
    this.loadingRole.set(true);
    this.rolesApi.getRole(code).subscribe({
      next: (role) => {
        const permissions = new Set(role.defaultPermissions as PermissionKey[]);
        this.original.set({ name: role.name, permissions });
        this.nameControl.reset(role.name);
        this.selected.set(new Set(permissions));
        this.loadingRole.set(false);
      },
      // 404 ROLE_NOT_FOUND: el aviso lo da `httpErrorAlertInterceptor`.
      error: () => {
        this.loadingRole.set(false);
        this.roleNotFound.set(true);
      },
    });
  }

  protected isSelected(key: PermissionKey): boolean {
    return this.selected().has(key);
  }

  protected toggle(key: PermissionKey, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Marcar/desmarcar todo un módulo desde el checkbox del encabezado de su tabla.
  protected toggleModule(module: PermissionModule, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      for (const p of module.items) {
        if (checked) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  protected onSave(): void {
    this.nameControl.markAsTouched();
    if (!this.canSave()) return;
    const edit = this.isEdit();
    this.modal.confirm({
      nzTitle: edit ? '¿Guardar los cambios del rol?' : '¿Crear este rol?',
      nzContent: this.confirmContent(),
      nzOkText: edit ? 'Guardar cambios' : 'Crear rol',
      nzCancelText: 'Cancelar',
      // Promise: el botón queda en carga hasta que responde el backend; si falla,
      // el modal se cierra igual y el aviso lo da el interceptor.
      nzOnOk: () => (edit ? this.update() : this.create()),
    });
  }

  private async create(): Promise<void> {
    this.saving.set(true);
    try {
      const role = await firstValueFrom(
        this.rolesApi.createRole({ name: this.roleName(), permissions: [...this.selected()] }),
      );
      this.message.success(`Rol "${role.name}" creado (${role.code}).`);
      this.catalog.load();
      void this.router.navigate(['/gestion-de-roles']);
    } catch {
      // El aviso (409 ROLE_ALREADY_EXISTS, 400...) lo da `httpErrorAlertInterceptor`.
    } finally {
      this.saving.set(false);
    }
  }

  private async update(): Promise<void> {
    const code = this.code();
    if (!code) return;
    this.saving.set(true);
    try {
      const role = await firstValueFrom(
        this.rolesApi.updateRole(code, {
          ...(this.nameChanged() ? { name: this.roleName() } : {}),
          ...(this.permissionsChanged() ? { permissions: [...this.selected()] } : {}),
        }),
      );
      this.message.success(`Rol "${role.name}" actualizado.`);
      this.afterRoleChange(code, this.permissionsChanged());
      void this.router.navigate(['/gestion-de-roles']);
    } catch {
      // El aviso lo da `httpErrorAlertInterceptor`.
    } finally {
      this.saving.set(false);
    }
  }

  protected onDelete(): void {
    const code = this.code();
    const original = this.original();
    if (!code || !original || !this.canDelete()) return;
    this.modal.confirm({
      nzTitle: '¿Eliminar este rol?',
      nzContent: `Se dará de baja el rol <b>${escapeHtml(original.name)}</b> (${code}). Ya no se podrá asignar y su nombre quedará reservado: no podrás crear otro rol con el mismo nombre.`,
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: async () => {
        try {
          await firstValueFrom(this.rolesApi.deleteRole(code));
          this.message.success(`Rol "${original.name}" eliminado.`);
          this.catalog.load();
          void this.router.navigate(['/gestion-de-roles']);
        } catch {
          // 409 ROLE_IN_USE / 404: el aviso lo da `httpErrorAlertInterceptor`.
        }
      },
    });
  }

  // Tras editar los permisos de un rol, el backend los cambió también a las
  // personas que lo tienen: se recarga el catálogo, la lista de usuarios y —si la
  // sesión propia tiene el rol— la sesión, para que los permisos se vean ya.
  private afterRoleChange(code: string, permissionsChanged: boolean): void {
    this.catalog.load();
    if (!permissionsChanged) return;
    this.users.syncFromBackend();
    if (((this.auth.currentUser()?.roles ?? []) as readonly string[]).includes(code)) {
      this.auth.renewSession().subscribe();
    }
  }

  protected onBack(): void {
    void this.router.navigate(['/gestion-de-roles']);
  }

  // Mismo nombre (sin distinguir mayúsculas/acentos) o mismo código derivado que
  // otro rol del catálogo — en edición, sin contar el propio.
  private duplicateName(control: AbstractControl<string>): ValidationErrors | null {
    const name = normalize(control.value ?? '');
    if (!name) return null;
    const code = toRoleCode(control.value ?? '');
    const own = this.code?.();
    const exists = this.catalog
      .roles()
      .filter((r) => r.id !== own)
      .some((r) => normalize(r.label) === name || r.id === code);
    return exists ? { duplicate: true } : null;
  }
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
