import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
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
import { UserManagementService, backendStatusToLocal } from '../data/user-management.service';
import { AccessCatalogService } from '../data/access-catalog.service';
import { AccessControlService } from '../../auth/data/access-control.service';
import { AREAS, DEPARTMENTS, JOB_TITLES } from '../data/organization-catalog';
import { avatarTokensFor, initialsFor } from '../../../shared/utils/avatar-color.util';
import { StatusChip } from '../status-chip/status-chip';
import { CatalogService } from '../../../core/services/catalog.service';
import { COUNTRY_PROFILE } from '../../../core/country/active-country';
import { AuthService, UserDetailDto } from '../../auth/data/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

// `nz-date-picker` trabaja con `Date | null` — el model guarda fecha (sin
// hora) como ISO string (`'yyyy-MM-dd'`) o `null`. Estas 2 funciones son las
// únicas que cruzan esa frontera, en los 2 sentidos.
function parseIsoDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toIsoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

function toIsoDateOrNull(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

@Component({
  selector: 'app-user-detail',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
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
  // Ligado a :userId de la ruta (withComponentInputBinding) — ausente en
  // /usuarios/nuevo, que apunta a este mismo componente en modo creación
  // (ver app.routes.ts).
  readonly userId = input<string>();

  protected readonly service = inject(UserManagementService);
  protected readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  // Vocabulario del país activo: identificación personal, dirección, teléfono.
  protected readonly country = inject(COUNTRY_PROFILE);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  // Flecha del nz-page-header: de vuelta a la pantalla padre (Administración de usuarios).
  protected onBack(): void {
    void this.router.navigateByUrl('/usuarios');
  }

  protected readonly fullName = fullName;
  protected readonly statusMeta = STATUS_META;
  // Roles y permisos REALES (`GET /roles`, `GET /permissions`) — ver AccessCatalogService.
  protected readonly accessCatalog = inject(AccessCatalogService);
  protected readonly roleOptions = this.accessCatalog.roleOptions;
  protected readonly permissionGroups = this.accessCatalog.permissionGroups;
  protected readonly catalogLoading = this.accessCatalog.loading;
  private readonly access = inject(AccessControlService);
  // `PATCH /users/{id}/roles` COMPLETO (roles Y permisos) exige `manage_roles` en
  // quien lo ejecuta — probado contra DEV: con solo `manage_users`, incluso un
  // cambio solo de permisos responde 403 ROLE_ASSIGNMENT_FORBIDDEN. Sin él, esta
  // sección queda de solo lectura.
  protected readonly canEditAccess = computed(() => this.access.hasPermission('manage_roles'));
  protected readonly savingAccess = signal(false);
  protected readonly closingSessions = signal(false);
  protected readonly auditActionLabel = auditActionLabel;
  private readonly auditLogService = inject(AuditLogService);
  protected readonly departments = DEPARTMENTS;
  protected readonly areas = AREAS;
  protected readonly jobTitles = JOB_TITLES;
  protected readonly genderOptions = GENDER_OPTIONS;

  protected subsidiariaNames(ids: number[]): string[] {
    return ids
      .map((id) => this.catalog.findSubsidiaria(id)?.nombre)
      .filter((name): name is string => !!name);
  }

  protected ubicacionNames(ids: number[]): string[] {
    return ids
      .map((id) => this.catalog.findUbicacion(id)?.nombre)
      .filter((name): name is string => !!name);
  }

  protected readonly isCreate = computed(() => !this.userId());

  // Detalle REAL del backend (`GET /users/{id}`) para la cuenta mostrada —
  // `null` mientras no haya cargado o la cuenta no tenga `backendUserId`
  // (ver el effect del constructor, que la llena). `user()` la fusiona
  // sobre la base del mock: es la fuente de verdad para TODO lo que el
  // backend SÍ modela (roles, permisos, estado, organización, teléfono...);
  // lo que no modela (avatarUrl, 2FA, sesiones activas) se queda del mock.
  private readonly backendDetail = signal<UserDetailDto | null>(null);

  protected readonly user = computed<AppUser | null>(() => {
    const id = this.userId();
    const base = id ? (this.service.allUsers().find((u) => u.id === id) ?? null) : null;
    if (!base) return null;
    const detail = this.backendDetail();
    // `detail.id !== base.backendUserId`: el detalle todavía es de la
    // cuenta ANTERIOR (el effect que lo carga no ha terminado tras
    // navegar) — no fusionar datos de alguien más mientras tanto.
    if (!detail || detail.id !== base.backendUserId) return base;
    return this.mergeBackendDetail(base, detail);
  });

  // Contraseña temporal a mostrar en "Organización" — ya viene fusionada en
  // `user()` (del backend real cuando hay `backendUserId`, del mock si no).
  // Solo se muestra si no está vacía.
  protected readonly temporaryPassword = computed(() => this.user()?.temporaryPassword?.trim() || null);

  // Superpone `UserDetailDto` (backend real) sobre `base` (registro mock) —
  // todo lo que el backend modela gana; lo que no (avatarUrl, 2FA, última
  // actividad, `id` 'uXXXX' de este mock) se queda de `base`.
  private mergeBackendDetail(base: AppUser, detail: UserDetailDto): AppUser {
    // `manager.id` es un id REAL del backend — se resuelve de vuelta al
    // 'uXXXX' de ESTE mock vía `backendUserId` (ver
    // `UserManagementService.findByBackendUserId`); `null` si ese manager
    // no tiene bridge conocido todavía.
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
      department: detail.department ?? '',
      area: detail.area ?? '',
      jobTitle: detail.jobTitle ?? '',
      managerId,
      employeeId: detail.employeeCode ?? '',
      hireDate: detail.hireDate ?? '',
      contractEndDate: detail.contractEndDate,
      subsidiariaIds: detail.subsidiarias.map((s) => s.id),
      ubicacionIds: detail.ubicaciones.map((u) => u.id),
    };
  }

  // Hay :userId en la ruta pero no hay usuario con ese id — eliminado o
  // inexistente. Distinto de isCreate() (sin :userId en absoluto).
  protected readonly notFound = computed(() => !!this.userId() && this.user() === null);

  // Pestaña "Historial": `GET /users/{id}/audit-log` (bitácora REAL, paginada en el
  // servidor). Exige `view_audit_log` — sin él la pestaña queda deshabilitada
  // (no se pide, daría 403). Funciona aunque la cuenta ya esté dada de baja.
  protected readonly canViewAudit = computed(() => this.access.hasPermission('view_audit_log'));
  protected readonly auditPageSize = 10;
  protected readonly auditEntries = signal<AuditLogEntry[]>([]);
  protected readonly auditTotal = signal(0);
  protected readonly auditPage = signal(1); // 1-based (nz-pagination); el backend usa 0-based
  protected readonly auditLoading = signal(false);
  protected readonly auditFailed = signal(false);
  private auditSub: { unsubscribe(): void } | null = null;

  // Una petición a la vez: una consulta nueva cancela la anterior (el usuario cambia
  // de página rápido, o se guarda algo mientras carga).
  private loadAudit(backendUserId: number, page = 1): void {
    if (!this.canViewAudit()) return;
    this.auditSub?.unsubscribe();
    this.auditPage.set(page);
    this.auditLoading.set(true);
    this.auditFailed.set(false);
    this.auditSub = this.auditLogService.listForUser(backendUserId, { page: page - 1, size: this.auditPageSize }).subscribe({
      next: (result) => {
        this.auditEntries.set(result.entries);
        this.auditTotal.set(result.totalElements);
        this.auditLoading.set(false);
      },
      // El aviso (403, 404...) lo da `notifyBackendError`.
      error: () => {
        this.auditEntries.set([]);
        this.auditTotal.set(0);
        this.auditLoading.set(false);
        this.auditFailed.set(true);
      },
    });
  }

  protected onAuditPageChange(page: number): void {
    const backendUserId = this.user()?.backendUserId;
    if (backendUserId) this.loadAudit(backendUserId, page);
  }

  // Candidatos a "Administrador responsable" — cualquier admin/supervisor
  // EXCEPTO el propio usuario que se está editando (no puede ser su propio
  // responsable).
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

  // Mismo helper que user-list.ts para el avatar (foto real con fallback a
  // iniciales+color, ver AppUser.avatarUrl) — aquí en un avatar rectangular
  // más grande, no el circular pequeño de la fila de una tabla.
  protected avatarStyle(user: AppUser): Record<string, string> {
    return avatarTokensFor(user.id);
  }

  protected initials(user: AppUser): string {
    return initialsFor(fullName(user));
  }

  // Nombre/correo/teléfono con validación real (requerido, formato) →
  // Reactive Forms, mismo criterio que login.ts. Roles/permisos/estado son
  // controles simples sin reglas de validación propias → ngModel directo
  // (mismo criterio que los filtros de reconciliation-dashboard) — de ahí la
  // mezcla de FormsModule + ReactiveFormsModule en este componente.
  protected readonly infoForm = this.fb.group({
    firstName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    lastName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required, Validators.pattern(PHONE_PATTERN)]),
    // Fecha de nacimiento/SSN/género/dirección — igual que "Organización":
    // no se piden al crear, sin validadores propios (datos de referencia,
    // no credenciales de acceso).
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

  // "Organización" no se pide al crear — solo aplica editando un usuario
  // existente (ver CreateUserInput / UserManagementService.createUser).
  protected readonly orgForm = this.fb.group({
    department: this.fb.control(''),
    area: this.fb.control(''),
    jobTitle: this.fb.control(''),
    managerId: this.fb.control<string | null>(null),
    employeeId: this.fb.control(''),
    hireDate: this.fb.control<Date | null>(null),
    contractEndDate: this.fb.control<Date | null>(null),
    subsidiariaIds: this.fb.control<number[]>([]),
    ubicacionIds: this.fb.control<number[]>([]),
  });

  // --- Estado local de creación (solo aplica cuando isCreate()) ---
  protected readonly createRoleIds = signal<RoleId[]>([]);
  protected readonly createActive = signal(true);
  // A diferencia del resto de "Organización" (que solo se pide editando, ver
  // orgForm/onSaveProfile), subsidiaria/ubicación SÍ se piden al crear — ver
  // AppUser.subsidiariaIds/.ubicacionIds. El backend acepta varias de cada
  // una (`CreateUserRequest.subsidiariaIds`/`.ubicacionIds`, N:M real).
  protected readonly createSubsidiariaIds = signal<number[]>([]);
  protected readonly createUbicacionIds = signal<number[]>([]);
  // Supervisor — select SIMPLE (un solo responsable, a diferencia de
  // roles/subsidiarias/ubicaciones que sí aceptan varias). `null` = sin
  // asignar; se manda como `supervisorId` real en el alta (ver
  // `CreateUserInput.managerId` / `UserManagementService.createUser`).
  protected readonly createManagerId = signal<string | null>(null);
  // `POST /users` es una llamada real — deshabilita el botón mientras está
  // en vuelo (mismo criterio que `Login.submitting`), no instantáneo como
  // antes cuando `createUser` solo tocaba el mock.
  protected readonly submittingCreate = signal(false);

  // --- Borrador de "Seguridad y acceso" (solo aplica editando un usuario existente) ---
  protected readonly draftRoleIds = signal<RoleId[]>([]);
  protected readonly draftPermissions = signal<Set<PermissionKey>>(new Set());

  // --- Modo edición de "Información general" (datos personales +
  // organización) — de solo lectura por defecto; el botón "Editar" del
  // header lo activa para AMBAS sub-cards a la vez (ver user-detail.html).
  // No aplica a "Seguridad y acceso" (roles/permisos ya tienen su propio
  // flujo de edición directa, con su propio botón "Guardar permisos").
  protected readonly isEditing = signal(false);
  // `PATCH /users/{id}` es una llamada real — deshabilita "Guardar cambios"
  // mientras está en vuelo, mismo criterio que `submittingCreate`.
  protected readonly savingProfile = signal(false);

  constructor() {
    // Consulta el detalle REAL del backend (`GET /users/{id}`) solo cuando
    // cambia la cuenta mostrada Y tiene `backendUserId` — keyed en el
    // registro BASE del mock (`untracked`, no en `user()`) para no
    // depender de su propia salida (`user()` se arma A PARTIR de
    // `backendDetail`, ver el computed de arriba) y evitar así un ciclo.
    // Si falla o la cuenta no tiene `backendUserId`, `user()` cae solo al
    // mock — mismo criterio de siempre.
    effect((onCleanup) => {
      const id = this.userId();
      this.backendDetail.set(null);
      this.auditEntries.set([]);
      this.auditTotal.set(0);
      const backendUserId = id ? untracked(() => this.service.findUser(id)?.backendUserId ?? null) : null;
      if (backendUserId === null) return;
      const sub = this.auth.getUserDetail(backendUserId).subscribe({
        next: (detail) => this.backendDetail.set(detail),
        error: () => this.backendDetail.set(null),
      });
      untracked(() => this.loadAudit(backendUserId));
      onCleanup(() => {
        sub.unsubscribe();
        this.auditSub?.unsubscribe();
      });
    });

    // effect (no computed): reinicia formularios + borradores al entrar a un
    // usuario distinto, o cuando el detalle real del backend termina de
    // cargar para ESA misma cuenta (`user()` cambia de valor en ambos
    // casos, ver el computed de arriba) — tiene side-effects (patchValue,
    // reset), mismo criterio que DifferenceManagement con
    // tenderMedia()/orderId() (ver difference-management.ts). Lee `user()`
    // reactivamente (NO `untracked`) a propósito: es lo que hace que el
    // formulario se actualice solo cuando llega el detalle real, sin ese
    // segundo disparo se quedaría con los valores (incompletos) del mock
    // hasta la próxima navegación. Reaccionar también a un guardado propio
    // (`onSaveProfile`) es inofensivo — deja el form con los mismos valores
    // que ya tenía.
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
          department: found.department,
          area: found.area,
          jobTitle: found.jobTitle,
          managerId: found.managerId,
          employeeId: found.employeeId,
          hireDate: parseIsoDate(found.hireDate),
          contractEndDate: parseIsoDate(found.contractEndDate),
          subsidiariaIds: [...found.subsidiariaIds],
          ubicacionIds: [...found.ubicacionIds],
        });
        this.draftRoleIds.set([...found.roleIds]);
        this.draftPermissions.set(new Set(found.permissions));
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
          department: '',
          area: '',
          jobTitle: '',
          managerId: null,
          employeeId: '',
          hireDate: null,
          contractEndDate: null,
          subsidiariaIds: [],
          ubicacionIds: [],
        });
        this.createRoleIds.set([]);
        this.createActive.set(true);
        this.createSubsidiariaIds.set([]);
        this.createUbicacionIds.set([]);
        this.createManagerId.set(null);
        this.submittingCreate.set(false);
        this.draftRoleIds.set([]);
        this.draftPermissions.set(new Set());
      }
      // Nunca entrar a un usuario (o volver a /usuarios/nuevo) ya en modo
      // edición — es estado de ESTA visita a la pantalla, no debe sobrevivir
      // a la navegación.
      this.isEditing.set(false);
    });
  }

  protected onEditClick(): void {
    this.isEditing.set(true);
  }

  // Descarta cambios sin guardar en ambos formularios (info + organización)
  // y vuelve a la vista de solo lectura — sin esto, "Cancelar" dejaría
  // valores a medio escribir visibles la próxima vez que se entre a editar.
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
        department: user.department,
        area: user.area,
        jobTitle: user.jobTitle,
        managerId: user.managerId,
        employeeId: user.employeeId,
        hireDate: parseIsoDate(user.hireDate),
        contractEndDate: parseIsoDate(user.contractEndDate),
        subsidiariaIds: [...user.subsidiariaIds],
        ubicacionIds: [...user.ubicacionIds],
      });
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

  // Cambiar los roles asignados resetea el borrador de permisos a la unión
  // de los defaults de esos roles — el admin ajusta desde ahí (ver
  // UserManagementService.changeRoles).
  protected onRolesSelectChange(roleIds: RoleId[]): void {
    this.draftRoleIds.set(roleIds);
    this.draftPermissions.set(new Set(this.accessCatalog.defaultPermissionsForRoles(roleIds)));
  }

  // Un solo guardado para TODA "Información general" (datos personales +
  // organización) — valida y envía los 2 `FormGroup` JUNTOS en una sola
  // llamada al service (`updateUserProfile`), no una por sección. Solo
  // `infoForm` tiene validadores propios (nombre/correo/teléfono
  // requeridos); `orgForm` es enteramente opcional, así que basta con
  // chequear la validez de `infoForm`.
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
          if (updated.backendUserId) this.refreshBackendDetail(updated.backendUserId);
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

    // `PATCH /users/{id}/roles` real: solo manda lo que cambió; la respuesta es
    // autoritativa, así que el borrador se alinea con ella.
    this.savingAccess.set(true);
    this.service.changeRoles(id, roleIds, permissions).subscribe({
      next: (updated) => {
        this.savingAccess.set(false);
        this.draftRoleIds.set([...updated.roleIds]);
        this.draftPermissions.set(new Set(updated.permissions));
        this.message.success('Roles y permisos actualizados.');
        // El detalle real (`backendDetail`) se mezcla ENCIMA del registro local: se vuelve a pedir para que no muestre lo anterior.
        if (updated.backendUserId) this.refreshBackendDetail(updated.backendUserId);
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

  // El chip emite la intención, la confirmación vive aquí — mismo patrón
  // que UserList.onStatusChangeRequest (ver StatusChip). `PATCH
  // /users/{id}/status` real (ver `UserManagementService.setStatus`) — el
  // modal se queda abierto/girando (`nzOnOk` devuelve una Promise) hasta
  // que el backend responde, mismo criterio que `onUnlockBackendClick`.
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
              if (updated.backendUserId) this.refreshBackendDetail(updated.backendUserId);
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

  // `POST /users/{id}/verify-email` real (ver
  // `UserManagementService.setEmailVerified`) — sin modal de confirmación
  // (mismo criterio que antes de conectar el backend real: es una acción de
  // bajo riesgo, solo visible cuando el correo AÚN no está verificado, ver
  // user-detail.html).
  protected onVerifyEmailClick(): void {
    const id = this.userId();
    if (!id) return;

    this.service.setEmailVerified(id).subscribe({
      next: (updated) => {
        this.message.success('Correo marcado como verificado.');
        if (updated.backendUserId) this.refreshBackendDetail(updated.backendUserId);
      },
      error: (err: unknown) => this.showMutationError(err),
    });
  }

  // Refresca `backendDetail` tras una mutación exitosa (`onSaveProfile`/
  // `onStatusChangeRequest`/`onVerifyEmailClick`) — SIN esto, `user()`
  // seguiría fusionando el detalle VIEJO (cargado al entrar a la pantalla,
  // ver el effect del constructor) sobre el `usersSignal` recién
  // actualizado, y el merge pisaría los campos que la mutación acaba de
  // guardar con los valores desactualizados. Best-effort y silencioso: si
  // falla, `user()` simplemente se queda con el detalle anterior (mismo
  // criterio que el effect del constructor).
  private refreshBackendDetail(backendUserId: number): void {
    this.auth.getUserDetail(backendUserId).subscribe({
      next: (detail) => this.backendDetail.set(detail),
      error: () => {},
    });
    // El backend registra cada acción en su bitácora: se vuelve a pedir la
    // primera página para que "Historial" muestre lo que acaba de pasar.
    this.loadAudit(backendUserId);
  }

  // Aviso para las mutaciones reales de este componente (`onSaveProfile`/
  // `onStatusChangeRequest`/`onVerifyEmailClick`). Todo error con respuesta
  // del backend (códigos de negocio Y el 403 sin código por falta de
  // permiso) ya lo avisa `notifyBackendError`; aquí solo quedan la
  // caída de red (status 0, sin respuesta que interpretar) y los errores
  // LOCALES (guard de `UserManagementService` por usuario sin
  // `backendUserId`, no debería pasar en la práctica).
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

    // `POST /users/{id}/close-sessions` real: la persona puede volver a entrar; el
    // access token ya emitido vive hasta 15 min.
    this.closingSessions.set(true);
    this.service.closeSessions(id).subscribe({
      next: (updated) => {
        this.closingSessions.set(false);
        this.message.success('Sesiones activas cerradas.');
        if (updated.backendUserId) this.refreshBackendDetail(updated.backendUserId);
      },
      error: (err: unknown) => {
        this.closingSessions.set(false);
        this.showMutationError(err);
      },
    });
  }

  // `POST /users/{id}/reset-password` real: la persona vuelve a su contraseña
  // temporal (se muestra una sola vez en el toast y en "Organización" mientras siga
  // pendiente), debe cambiarla al entrar y se CIERRAN todas sus sesiones. El
  // modal queda girando hasta que el backend responde.
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
              if (user.backendUserId) this.refreshBackendDetail(user.backendUserId);
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
  protected readonly isSelf = computed(() => !!this.userId() && this.access.currentAppUser()?.id === this.userId());

  // `DELETE /users/{id}` real: baja LÓGICA — la cuenta deja de poder entrar y sale
  // de la lista, pero su historial se conserva (sigue consultable) y su correo
  // queda libre. Al terminar vuelve a la lista.
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

  // CU3 paso 5: desbloquea la cuenta REAL en el backend (`PATCH
  // /users/{id}/unlock`, ver AuthService.unlockUser) — solo visible cuando
  // `user.backendUserId` no es null (una de las 4 cuentas demo sembradas
  // ahí, ver BACKEND_USER_ID en user-management-mock.data.ts). Sin
  // relación con el botón "Cambiar estado" de arriba: ESE mueve el
  // `status` de este registro MOCK, que ya no reflejaba el bloqueo real
  // desde que el login dejó de simular intentos fallidos localmente (ver
  // MASTER.md, "Actualización: login apuntado al backend real") — no hay
  // endpoint para CONSULTAR el estado real (solo para desbloquear), así que
  // este botón siempre está disponible para una cuenta con `backendUserId`,
  // no solo cuando "se ve" bloqueada.
  protected onUnlockBackendClick(): void {
    const user = this.user();
    if (!user?.backendUserId) return;
    const backendUserId = user.backendUserId;

    this.modal.confirm({
      nzTitle: 'Desbloquear cuenta',
      nzContent: `¿Desbloquear la cuenta de <b>${fullName(user)}</b> (id ${backendUserId})? Aplica si quedó bloqueada tras 5 intentos fallidos de inicio de sesión (bloqueo temporal de 2 horas) o por bloqueo manual; también reinicia el contador de intentos.`,
      nzOkText: 'Desbloquear',
      nzOnOk: () =>
        new Promise<void>((resolve, reject) => {
          // `unlockAccount` también deja en cero intentos fallidos y
          // `lockedUntil`; el 403 (falta `manage_users`) y el 404 los avisa
          // `notifyBackendError`.
          this.service.unlockAccount(user.id).subscribe({
            next: (updated) => {
              this.message.success('Cuenta desbloqueada.');
              if (updated.backendUserId) this.refreshBackendDetail(updated.backendUserId);
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

  // Copia la contraseña temporal (generada por el backend, ver
  // `temporaryPassword`) para entregarla al usuario por el medio acordado con
  // el cliente (DED, CU3 paso 2).
  protected async onCopyTemporaryPassword(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.message.success('Contraseña temporal copiada.');
    } catch {
      this.message.error('No se pudo copiar. Selecciona la contraseña y cópiala manualmente.');
    }
  }

  protected onCreateSubmit(): void {
    if (this.infoForm.invalid || this.createRoleIds().length === 0) {
      this.infoForm.markAllAsTouched();
      if (this.createRoleIds().length === 0) {
        this.message.error('Selecciona al menos un rol.');
      }
      return;
    }

    const { firstName, lastName, email, phone } = this.infoForm.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();
    const emailTaken = this.service.allUsers().some((u) => u.email.toLowerCase() === normalizedEmail);
    if (emailTaken) {
      this.message.error('Ya existe un usuario con ese correo.');
      return;
    }

    this.submittingCreate.set(true);
    this.service
      .createUser({
        firstName,
        lastName,
        email,
        phone,
        roleIds: this.createRoleIds(),
        status: this.createActive() ? 'active' : 'inactive',
        subsidiariaIds: this.createSubsidiariaIds(),
        ubicacionIds: this.createUbicacionIds(),
        managerId: this.createManagerId(),
      })
      .subscribe({
        next: (user) => {
          this.submittingCreate.set(false);
          this.message.success(`Usuario ${fullName(user)} creado. Su contraseña temporal aparece en "Organización".`);
          this.router.navigate(['/usuarios', user.id]);
        },
        error: () => {
          // El texto ya lo muestra `notifyBackendError` (409
          // EMAIL_ALREADY_REGISTERED, 400 INVALID_ROLE/INVALID_USER_STATUS,
          // 403 ROLE_ASSIGNMENT_FORBIDDEN...) — aquí solo se reactiva el
          // formulario para que la persona pueda corregir y reintentar.
          this.submittingCreate.set(false);
        },
      });
  }
}
