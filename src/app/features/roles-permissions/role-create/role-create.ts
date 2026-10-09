import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { AccessCatalogService } from '../../user-management/data/access-catalog.service';
import { PermissionDef, PermissionKey } from '../../user-management/data/user-management.model';

const ROLE_NAME_MAX_LENGTH = 50;

// Un permiso agrupado por módulo, con cuántos de ese módulo van marcados —
// alimenta el header del panel (contador) y el resumen del modal de confirmación.
interface PermissionModule {
  module: string;
  items: PermissionDef[];
  selectedCount: number;
}

/**
 * "Nuevo rol" — nombre del rol + permisos agrupados por módulo (`GET
 * /permissions`, vía `AccessCatalogService`; nunca una lista propia del front,
 * ver MASTER.md). Exclusiva de ADMIN (`permissionGuard` con `data.role`).
 *
 * El backend aún NO expone `POST /roles` (los roles se cargan por migración,
 * Guía de endpoints §4): la confirmación arma y muestra el resumen completo,
 * pero al aceptar solo avisa que el alta queda pendiente del endpoint — no se
 * simula un guardado que no existe.
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role-create.html',
  styleUrl: './role-create.scss',
})
export class RoleCreate {
  protected readonly catalog = inject(AccessCatalogService);
  private readonly modal = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  private readonly confirmContent = viewChild.required<TemplateRef<unknown>>('confirmContent');

  protected readonly maxLength = ROLE_NAME_MAX_LENGTH;

  // Nombre: reglas reales (requerido, largo, no repetido) → Reactive Forms,
  // mismo criterio que nombre/correo en `user-detail`.
  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(ROLE_NAME_MAX_LENGTH), (c) => this.duplicateName(c)],
  });
  private readonly nameValue = toSignal(this.nameControl.valueChanges, { initialValue: '' });
  protected readonly roleName = computed(() => this.nameValue().trim());

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

  protected readonly canCreate = computed(() => {
    this.nameValue(); // re-evaluar al escribir (la validez del control no es un signal)
    return this.nameControl.valid && this.selectedCount() > 0;
  });

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

  protected onCreate(): void {
    this.nameControl.markAsTouched();
    if (!this.canCreate()) return;
    this.modal.confirm({
      nzTitle: '¿Crear este rol?',
      nzContent: this.confirmContent(),
      nzOkText: 'Crear rol',
      nzCancelText: 'Cancelar',
      nzOnOk: () => {
        this.message.warning(
          `El rol "${this.roleName()}" no se guardó: el backend aún no expone el endpoint para crear roles (POST /roles).`,
          { nzDuration: 6000 },
        );
      },
    });
  }

  protected onBack(): void {
    this.router.navigate(['/gestion-de-roles']);
  }

  // Mismo nombre (sin distinguir mayúsculas/acentos) que un rol del catálogo.
  private duplicateName(control: AbstractControl<string>): ValidationErrors | null {
    const name = normalize(control.value ?? '');
    if (!name) return null;
    const exists = this.catalog.roles().some((r) => normalize(r.label) === name || normalize(r.id) === name);
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
