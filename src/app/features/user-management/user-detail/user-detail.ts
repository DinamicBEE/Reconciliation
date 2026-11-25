import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, TemplateRef, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import {
  AppUser,
  AuditLogEntry,
  GENDER_OPTIONS,
  PermissionKey,
  PHONE_PATTERN,
  RoleId,
  STATUS_META,
  UserStatus,
  auditActionLabel,
  fullName,
} from '../data/user-management.model';
import { AuditLogService } from '../data/audit-log.service';
import { UserManagementService, backendStatusToLocal, organizationIdsFromDetail } from '../data/user-management.service';
import { AccessCatalogService } from '../../../core/auth/access-catalog.service';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { StatusChip } from '../status-chip/status-chip';
import { parseIsoDate, toIsoDate, toIsoDateOrNull } from '../../../shared/utils/iso-date.util';
import { OrganizationCatalogKind, OrganizationCatalogService } from '../../../core/services/organization-catalog.service';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { COUNTRY_PROFILE } from '../../../core/country/active-country';
import { UserDetailDto, UsersApiService } from '../data/users-api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { PageHeaderService } from '../../../core/layout/header/page-header.service';

/**
 * Detalle y edición de un usuario (`/usuarios/:userId`). El alta es `UserCreateModal`.
 *
 * @see docs/codigo/usuarios-pantallas.md#detalle-carga
 */
@Component({
  selector: 'app-user-detail',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    NzAvatarModule,
    NzButtonModule,
    NzCardModule,
    NzDatePickerModule,
    NzInputModule,
    NzSelectModule,
    NzSwitchModule,
    NzCheckboxModule,
    NzTagModule,
    NzTabsModule,
    NzPaginationModule,
    NzTooltipModule,
    NzModalModule,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-detail.html',
  styleUrl: './user-detail.scss',
})
export class UserDetail {
  private readonly pageHeader = inject(PageHeaderService);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  readonly userId = input<string>();

  protected readonly service = inject(UserManagementService);
  // Catálogos organizacionales (`GET /catalogs/...`) para alta y edición de "Organización".
  protected readonly catalog = inject(OrganizationCatalogService);
  private readonly usersApi = inject(UsersApiService);
  // Vocabulario del país activo: identificación personal, dirección, teléfono.
  protected readonly country = inject(COUNTRY_PROFILE);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  protected readonly fullName = fullName;
  protected readonly statusMeta = STATUS_META;
  // Roles y permisos del backend (`GET /roles`, `GET /permissions`).
  protected readonly accessCatalog = inject(AccessCatalogService);
  protected readonly roleOptions = this.accessCatalog.roleOptions;
  protected readonly permissionGroups = this.accessCatalog.permissionGroups;
  protected readonly catalogLoading = this.accessCatalog.loading;
  private readonly access = inject(AccessControlService);
  // `PATCH /users/{id}/roles` exige `manage_roles` (con solo `manage_users` responde 403).
  // Ver docs/codigo/usuarios-pantallas.md#detalle-seguridad-y-acceso
  protected readonly canEditAccess = computed(() => this.access.hasPermission('manage_roles'));
  protected readonly savingAccess = signal(false);
  protected readonly closingSessions = signal(false);
  protected readonly auditActionLabel = auditActionLabel;
  private readonly auditLogService = inject(AuditLogService);
  protected readonly genderOptions = GENDER_OPTIONS;

  // Nombres de lo asignado: del catálogo o, si falta ahí, del detalle `GET /users/{id}`.
  protected orgNames(kind: OrganizationCatalogKind, ids: readonly number[]): string[] {
    return ids
      .map((id) => this.catalog.find(kind, id)?.nombre ?? this.assignedEntry(kind, id)?.nombre)
      .filter((name): name is string => !!name);
  }

  // Catálogo más lo asignado que el catálogo no trae (dado de baja), para mostrar su nombre.
  protected orgOptions(kind: OrganizationCatalogKind, base: readonly CatalogEntry[] = this.catalog.options(kind)): CatalogEntry[] {
    // Faltante respecto del catálogo completo, no de `base` (puede venir filtrada).
    const all = this.catalog.options(kind);
    const assigned = this.backendDetail()?.[kind] ?? [];
    const missing = assigned.filter((entry) => !all.some((option) => option.id === entry.id));
    return [...base, ...missing];
  }

  private assignedEntry(kind: OrganizationCatalogKind, id: number): CatalogEntry | null {
    return this.backendDetail()?.[kind]?.find((entry) => entry.id === id) ?? null;
  }

  // Se reinicia a lo guardado cada vez que cambia `user()` (linkedSignal, ADR-0002).
  protected readonly editSubsidiariaIds = linkedSignal<number[]>(() => [...(this.user()?.subsidiariaIds ?? [])]);
  protected readonly editUbicacionOptions = computed(() =>
    this.orgOptions('ubicaciones', this.catalog.ubicacionesFor(this.editSubsidiariaIds())),
  );

  // Poda las ubicaciones de una subsidiaria quitada; solo por acción del usuario, no al precargar.
  protected onEditSubsidiariasChange(ids: number[]): void {
    this.editSubsidiariaIds.set(ids);
    const ubicaciones = this.orgForm.controls.ubicacionIds;
    ubicaciones.setValue(this.catalog.pruneUbicaciones(ubicaciones.value, ids));
  }

  // Detalle `GET /users/{id}` keyed en `backendUserId`, no en `user()` (evita el ciclo).
  // Ver docs/codigo/usuarios-pantallas.md#detalle-carga
  private readonly backendUserId = computed(() => {
    const id = this.userId();
    return id ? (this.service.findUser(id)?.backendUserId ?? null) : null;
  });
  private readonly detailResource = rxResource({
    params: () => this.backendUserId() ?? undefined,
    stream: ({ params }) => this.usersApi.getUserDetail(params),
  });
  private readonly backendDetail = computed<UserDetailDto | null>(() =>
    this.detailResource.hasValue() ? (this.detailResource.value() ?? null) : null,
  );

  protected readonly user = computed<AppUser | null>(() => {
    const id = this.userId();
    const base = id ? (this.service.allUsers().find((u) => u.id === id) ?? null) : null;
    if (!base) return null;
    const detail = this.backendDetail();
    // Tras navegar, el detalle puede seguir siendo de la cuenta anterior: no se fusiona.
    if (!detail || detail.id !== base.backendUserId) return base;
    return this.mergeBackendDetail(base, detail);
  });

  // Contraseña temporal de "Organización"; `null` si está vacía.
  protected readonly temporaryPassword = computed(() => this.user()?.temporaryPassword?.trim() || null);

  // Lo que el backend modela gana; avatar, 2FA, última actividad e id local quedan de `base`.
  private mergeBackendDetail(base: AppUser, detail: UserDetailDto): AppUser {
    // `manager.id` es id del backend: se traduce al id local; `null` si no hay puente.
    const managerId = detail.manager ? (this.service.findByBackendUserId(detail.manager.id)?.id ?? null) : null;

    return {
      ...base,
      firstName: detail.firstName,
      lastName: detail.lastName,
      email: detail.email,
      phone: detail.phone ?? '',
      status: backendStatusToLocal(detail.status),
      roleIds: detail.roles as RoleId[],
      permissions: detail.permissions as PermissionKey[],
      emailVerified: detail.emailVerified,
      lastAccessAt: detail.lastLoginAt,
      createdAt: detail.createdAt,
      failedLoginAttempts: detail.failedLoginAttempts ?? 0,
      activeSessions: detail.activeSessions ?? 0,
      lockedUntil: detail.lockedUntil ?? null,
      mustChangePassword: detail.mustChangePassword,
      temporaryPassword: detail.temporaryPassword,
      birthDate: detail.birthDate ?? '',
      ssn: detail.ssn ?? '',
      gender: detail.gender ?? '',
      address: {
        city: detail.address.city ?? '',
        state: detail.address.state ?? '',
        zipCode: detail.address.postalCode ?? '',
        street1: detail.address.street1 ?? '',
        street2: detail.address.street2,
        exteriorNumber: detail.address.exteriorNumber ?? '',
        interiorNumber: detail.address.interiorNumber,
      },
      ...organizationIdsFromDetail(detail),
      managerId,
      employeeId: detail.employeeCode ?? '',
      hireDate: detail.hireDate ?? '',
      contractEndDate: detail.contractEndDate,
      subsidiariaIds: detail.subsidiarias.map((s) => s.id),
      ubicacionIds: detail.ubicaciones.map((u) => u.id),
    };
  }

  // Ningún usuario con ese `:userId` (inexistente o eliminado).
  protected readonly notFound = computed(() => this.user() === null);

  // Pestaña "Historial" (`GET /users/{id}/audit-log`): exige `view_audit_log`.
  // Ver docs/codigo/usuarios-pantallas.md#historial-y-auditoria
  protected readonly canViewAudit = computed(() => this.access.hasPermission('view_audit_log'));
  protected readonly auditPageSize = 10;
  // 1-based (nz-pagination); el backend usa 0-based. Vuelve a 1 al cambiar de cuenta.
  protected readonly auditPage = linkedSignal(() => {
    this.backendUserId();
    return 1;
  });
  // Sin permiso o sin `backendUserId` no se pide; una consulta nueva cancela la anterior.
  private readonly auditResource = rxResource({
    params: () => {
      const backendUserId = this.backendUserId();
      return this.canViewAudit() && backendUserId !== null ? { backendUserId, page: this.auditPage() } : undefined;
    },
    stream: ({ params }) =>
      this.auditLogService.listForUser(params.backendUserId, { page: params.page - 1, size: this.auditPageSize }),
  });
  private readonly auditResult = computed(() => (this.auditResource.hasValue() ? this.auditResource.value() : undefined));
  protected readonly auditEntries = computed<AuditLogEntry[]>(() => this.auditResult()?.entries ?? []);
  protected readonly auditTotal = computed(() => this.auditResult()?.totalElements ?? 0);
  protected readonly auditLoading = this.auditResource.isLoading;
  protected readonly auditFailed = computed(() => !!this.auditResource.error());

  protected onAuditPageChange(page: number): void {
    this.auditPage.set(page);
  }

  // Vuelve a la primera página del historial (o la recarga si ya está en ella).
  private reloadAudit(): void {
    if (this.auditPage() === 1) this.auditResource.reload();
    else this.auditPage.set(1);
  }

  // Candidatos a "Administrador responsable", sin el propio usuario editado.
  protected readonly managerOptions = computed(() => {
    const id = this.userId();
    return this.service
      .managerCandidates()
      .filter((m) => m.id !== id)
      .map((m) => ({ value: m.id, label: fullName(m) }));
  });

  protected readonly manager = computed<AppUser | null>(() => {
    const u = this.user();
    if (!u?.managerId) return null;
    return this.service.allUsers().find((m) => m.id === u.managerId) ?? null;
  });

  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }

  // Datos con validación: Reactive Forms; roles/permisos/estado usan `ngModel`.
  // Ver docs/codigo/usuarios-pantallas.md#detalle-formularios
  protected readonly infoForm = this.fb.group({
    firstName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    lastName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required, Validators.pattern(PHONE_PATTERN)]),
    // Datos de referencia: no se piden al crear y no llevan validadores.
    birthDate: this.fb.control<Date | null>(null),
    ssn: this.fb.control(''),
    gender: this.fb.control(''),
    address: this.fb.group({
      city: this.fb.control(''),
      state: this.fb.control(''),
      zipCode: this.fb.control(''),
      street1: this.fb.control(''),
      street2: this.fb.control<string | null>(null),
      exteriorNumber: this.fb.control(''),
      interiorNumber: this.fb.control<string | null>(null),
    }),
  });

  // "Organización" solo se edita en un usuario existente (salvo subsidiaria y ubicación).
  protected readonly orgForm = this.fb.group({
    cargoIds: this.fb.control<number[]>([]),
    puestoIds: this.fb.control<number[]>([]),
    departamentoIds: this.fb.control<number[]>([]),
    areaIds: this.fb.control<number[]>([]),
    managerId: this.fb.control<string | null>(null),
    employeeId: this.fb.control(''),
    hireDate: this.fb.control<Date | null>(null),
    contractEndDate: this.fb.control<Date | null>(null),
    subsidiariaIds: this.fb.control<number[]>([]),
    ubicacionIds: this.fb.control<number[]>([]),
  });

  // --- Borrador de "Seguridad y acceso": se reinicia a lo guardado al cambiar `user()` ---
  protected readonly draftRoleIds = linkedSignal<RoleId[]>(() => [...(this.user()?.roleIds ?? [])]);
  protected readonly draftPermissions = linkedSignal<Set<PermissionKey>>(() => new Set(this.user()?.permissions ?? []));

  // --- Modo edición de "Información general" (ambas sub-cards; no "Seguridad y acceso") ---
  // Ver docs/codigo/usuarios-pantallas.md#detalle-edicion-y-guardado
  protected readonly isEditing = linkedSignal<boolean>(() => this.resetOnAccountChange(false));
  // `PATCH /users/{id}` en vuelo: deshabilita "Guardar cambios".
  protected readonly savingProfile = signal(false);

  constructor() {
    this.pageHeader.bind(() => {
      const user = this.user();
      return {
        title: user ? this.fullName(user) : 'Usuario',
        actions: this.headerActions() ?? null,
      };
    });
    // Combos de "Organización" — se piden una vez por sesión.
    this.catalog.ensureLoaded();

    // Sincroniza los formularios con `user()`, leído con tracking a propósito.
    // Ver docs/codigo/usuarios-pantallas.md#detalle-formularios
    effect(() => {
      const found = this.user();

      if (found) {
        this.infoForm.reset({
          firstName: found.firstName,
          lastName: found.lastName,
          email: found.email,
          phone: found.phone,
          birthDate: parseIsoDate(found.birthDate),
          ssn: found.ssn,
          gender: found.gender,
          address: { ...found.address },
        });
        this.orgForm.reset({
          cargoIds: [...found.cargoIds],
          puestoIds: [...found.puestoIds],
          departamentoIds: [...found.departamentoIds],
          areaIds: [...found.areaIds],
          managerId: found.managerId,
          employeeId: found.employeeId,
          hireDate: parseIsoDate(found.hireDate),
          contractEndDate: parseIsoDate(found.contractEndDate),
          subsidiariaIds: [...found.subsidiariaIds],
          ubicacionIds: [...found.ubicacionIds],
        });
      } else {
        this.infoForm.reset({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          birthDate: null,
          ssn: '',
          gender: '',
          address: { city: '', state: '', zipCode: '', street1: '', street2: null, exteriorNumber: '', interiorNumber: null },
        });
        this.orgForm.reset({
          cargoIds: [],
          puestoIds: [],
          departamentoIds: [],
          areaIds: [],
          managerId: null,
          employeeId: '',
          hireDate: null,
          contractEndDate: null,
          subsidiariaIds: [],
          ubicacionIds: [],
        });
      }
    });
  }

  // Leer `userId()` hace que el `linkedSignal` vuelva a `initial` al cambiar de cuenta.
  private resetOnAccountChange<T>(initial: T): T {
    this.userId();
    return initial;
  }

  protected onEditClick(): void {
    this.isEditing.set(true);
  }

  // Descarta lo no guardado en ambos formularios y vuelve a solo lectura.
  protected onCancelEditClick(): void {
    const user = this.user();
    if (user) {
      this.infoForm.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        birthDate: parseIsoDate(user.birthDate),
        ssn: user.ssn,
        gender: user.gender,
        address: { ...user.address },
      });
      this.orgForm.reset({
        cargoIds: [...user.cargoIds],
        puestoIds: [...user.puestoIds],
        departamentoIds: [...user.departamentoIds],
        areaIds: [...user.areaIds],
        managerId: user.managerId,
        employeeId: user.employeeId,
        hireDate: parseIsoDate(user.hireDate),
        contractEndDate: parseIsoDate(user.contractEndDate),
        subsidiariaIds: [...user.subsidiariaIds],
        ubicacionIds: [...user.ubicacionIds],
      });
      this.editSubsidiariaIds.set([...user.subsidiariaIds]);
    }
    this.isEditing.set(false);
  }

  protected isPermissionChecked(key: PermissionKey): boolean {
    return this.draftPermissions().has(key);
  }

  protected onPermissionToggle(key: PermissionKey, checked: boolean): void {
    this.draftPermissions.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  // Cambiar roles reinicia el borrador de permisos a la unión de sus defaults.
  protected onRolesSelectChange(roleIds: RoleId[]): void {
    this.draftRoleIds.set(roleIds);
    this.draftPermissions.set(new Set(this.accessCatalog.defaultPermissionsForRoles(roleIds)));
  }

  // Un solo `updateUserProfile` para datos personales y organización; solo `infoForm` valida.
  protected onSaveProfile(): void {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const id = this.userId();
    if (!id) return;

    const info = this.infoForm.getRawValue();
    const org = this.orgForm.getRawValue();

    this.savingProfile.set(true);
    this.service
      .updateUserProfile(id, {
        ...info,
        ...org,
        birthDate: toIsoDate(info.birthDate),
        hireDate: toIsoDate(org.hireDate),
        contractEndDate: toIsoDateOrNull(org.contractEndDate),
      })
      .subscribe({
        next: (updated) => {
          this.savingProfile.set(false);
          this.message.success('Datos actualizados.');
          this.isEditing.set(false);
          if (updated.backendUserId) this.refreshBackendDetail();
        },
        error: (err: unknown) => {
          this.savingProfile.set(false);
          this.showMutationError(err);
        },
      });
  }

  protected onSaveRolesAndPermissions(): void {
    const id = this.userId();
    if (!id) return;

    if (this.draftRoleIds().length === 0) {
      this.message.error('Selecciona al menos un rol.');
      return;
    }

    const roleIds = this.draftRoleIds();
    const permissions = [...this.draftPermissions()];
    if (!this.service.accessChanged(id, roleIds, permissions)) {
      this.message.info('No hay cambios que guardar.');
      return;
    }

    // `PATCH /users/{id}/roles`: la respuesta es autoritativa y el borrador se alinea con ella.
    this.savingAccess.set(true);
    this.service.changeRoles(id, roleIds, permissions).subscribe({
      next: (updated) => {
        this.savingAccess.set(false);
        this.draftRoleIds.set([...updated.roleIds]);
        this.draftPermissions.set(new Set(updated.permissions));
        this.message.success('Roles y permisos actualizados.');
        if (updated.backendUserId) this.refreshBackendDetail();
      },
      error: (err: unknown) => {
        this.savingAccess.set(false);
        // Vuelve al estado guardado: lo que el backend rechazó no se queda "a medias".
        const current = this.user();
        if (current) {
          this.draftRoleIds.set([...current.roleIds]);
          this.draftPermissions.set(new Set(current.permissions));
        }
        this.showMutationError(err);
      },
    });
  }

  // `PATCH /users/{id}/status` tras confirmar; el modal gira hasta que responde el backend.
  protected onStatusChangeRequest(next: UserStatus): void {
    const user = this.user();
    if (!user) return;

    const label = STATUS_META[next].label;
    this.modal.confirm({
      nzTitle: 'Cambiar estado',
      nzContent: `¿Cambiar el estado de <b>${fullName(user)}</b> a <b>${label}</b>?`,
      nzOkText: 'Cambiar',
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          this.service.setStatus(user.id, next).subscribe({
            next: (updated) => {
              this.message.success(`Estado actualizado a ${label}.`);
              if (updated.backendUserId) this.refreshBackendDetail();
              resolve();
            },
            error: (err: unknown) => {
              this.showMutationError(err);
              reject();
            },
          });
        }),
    });
  }

  // `POST /users/{id}/verify-email`, sin confirmación: bajo riesgo.
  protected onVerifyEmailClick(): void {
    const id = this.userId();
    if (!id) return;

    this.service.setEmailVerified(id).subscribe({
      next: (updated) => {
        this.message.success('Correo marcado como verificado.');
        if (updated.backendUserId) this.refreshBackendDetail();
      },
      error: (err: unknown) => this.showMutationError(err),
    });
  }

  // Recarga el detalle (si no, el merge pisaría lo recién guardado) y el historial.
  // Ver docs/codigo/usuarios-pantallas.md#detalle-errores
  private refreshBackendDetail(): void {
    this.detailResource.reload();
    this.reloadAudit();
  }

  // Solo red caída (status 0) y errores locales; el resto lo avisa el interceptor.
  private showMutationError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) this.message.error('No se pudo conectar con el servidor. Intenta de nuevo.');
      return;
    }
    const text = err instanceof Error ? err.message : 'No se pudo completar la acción.';
    this.message.error(text);
  }

  protected onCloseSessionsClick(): void {
    const id = this.userId();
    if (!id) return;

    // `POST /users/{id}/close-sessions`: el access token ya emitido vive hasta 15 min.
    this.closingSessions.set(true);
    this.service.closeSessions(id).subscribe({
      next: (updated) => {
        this.closingSessions.set(false);
        this.message.success('Sesiones activas cerradas.');
        if (updated.backendUserId) this.refreshBackendDetail();
      },
      error: (err: unknown) => {
        this.closingSessions.set(false);
        this.showMutationError(err);
      },
    });
  }

  // `POST /users/{id}/reset-password`: nueva temporal y cierre de sesiones.
  // Ver docs/codigo/usuarios-pantallas.md#detalle-seguridad-y-acceso
  protected onResetPasswordClick(): void {
    const user = this.user();
    if (!user) return;

    this.modal.confirm({
      nzTitle: 'Restablecer contraseña',
      nzContent: `¿Restablecer la contraseña de <b>${fullName(user)}</b>? Se generará una nueva contraseña temporal, deberá cambiarla al iniciar sesión y se cerrarán todas sus sesiones activas.`,
      nzOkText: 'Restablecer',
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          this.service.resetPassword(user.id).subscribe({
            next: (tempPassword) => {
              this.message.success(`Contraseña restablecida. Temporal: ${tempPassword}`, { nzDuration: 8000 });
              if (user.backendUserId) this.refreshBackendDetail();
              resolve();
            },
            error: (err: unknown) => {
              this.showMutationError(err);
              reject();
            },
          });
        }),
    });
  }

  // Nadie puede darse de baja a sí mismo (409 CANNOT_DELETE_SELF).
  protected readonly isSelf = computed(() => !!this.userId() && this.service.currentAppUser()?.id === this.userId());

  // `DELETE /users/{id}`: baja lógica (conserva historial, libera el correo); vuelve a la lista.
  protected onDeleteClick(): void {
    const user = this.user();
    if (!user) return;

    this.modal.confirm({
      nzTitle: 'Eliminar usuario',
      nzContent: `¿Eliminar a <b>${fullName(user)}</b>? Dejará de poder iniciar sesión y se cerrarán sus sesiones. Su historial se conserva y su correo quedará libre.`,
      nzOkText: 'Eliminar',
      nzOkDanger: true,
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          this.service.deleteUser(user.id).subscribe({
            next: () => {
              this.message.success('Usuario eliminado.');
              resolve();
              void this.router.navigateByUrl('/usuarios');
            },
            error: (err: unknown) => {
              this.showMutationError(err);
              reject();
            },
          });
        }),
    });
  }

  // CU3 paso 5: `PATCH /users/{id}/unlock`; disponible siempre que haya `backendUserId`.
  // Ver docs/codigo/usuarios-pantallas.md#detalle-seguridad-y-acceso
  protected onUnlockBackendClick(): void {
    const user = this.user();
    if (!user?.backendUserId) return;
    const backendUserId = user.backendUserId;

    this.modal.confirm({
      nzTitle: 'Desbloquear cuenta (backend real)',
      nzContent: `¿Desbloquear en el backend real la cuenta de <b>${fullName(user)}</b> (id ${backendUserId})? Aplica si quedó bloqueada tras 5 intentos fallidos de inicio de sesión (bloqueo temporal de 2 horas) o por bloqueo manual; también reinicia el contador de intentos.`,
      nzOkText: 'Desbloquear',
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          // También reinicia intentos fallidos y `lockedUntil`; 403/404 los avisa el interceptor.
          this.service.unlockAccount(user.id).subscribe({
            next: (updated) => {
              this.message.success('Cuenta desbloqueada en el backend real.');
              if (updated.backendUserId) this.refreshBackendDetail();
              resolve();
            },
            error: (err: unknown) => {
              this.showMutationError(err);
              reject();
            },
          });
        }),
    });
  }

  // Copia la temporal para entregarla por el medio acordado (DED, CU3 paso 2).
  protected async onCopyTemporaryPassword(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.message.success('Contraseña temporal copiada.');
    } catch {
      this.message.error('No se pudo copiar. Selecciona la contraseña y cópiala manualmente.');
    }
  }
}
