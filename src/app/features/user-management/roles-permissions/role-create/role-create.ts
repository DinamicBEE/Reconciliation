import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
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
 * Alta (`/gestion-de-roles/nuevo`, `POST /roles`) y edición (`/gestion-de-roles/:code`) de un rol.
 *
 * @remarks El código mostrado al crear es orientativo: el definitivo llega en la respuesta.
 * @see docs/codigo/roles-y-permisos.md#alta-y-edicion-de-rol
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
  /** `:code` de la ruta (`withComponentInputBinding`); ausente en el alta. */
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

  // `GET /roles/{code}` como `rxResource` (ADR-0002, punto 3); en reposo en el alta.
  // El 404 `ROLE_NOT_FOUND` lo avisa `httpErrorAlertInterceptor`.
  private readonly roleResource = rxResource({
    params: () => this.code(),
    stream: ({ params }) => this.rolesApi.getRole(params),
  });
  protected readonly loadingRole = this.roleResource.isLoading;
  protected readonly roleNotFound = computed(() => !!this.roleResource.error());
  private readonly original = computed<{ name: string; permissions: ReadonlySet<PermissionKey> } | null>(() => {
    const role = this.roleResource.hasValue() ? this.roleResource.value() : undefined;
    return role ? { name: role.name, permissions: new Set(role.defaultPermissions as PermissionKey[]) } : null;
  });

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

  // Selección editable que se reinicia a los permisos del rol cada vez que llega
  // uno (o a vacío en el alta) — `linkedSignal`, no un `effect` que copie.
  protected readonly selected = linkedSignal<ReadonlySet<PermissionKey>>(() => new Set(this.original()?.permissions ?? []));
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

    // Único efecto: sincronizar el `FormControl` del nombre con el rol cargado
    // (ADR-0002, punto 6).
    effect(() => {
      const name = this.original()?.name ?? '';
      untracked(() => this.nameControl.reset(name));
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
      nzContent: `Se dará de baja el rol <b>${escapeHtml(original.name)}</b> (${code}). Ya no se podrá asignar a nadie. Su nombre queda libre: podrás crear otro rol con el mismo nombre.`,
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

  // El backend propaga los permisos del rol a quienes lo tienen: se recargan catálogo,
  // usuarios y, si la sesión propia tiene el rol, la sesión.
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

  // Mismo nombre que otro rol activo (sin distinguir mayúsculas) — en edición,
  // sin contar el propio.
  private duplicateName(control: AbstractControl<string>): ValidationErrors | null {
    const name = normalizeName(control.value ?? '');
    if (!name) return null;
    const own = this.code?.();
    // El catálogo (`GET /roles`) solo trae roles activos: los dados de baja no
    // reservan su nombre.
    const exists = this.catalog
      .roles()
      .filter((r) => r.id !== own)
      .some((r) => normalizeName(r.label) === name);
    return exists ? { duplicate: true } : null;
  }
}

// Misma comparación que el backend (`existsByNameIgnoreCaseAndEnabledTrue`): sin
// espacios sobrantes ni distinción de mayúsculas; los acentos cuentan.
function normalizeName(text: string): string {
  return text.trim().toLowerCase();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
