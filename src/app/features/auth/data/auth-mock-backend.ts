import { HttpErrorResponse } from '@angular/common/http';
import { CatalogEntry } from '../../../shared/models/catalog-entry.model';
import { AppUser } from '../../user-management/data/user-management.model';
import { MOCK_USERS } from '../../user-management/data/user-management-mock.data';
import type {
  AddressInfo,
  AuditLogEntryDto,
  AuditLogPage,
  AuditLogParams,
  CloseSessionsResponse,
  CreateUserRequest,
  DeleteUserResponse,
  EmailVerificationResponse,
  PermissionDto,
  ResetPasswordResponse,
  RoleDto,
  UpdateUserRequest,
  UpdateUserRolesRequest,
  UserDetailDto,
  UserListPage,
  UserListParams,
  UserSummaryDto,
} from './auth.service';
import {
  MOCK_DEFAULT_PASSWORD,
  MOCK_DEMO_PASSWORDS,
  MOCK_MUST_CHANGE_PASSWORD,
  MOCK_PERMISSIONS,
  MOCK_ROLES,
  MOCK_SUBSIDIARIAS,
  MOCK_UBICACIONES,
} from './auth-mock.data';
import { SESSION_IDLE_TIMEOUT_CODE } from './auth-errors';
import { MOCK_SESSION_IDLE_TIMEOUT_MS, mockSessionIdleMs } from './mock-session-activity';
import { issueMockTokenPair } from './mock-token.util';

// Backend SIMULADO del auth-service (`/auth/**`, `/users/**`, `/roles`,
// `/permissions`, `/audit-log`) — esta rama trabaja solo con data local: no
// hay HttpClient ni red. `AuthService` llama a estos métodos en lugar de hacer
// peticiones HTTP; cada uno replica el contrato de la
// `Guia_Endpoints_Usuarios_Roles_Permisos` (mismos DTOs, mismas reglas y los
// mismos errores — `HttpErrorResponse` con cuerpo `{ error, code }`), así que
// el resto del front es el mismo código que en la rama de integración.
//
// El estado (cuentas, tokens, bitácora) se guarda en sessionStorage para que
// sobreviva a un F5 en la misma pestaña, igual que la sesión.

const STORAGE_KEY = 'conciliation-mock-backend';
const STATE_VERSION = 2;

// Vida del accessToken (segundos). El backend real usa 15 min; aquí se acorta
// para poder OBSERVAR la rotación automática del refresh token en una sesión
// de prueba normal (AuthService renueva 30 s antes de que venza).
const ACCESS_TOKEN_TTL_S = 90;
const MAX_FAILED_ATTEMPTS = 5;
const AUTO_LOCK_MS = 2 * 60 * 60_000; // 2 horas
const MIN_PASSWORD_LENGTH = 8;

type BackendStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

const STATUS_LABEL: Record<BackendStatus, string> = { ACTIVE: 'Activo', INACTIVE: 'Inactivo', LOCKED: 'Bloqueado' };

interface MockAccount {
  id: number;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: BackendStatus;
  roles: string[];
  permissions: string[];
  subsidiariaIds: number[];
  ubicacionIds: number[];
  mustChangePassword: boolean;
  temporaryPassword: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  emailVerified: boolean;
  createdAt: string;
  birthDate: string | null;
  ssn: string | null;
  gender: string | null;
  address: AddressInfo;
  department: string | null;
  area: string | null;
  jobTitle: string | null;
  managerId: number | null;
  employeeCode: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
  // Baja lógica (`DELETE /users/{id}`): la fila y su bitácora se conservan.
  deleted: boolean;
}

interface MockToken {
  userId: number;
  expiresAt: number; // epoch ms (solo accessToken)
}

interface MockState {
  version: number;
  accounts: MockAccount[];
  audit: AuditLogEntryDto[];
  accessTokens: Record<string, MockToken>;
  refreshTokens: Record<string, MockToken>;
  nextUserId: number;
  nextAuditId: number;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function httpError(status: number, error: string | null, code?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: String(status),
    error: code ? { error, code } : { status, error },
    url: 'mock://auth-service',
  });
}

const notFound = () => httpError(404, 'Usuario no encontrado.', 'USER_NOT_FOUND');
const forbidden = () => httpError(403, 'Forbidden');

// Regla del backend para la contraseña temporal: NOMBRE + PRIMER APELLIDO +
// año de alta, en mayúsculas y sin acentos (p. ej. "LAURAGOMEZ2026").
function temporaryPasswordFor(firstName: string, lastName: string, createdAt: string): string {
  const clean = (text: string) =>
    (text.trim().split(/\s+/)[0] ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase();
  return `${clean(firstName)}${clean(lastName)}${createdAt.slice(0, 4)}`;
}

function toBackendStatus(status: AppUser['status']): BackendStatus {
  return status === 'blocked' ? 'LOCKED' : status === 'inactive' ? 'INACTIVE' : 'ACTIVE';
}

function defaultPermissions(roles: readonly string[]): string[] {
  const set = new Set<string>();
  for (const role of roles) MOCK_ROLES.find((r) => r.code === role)?.defaultPermissions.forEach((p) => set.add(p));
  return [...set];
}

function roleNames(codes: readonly string[]): string {
  return codes.map((code) => MOCK_ROLES.find((r) => r.code === code)?.name ?? code).join(', ');
}

function displayName(account: Pick<MockAccount, 'firstName' | 'lastName'>): string {
  return `${account.firstName} ${account.lastName}`.trim();
}

function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function seedState(): MockState {
  // Mismo puente que la rama de integración: cada `AppUser` de
  // `user-management-mock.data.ts` es una cuenta del backend con su
  // `backendUserId`; si alguna no lo trae, se le asigna uno nuevo.
  let nextUserId = Math.max(1, ...MOCK_USERS.map((u) => u.backendUserId ?? 0)) + 1;
  const idByAppUserId = new Map<string, number>();
  for (const user of MOCK_USERS) {
    idByAppUserId.set(user.id, user.backendUserId ?? nextUserId++);
  }

  const accounts: MockAccount[] = MOCK_USERS.map((user) => {
    const email = user.email.toLowerCase();
    const mustChange = MOCK_MUST_CHANGE_PASSWORD.has(email);
    const password = MOCK_DEMO_PASSWORDS[email] ?? MOCK_DEFAULT_PASSWORD;
    return {
      id: idByAppUserId.get(user.id)!,
      email: user.email,
      password,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || null,
      status: toBackendStatus(user.status),
      roles: [...user.roleIds],
      permissions: defaultPermissions(user.roleIds),
      subsidiariaIds: [...user.subsidiariaIds],
      ubicacionIds: [...user.ubicacionIds],
      mustChangePassword: mustChange,
      temporaryPassword: mustChange ? password : null,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: null,
      lastLoginAt: user.lastAccessAt,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      birthDate: user.birthDate || null,
      ssn: user.ssn || null,
      gender: user.gender || null,
      address: {
        city: user.address.city,
        state: user.address.state,
        postalCode: user.address.zipCode,
        street1: user.address.street1,
        street2: user.address.street2,
        interiorNumber: user.address.interiorNumber,
        exteriorNumber: user.address.exteriorNumber,
      },
      department: user.department || null,
      area: user.area || null,
      jobTitle: user.jobTitle || null,
      managerId: user.managerId ? (idByAppUserId.get(user.managerId) ?? null) : null,
      employeeCode: user.employeeId || null,
      hireDate: user.hireDate || null,
      contractEndDate: user.contractEndDate,
      deleted: false,
    };
  });

  // Bitácora de partida: el alta de cada cuenta (la del administrador
  // principal la hizo el sistema) — suficiente para que "Historial y
  // auditoría" no arranque vacío; lo demás se va registrando al usarla.
  const admin = accounts.find((a) => a.roles.includes('ADMIN'));
  const audit: AuditLogEntryDto[] = [...accounts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((account, index) => {
      const actor = admin && admin.id !== account.id ? { id: admin.id, displayName: displayName(admin) } : null;
      return {
        id: index + 1,
        actor,
        target: { id: account.id, displayName: displayName(account) },
        action: 'created',
        detail: `Alta con rol ${roleNames(account.roles)}.`,
        createdAt: account.createdAt,
      };
    });

  return {
    version: STATE_VERSION,
    accounts,
    audit,
    accessTokens: {},
    refreshTokens: {},
    nextUserId,
    nextAuditId: audit.length + 1,
  };
}

export class AuthMockBackend {
  private state: MockState = this.load();

  // ---------------------------------------------------------------- /auth

  // POST /auth/login — 5 intentos fallidos bloquean la cuenta 2 h (423 con
  // los minutos restantes); un bloqueo vencido se levanta solo al intentar.
  login(username: string, password: string): { accessToken: string; refreshToken: string; expiresIn: number; user: UserSummaryDto } {
    const account = this.findByEmail(username);
    if (!account) throw httpError(401, 'Usuario o contraseña inválidos.', 'INVALID_CREDENTIALS');

    this.releaseExpiredLock(account);

    if (account.status === 'LOCKED') {
      const text = account.lockedUntil
        ? `Usuario bloqueado por intentos fallidos. Intenta de nuevo en ${this.minutesUntil(account.lockedUntil)} minutos o contacta al administrador.`
        : 'Usuario bloqueado. Contacte al administrador.';
      throw httpError(423, text, 'ACCOUNT_LOCKED');
    }
    if (account.status === 'INACTIVE') {
      throw httpError(423, 'Tu cuenta está inactiva. Contacta al administrador.', 'ACCOUNT_LOCKED');
    }

    if (account.password !== password) {
      account.failedLoginAttempts += 1;
      if (account.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        account.status = 'LOCKED';
        account.lockedUntil = new Date(Date.now() + AUTO_LOCK_MS).toISOString();
        this.audit(null, account, 'locked', `Bloqueo automático tras ${account.failedLoginAttempts} intentos fallidos.`);
        this.save();
        throw httpError(
          423,
          `Usuario bloqueado por intentos fallidos. Intenta de nuevo en ${this.minutesUntil(account.lockedUntil)} minutos o contacta al administrador.`,
          'ACCOUNT_LOCKED',
        );
      }
      this.save();
      throw httpError(401, 'Usuario o contraseña inválidos.', 'INVALID_CREDENTIALS');
    }

    account.failedLoginAttempts = 0;
    account.lastLoginAt = new Date().toISOString();
    const pair = this.issueTokens(account);
    this.save();
    return { ...pair, user: this.summary(account) };
  }

  // POST /auth/refresh — rotación de un solo uso. 30 min sin actividad → 401
  // SESSION_IDLE_TIMEOUT (acuerdo con el backend).
  refresh(refreshToken: string): TokenPair {
    const token = this.state.refreshTokens[refreshToken];
    if (!token) throw httpError(401, 'Refresh token inválido.', 'INVALID_REFRESH_TOKEN');
    delete this.state.refreshTokens[refreshToken];

    if (mockSessionIdleMs() > MOCK_SESSION_IDLE_TIMEOUT_MS) {
      this.save();
      throw httpError(401, 'Sesion expirada por inactividad. Debe iniciar sesion de nuevo.', SESSION_IDLE_TIMEOUT_CODE);
    }

    const account = this.findById(token.userId);
    if (!account || account.status !== 'ACTIVE') {
      this.save();
      throw httpError(401, 'Usuario bloqueado o inactivo.', 'USER_LOCKED_OR_INACTIVE');
    }

    const pair = this.issueTokens(account);
    this.save();
    return pair;
  }

  // POST /auth/logout — revoca el refresh token presentado.
  logout(refreshToken: string): void {
    delete this.state.refreshTokens[refreshToken];
    this.save();
  }

  // GET /auth/me — permitido aunque la contraseña temporal siga pendiente.
  me(accessToken: string | null): UserSummaryDto {
    return this.summary(this.authenticate(accessToken, { allowPendingPassword: true }));
  }

  // POST /auth/change-password — 401 INVALID_CREDENTIALS si la actual no
  // coincide; 400 (sin código) si la nueva no cumple el mínimo.
  changePassword(accessToken: string | null, currentPassword: string, newPassword: string): void {
    const account = this.authenticate(accessToken, { allowPendingPassword: true });
    if (account.password !== currentPassword) {
      throw httpError(401, 'La contraseña actual es incorrecta.', 'INVALID_CREDENTIALS');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) throw httpError(400, 'La contraseña nueva es demasiado corta.');
    account.password = newPassword;
    account.mustChangePassword = false;
    account.temporaryPassword = null;
    this.save();
  }

  // --------------------------------------------------------------- /users

  listUsers(accessToken: string | null, params: UserListParams): UserListPage {
    this.authorize(accessToken, 'manage_users');
    const search = params.search?.trim().toLowerCase();
    const rows = this.activeAccounts().filter((a) => {
      if (search && !`${displayName(a)} ${a.email}`.toLowerCase().includes(search)) return false;
      if (params.role && !a.roles.includes(params.role)) return false;
      if (params.status && a.status !== params.status) return false;
      return true;
    });
    const page = params.page ?? 0;
    const size = params.size ?? 20;
    return {
      content: rows.slice(page * size, page * size + size).map((a) => this.summary(a)),
      page,
      size,
      totalElements: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / size)),
    };
  }

  getUser(accessToken: string | null, id: number): UserDetailDto {
    this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    this.releaseExpiredLock(account);
    return this.detail(account);
  }

  createUser(accessToken: string | null, request: CreateUserRequest): Omit<UserSummaryDto, 'phone' | 'status' | 'lastLoginAt' | 'emailVerified'> & { temporaryPassword: string } {
    const actor = this.authorize(accessToken, 'manage_users');
    const email = request.email.trim();
    if (this.findByEmail(email)) throw httpError(409, 'El correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED');
    this.validateRoles(request.roleIds);
    this.validateLocations(request.subsidiariaIds, request.ubicacionIds);
    if (request.status && request.status !== 'ACTIVE' && request.status !== 'INACTIVE') {
      throw httpError(400, 'Estado inválido.', 'INVALID_USER_STATUS');
    }

    const createdAt = new Date().toISOString();
    const temporaryPassword = temporaryPasswordFor(request.firstName, request.lastName, createdAt);
    const account: MockAccount = {
      id: this.state.nextUserId++,
      email,
      password: temporaryPassword,
      firstName: request.firstName.trim(),
      lastName: request.lastName.trim(),
      phone: request.phone,
      status: request.status ?? 'ACTIVE',
      roles: [...request.roleIds],
      permissions: defaultPermissions(request.roleIds),
      subsidiariaIds: [...request.subsidiariaIds],
      ubicacionIds: [...request.ubicacionIds],
      mustChangePassword: true,
      temporaryPassword,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      emailVerified: false,
      createdAt,
      birthDate: null,
      ssn: null,
      gender: null,
      address: { city: null, state: null, postalCode: null, street1: null, street2: null, interiorNumber: null, exteriorNumber: null },
      department: null,
      area: null,
      jobTitle: null,
      managerId: request.supervisorId,
      employeeCode: null,
      hireDate: null,
      contractEndDate: null,
      deleted: false,
    };
    this.state.accounts.push(account);
    this.audit(actor, account, 'created', `Alta con rol ${roleNames(account.roles)}.`);
    this.save();

    const { phone: _phone, status: _status, lastLoginAt: _last, emailVerified: _verified, ...summary } = this.summary(account);
    return { ...summary, temporaryPassword };
  }

  updateUser(accessToken: string | null, id: number, request: UpdateUserRequest): UserSummaryDto {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);

    if (request.email && request.email.toLowerCase() !== account.email.toLowerCase()) {
      if (this.findByEmail(request.email)) throw httpError(409, 'El correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED');
      account.email = request.email.trim();
    }
    if (request.firstName !== null) account.firstName = request.firstName;
    if (request.lastName !== null) account.lastName = request.lastName;
    if (request.phone !== null) account.phone = request.phone;
    if (request.birthDate !== null) account.birthDate = request.birthDate;
    if (request.ssn !== null) account.ssn = request.ssn;
    if (request.gender !== null) account.gender = request.gender;
    if (request.address !== null) account.address = { ...request.address };
    if (request.department !== null) account.department = request.department;
    if (request.area !== null) account.area = request.area;
    if (request.jobTitle !== null) account.jobTitle = request.jobTitle;
    if (request.managerId !== null) account.managerId = request.managerId;
    if (request.employeeCode !== null) account.employeeCode = request.employeeCode;
    if (request.hireDate !== null) account.hireDate = request.hireDate;
    if (request.contractEndDate !== null) account.contractEndDate = request.contractEndDate;
    this.audit(actor, account, 'updated', 'Datos del usuario actualizados.');

    const subsidiariaIds = request.subsidiariaIds ?? account.subsidiariaIds;
    const ubicacionIds = request.ubicacionIds ?? account.ubicacionIds;
    if (!sameItems(subsidiariaIds, account.subsidiariaIds) || !sameItems(ubicacionIds, account.ubicacionIds)) {
      this.validateLocations(subsidiariaIds, ubicacionIds);
      account.subsidiariaIds = [...subsidiariaIds];
      account.ubicacionIds = [...ubicacionIds];
      this.audit(actor, account, 'organization_updated', 'Subsidiarias y ubicaciones actualizadas.');
    }

    this.save();
    return this.summary(account);
  }

  // PATCH /users/{id}/status — `active` también levanta un bloqueo (intentos
  // a 0); `blocked` es un bloqueo manual que no vence solo.
  changeStatus(accessToken: string | null, id: number, status: string): UserSummaryDto {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    const next: BackendStatus | null =
      status === 'active' ? 'ACTIVE' : status === 'inactive' ? 'INACTIVE' : status === 'blocked' ? 'LOCKED' : null;
    if (!next) throw httpError(400, 'Estado inválido.', 'INVALID_USER_STATUS');

    const previous = account.status;
    account.status = next;
    account.lockedUntil = null;
    if (next === 'ACTIVE') account.failedLoginAttempts = 0;
    if (next !== 'ACTIVE') this.revokeSessions(account);
    this.audit(actor, account, 'status_changed', `Estado: ${STATUS_LABEL[previous]} → ${STATUS_LABEL[next]}.`);
    this.save();
    return this.summary(account);
  }

  unlockUser(accessToken: string | null, id: number): UserSummaryDto {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    account.status = 'ACTIVE';
    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    this.audit(actor, account, 'unlocked', 'Cuenta desbloqueada por un administrador.');
    this.save();
    return this.summary(account);
  }

  verifyEmail(accessToken: string | null, id: number): EmailVerificationResponse {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    account.emailVerified = true;
    this.audit(actor, account, 'email_verified', 'Correo verificado manualmente.');
    this.save();
    return { id: account.id, emailVerified: true };
  }

  // PATCH /users/{id}/roles — exige `manage_roles` (403
  // ROLE_ASSIGNMENT_FORBIDDEN). Cambiar el rol sin mandar permisos los
  // resetea a los defaults del rol nuevo.
  updateUserRoles(accessToken: string | null, id: number, request: UpdateUserRolesRequest): UserSummaryDto {
    const actor = this.authenticate(accessToken);
    if (!actor.permissions.includes('manage_roles')) {
      throw httpError(403, 'No tienes permiso para asignar roles.', 'ROLE_ASSIGNMENT_FORBIDDEN');
    }
    const account = this.requireUser(id);

    if (request.roleIds) {
      this.validateRoles(request.roleIds);
      if (!sameItems(request.roleIds, account.roles)) {
        const previous = roleNames(account.roles);
        account.roles = [...request.roleIds];
        this.audit(actor, account, 'role_changed', `Rol: ${previous} → ${roleNames(account.roles)}.`);
      }
    }

    const permissions = request.permissions ?? (request.roleIds ? defaultPermissions(account.roles) : account.permissions);
    const unknown = permissions.find((p) => !MOCK_PERMISSIONS.some((def) => def.code === p));
    if (unknown) throw httpError(400, `Permiso inválido: ${unknown}.`, 'INVALID_PERMISSION');
    if (!sameItems(permissions, account.permissions)) {
      account.permissions = [...permissions];
      this.audit(actor, account, 'permissions_changed', `Permisos: ${account.permissions.map((p) => MOCK_PERMISSIONS.find((d) => d.code === p)?.description ?? p).join(', ') || 'ninguno'}.`);
    }

    this.save();
    return this.summary(account);
  }

  closeSessions(accessToken: string | null, id: number): CloseSessionsResponse {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    const closed = this.revokeSessions(account);
    this.audit(actor, account, 'sessions_closed', `${closed} sesión(es) cerrada(s).`);
    this.save();
    return { id: account.id, activeSessions: 0 };
  }

  // POST /users/{id}/reset-password — vuelve a la contraseña temporal,
  // obliga a cambiarla y cierra sus sesiones.
  resetPassword(accessToken: string | null, id: number): ResetPasswordResponse {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    const temporaryPassword = temporaryPasswordFor(account.firstName, account.lastName, account.createdAt);
    account.password = temporaryPassword;
    account.temporaryPassword = temporaryPassword;
    account.mustChangePassword = true;
    this.revokeSessions(account);
    this.audit(actor, account, 'password_reset', 'Contraseña restablecida a la temporal.');
    this.save();
    return { id: account.id, temporaryPassword };
  }

  // DELETE /users/{id} — baja lógica; 409 CANNOT_DELETE_SELF.
  deleteUser(accessToken: string | null, id: number): DeleteUserResponse {
    const actor = this.authorize(accessToken, 'manage_users');
    const account = this.requireUser(id);
    if (account.id === actor.id) throw httpError(409, 'No puedes eliminar tu propia cuenta.', 'CANNOT_DELETE_SELF');
    account.deleted = true;
    this.revokeSessions(account);
    this.audit(actor, account, 'deleted', 'Baja lógica del usuario.');
    this.save();
    return { success: true, id: account.id };
  }

  // ---------------------------------------------- /roles, /permissions, audit

  listRoles(accessToken: string | null): RoleDto[] {
    this.authorizeAny(accessToken, ['manage_users', 'manage_roles']);
    return MOCK_ROLES.map((r) => ({ ...r, defaultPermissions: [...r.defaultPermissions] }));
  }

  listPermissions(accessToken: string | null): PermissionDto[] {
    this.authorizeAny(accessToken, ['manage_users', 'manage_roles']);
    return MOCK_PERMISSIONS.map((p) => ({ ...p }));
  }

  listAuditLog(accessToken: string | null, params: AuditLogParams): AuditLogPage {
    this.authorize(accessToken, 'view_audit_log');
    if (params.userId !== undefined && !this.state.accounts.some((a) => a.id === params.userId)) throw notFound();

    const search = params.search?.trim().toLowerCase();
    const rows = this.state.audit
      .filter((entry) => {
        if (params.userId !== undefined && entry.target.id !== params.userId) return false;
        if (params.action && entry.action !== params.action) return false;
        if (search) {
          const haystack = `${entry.actor?.displayName ?? 'Sistema'} ${entry.target.displayName} ${entry.detail ?? ''}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

    const page = params.page ?? 0;
    const size = params.size ?? 20;
    return {
      content: rows.slice(page * size, page * size + size).map((entry) => ({ ...entry })),
      page,
      size,
      totalElements: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / size)),
    };
  }

  // -------------------------------------------------------------- internos

  private authenticate(accessToken: string | null, opts: { allowPendingPassword?: boolean } = {}): MockAccount {
    const token = accessToken ? this.state.accessTokens[accessToken] : undefined;
    if (!token || token.expiresAt < Date.now()) throw httpError(401, 'Token inválido o expirado.');
    const account = this.findById(token.userId);
    if (!account) throw httpError(401, 'Token inválido o expirado.');
    if (account.mustChangePassword && !opts.allowPendingPassword) {
      throw httpError(403, 'Debes cambiar tu contraseña antes de continuar.', 'PASSWORD_CHANGE_REQUIRED');
    }
    return account;
  }

  private authorize(accessToken: string | null, permission: string): MockAccount {
    return this.authorizeAny(accessToken, [permission]);
  }

  private authorizeAny(accessToken: string | null, permissions: string[]): MockAccount {
    const account = this.authenticate(accessToken);
    if (!permissions.some((p) => account.permissions.includes(p))) throw forbidden();
    return account;
  }

  private issueTokens(account: MockAccount): TokenPair {
    const pair = issueMockTokenPair(account.email, ACCESS_TOKEN_TTL_S * 1000);
    this.state.accessTokens[pair.accessToken] = { userId: account.id, expiresAt: pair.accessTokenExpiresAt };
    this.state.refreshTokens[pair.refreshToken] = { userId: account.id, expiresAt: 0 };
    this.pruneExpiredAccessTokens();
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresIn: ACCESS_TOKEN_TTL_S };
  }

  // Revoca los refresh tokens del usuario (el accessToken ya emitido sigue
  // valiendo hasta que venza, igual que en el backend). Devuelve cuántas
  // sesiones se cerraron.
  private revokeSessions(account: MockAccount): number {
    let closed = 0;
    for (const [token, data] of Object.entries(this.state.refreshTokens)) {
      if (data.userId === account.id) {
        delete this.state.refreshTokens[token];
        closed++;
      }
    }
    return closed;
  }

  private activeSessions(account: MockAccount): number {
    return Object.values(this.state.refreshTokens).filter((t) => t.userId === account.id).length;
  }

  private pruneExpiredAccessTokens(): void {
    const now = Date.now();
    for (const [token, data] of Object.entries(this.state.accessTokens)) {
      if (data.expiresAt < now) delete this.state.accessTokens[token];
    }
  }

  private releaseExpiredLock(account: MockAccount): void {
    if (account.status === 'LOCKED' && account.lockedUntil && Date.parse(account.lockedUntil) <= Date.now()) {
      account.status = 'ACTIVE';
      account.failedLoginAttempts = 0;
      account.lockedUntil = null;
      this.audit(null, account, 'unlocked', 'Desbloqueo automático al vencer el bloqueo temporal.');
      this.save();
    }
  }

  private minutesUntil(iso: string): number {
    return Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  }

  private validateRoles(roleIds: readonly string[]): void {
    if (roleIds.length === 0 || roleIds.some((id) => !MOCK_ROLES.some((r) => r.code === id))) {
      throw httpError(400, 'Rol inválido.', 'INVALID_ROLE');
    }
  }

  private validateLocations(subsidiariaIds: readonly number[], ubicacionIds: readonly number[]): void {
    const valid = (ids: readonly number[], catalog: CatalogEntry[]) => ids.every((id) => catalog.some((c) => c.id === id));
    if (!valid(subsidiariaIds, MOCK_SUBSIDIARIAS) || !valid(ubicacionIds, MOCK_UBICACIONES)) {
      throw httpError(400, 'Subsidiaria o ubicación inválida.', 'INVALID_LOCATION');
    }
  }

  private audit(actor: MockAccount | null, target: MockAccount, action: string, detail: string): void {
    this.state.audit.push({
      id: this.state.nextAuditId++,
      actor: actor ? { id: actor.id, displayName: displayName(actor) } : null,
      target: { id: target.id, displayName: displayName(target) },
      action,
      detail,
      createdAt: new Date().toISOString(),
    });
  }

  private activeAccounts(): MockAccount[] {
    return this.state.accounts.filter((a) => !a.deleted).sort((a, b) => a.id - b.id);
  }

  private findByEmail(email: string): MockAccount | undefined {
    const needle = email.trim().toLowerCase();
    return this.state.accounts.find((a) => !a.deleted && a.email.toLowerCase() === needle);
  }

  private findById(id: number): MockAccount | undefined {
    return this.state.accounts.find((a) => !a.deleted && a.id === id);
  }

  private requireUser(id: number): MockAccount {
    const account = this.findById(id);
    if (!account) throw notFound();
    return account;
  }

  private catalogEntries(ids: readonly number[], catalog: CatalogEntry[]): CatalogEntry[] {
    return catalog.filter((c) => ids.includes(c.id)).map((c) => ({ ...c }));
  }

  private summary(account: MockAccount): UserSummaryDto {
    return {
      id: account.id,
      email: account.email,
      displayName: displayName(account),
      phone: account.phone,
      status: account.status,
      roles: [...account.roles],
      permissions: [...account.permissions],
      subsidiarias: this.catalogEntries(account.subsidiariaIds, MOCK_SUBSIDIARIAS),
      ubicaciones: this.catalogEntries(account.ubicacionIds, MOCK_UBICACIONES),
      mustChangePassword: account.mustChangePassword,
      lastLoginAt: account.lastLoginAt,
      emailVerified: account.emailVerified,
    };
  }

  private detail(account: MockAccount): UserDetailDto {
    const manager = account.managerId !== null ? this.findById(account.managerId) : undefined;
    return {
      ...this.summary(account),
      firstName: account.firstName,
      lastName: account.lastName,
      // Solo mientras siga pendiente de cambiarse (regla del backend).
      temporaryPassword: account.mustChangePassword ? account.temporaryPassword : null,
      failedLoginAttempts: account.failedLoginAttempts,
      activeSessions: this.activeSessions(account),
      lockedUntil: account.lockedUntil,
      createdAt: account.createdAt,
      birthDate: account.birthDate,
      ssn: account.ssn,
      gender: account.gender,
      address: { ...account.address },
      department: account.department,
      area: account.area,
      jobTitle: account.jobTitle,
      manager: manager ? { id: manager.id, displayName: displayName(manager) } : null,
      employeeCode: account.employeeCode,
      hireDate: account.hireDate,
      contractEndDate: account.contractEndDate,
    };
  }

  private load(): MockState {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockState;
        if (parsed.version === STATE_VERSION && Array.isArray(parsed.accounts)) return parsed;
      }
    } catch {
      // Estado corrupto o storage no disponible → se vuelve a sembrar.
    }
    return seedState();
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Sin storage el mock sigue funcionando en memoria.
    }
  }
}
