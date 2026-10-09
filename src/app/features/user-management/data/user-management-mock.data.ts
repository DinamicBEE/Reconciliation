import { AppUser, AppUserAddress } from './user-management.model';

// Semilla de MOCK_USERS SIN los campos de "Información personal
// adicional"/"Organización" agregados más tarde (fecha de nacimiento, SSN,
// género, dirección, ID de empleado, fecha de contratación/fin de
// contrato) — ver `extraProfileFields()` más abajo, que los completa por
// índice en vez de escribirlos 25 veces a mano. `mustChangePassword` tampoco
// se declara por usuario aquí — se defaultea a `false` para los 25 al
// construir `MOCK_USERS`, con UNA excepción a propósito (ver ese bloque).
// `subsidiariaIds`/`ubicacionIds`/`backendUserId` (catálogo real + puente al
// backend) tampoco — mismo criterio, ver el `.map()` de más abajo.
type MockUserSeed = Omit<
  AppUser,
  | 'birthDate'
  | 'ssn'
  | 'gender'
  | 'address'
  | 'employeeId'
  | 'hireDate'
  | 'contractEndDate'
  | 'mustChangePassword'
  | 'temporaryPassword'
  | 'subsidiariaIds'
  | 'ubicacionIds'
  | 'backendUserId'
  | 'lockedUntil'
>;

// Incluye a 'u0001', 'u0006', 'u0011' y 'u0018' — los mismos 4 usuarios demo
// (uno por rol) listados en login.html ("Cuentas de demo") — para que el
// módulo de administración se sienta parte de la misma app y no un dataset
// desconectado. Su `email` es además el puente hacia la sesión real (ver
// `UserManagementService.findUserByEmail`, `AuthService.AuthUser.appUserId`):
// solo se resuelven permisos/nombre/foto para cuentas cuyo email coincide
// con lo sembrado en coctel-del-mar. El resto son personas ficticias para dar variedad realista
// de roles/estado/último acceso (incluyendo "nunca ha iniciado sesión") y de
// los nuevos campos de seguridad/organización. `jobTitle`/`department`/
// `area` NO se reescribieron al redefinir los roles (los roles
// reales viven en el backend, `GET /roles`) — son datos organizacionales independientes del
// rol de acceso al sistema; un "Auditor de Procesos" puede perfectamente
// tener hoy el rol `admin`.
const MOCK_USERS_SEED: MockUserSeed[] = [
  {
    id: 'u0001',
    firstName: 'Administrador',
    lastName: 'Principal',
    email: 'admin@conciliacion.mx',
    phone: '+52 55 1234 5678',
    avatarUrl: 'https://i.pravatar.cc/128?img=13',
    status: 'active',
    createdAt: '2025-01-10T09:00:00',
    lastAccessAt: '2026-08-27T09:14:00',
    roleIds: ['ADMIN'],
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'manage_users', 'manage_roles', 'view_audit_log', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-27T09:40:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 2,
    department: 'Tecnología',
    area: 'Sistemas',
    jobTitle: 'Administrador de Plataforma',
    managerId: null,
  },
  {
    id: 'u0002',
    firstName: 'Ana',
    lastName: 'Martínez',
    email: 'analista@conciliacion.mx',
    phone: '+52 55 2345 6789',
    avatarUrl: 'https://i.pravatar.cc/128?img=47',
    status: 'active',
    createdAt: '2025-01-10T09:05:00',
    lastAccessAt: '2026-08-27T08:02:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-27T08:20:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 1,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0003',
    firstName: 'Daniela',
    lastName: 'Torres',
    email: 'daniela.torres@conciliacion.mx',
    phone: '+52 55 3456 7890',
    avatarUrl: 'https://i.pravatar.cc/128?img=44',
    status: 'active',
    createdAt: '2025-03-02T10:00:00',
    lastAccessAt: '2026-08-26T18:40:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-26T19:00:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Supervisor de Conciliación',
    managerId: 'u0001',
  },
  {
    id: 'u0004',
    firstName: 'Jorge',
    lastName: 'Ramírez',
    email: 'jorge.ramirez@conciliacion.mx',
    phone: '+52 55 4567 8901',
    avatarUrl: 'https://i.pravatar.cc/128?img=32',
    status: 'active',
    createdAt: '2025-05-14T09:30:00',
    lastAccessAt: '2026-08-27T07:55:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-27T08:10:00',
    failedLoginAttempts: 1,
    twoFactorEnabled: false,
    activeSessions: 1,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0005',
    firstName: 'Marina',
    lastName: 'López',
    email: 'marina.lopez@conciliacion.mx',
    phone: '+52 55 5678 9012',
    // Sin foto a propósito — junto con u0007, cubre el caso "sin avatarUrl"
    // (cae a iniciales + color, ver AppUser.avatarUrl).
    avatarUrl: null,
    status: 'blocked',
    createdAt: '2025-06-20T09:00:00',
    lastAccessAt: '2026-07-30T11:20:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-07-30T11:45:00',
    failedLoginAttempts: 3,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0006',
    firstName: 'Carlos',
    lastName: 'Medina',
    email: 'carlos.medina@conciliacion.mx',
    phone: '+52 55 6789 0123',
    avatarUrl: 'https://i.pravatar.cc/128?img=52',
    status: 'active',
    createdAt: '2025-09-01T09:00:00',
    lastAccessAt: '2026-08-20T10:00:00',
    roleIds: ['ALTAS'],
    permissions: ['manage_users', 'manage_roles', 'view_audit_log'],
    emailVerified: true,
    lastActivityAt: '2026-08-20T10:30:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Auditoría Interna',
    area: 'Cumplimiento',
    jobTitle: 'Auditor de Procesos',
    managerId: 'u0001',
  },
  {
    id: 'u0007',
    firstName: 'Sofía',
    lastName: 'Hernández',
    email: 'sofia.hernandez@conciliacion.mx',
    phone: '+52 55 7890 1234',
    avatarUrl: null,
    status: 'active',
    createdAt: '2026-08-24T15:20:00',
    lastAccessAt: null,
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: false,
    lastActivityAt: null,
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0008',
    firstName: 'Luis',
    lastName: 'Fernández',
    email: 'luis.fernandez@conciliacion.mx',
    phone: '+52 55 8901 2345',
    avatarUrl: 'https://i.pravatar.cc/128?img=68',
    status: 'inactive',
    createdAt: '2025-11-11T09:00:00',
    lastAccessAt: '2026-05-02T09:00:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-05-02T09:20:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Tesorería',
    jobTitle: 'Supervisor de Tesorería',
    managerId: 'u0001',
  },
  // --- u0010 en adelante: relleno para validar paginación (nzPageSize=10 en
  // user-list, ver user-list.html) — 25 usuarios en total dan 3 páginas
  // (10/10/5), la última parcial. Sin salto a 'u0009': ese id queda
  // reservado para el usuario eliminado del comentario de abajo.
  {
    id: 'u0010',
    firstName: 'Fernanda',
    lastName: 'Cruz',
    email: 'fernanda.cruz@conciliacion.mx',
    phone: '+52 55 9012 3456',
    avatarUrl: 'https://i.pravatar.cc/128?img=5',
    status: 'active',
    createdAt: '2025-02-03T09:00:00',
    lastAccessAt: '2026-08-25T10:05:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-25T10:30:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 1,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0011',
    firstName: 'Roberto',
    lastName: 'Sánchez',
    email: 'roberto.sanchez@conciliacion.mx',
    phone: '+52 55 0123 4567',
    avatarUrl: 'https://i.pravatar.cc/128?img=14',
    status: 'active',
    createdAt: '2025-02-10T09:00:00',
    lastAccessAt: '2026-08-24T16:20:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-24T16:45:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Operaciones',
    area: 'Tesorería',
    jobTitle: 'Supervisor de Tesorería',
    managerId: 'u0001',
  },
  {
    id: 'u0012',
    firstName: 'Patricia',
    lastName: 'Gómez',
    email: 'patricia.gomez@conciliacion.mx',
    phone: '+52 55 1122 3344',
    avatarUrl: 'https://i.pravatar.cc/128?img=25',
    status: 'active',
    createdAt: '2025-02-18T09:00:00',
    lastAccessAt: '2026-08-22T11:10:00',
    roleIds: ['ALTAS'],
    permissions: ['manage_users', 'manage_roles', 'view_audit_log'],
    emailVerified: true,
    lastActivityAt: '2026-08-22T11:30:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Auditoría Interna',
    area: 'Cumplimiento',
    jobTitle: 'Auditor de Procesos',
    managerId: 'u0001',
  },
  {
    id: 'u0013',
    firstName: 'Fernando',
    lastName: 'Castillo',
    email: 'fernando.castillo@conciliacion.mx',
    phone: '+52 55 2233 4455',
    avatarUrl: 'https://i.pravatar.cc/128?img=33',
    status: 'inactive',
    createdAt: '2025-03-05T09:00:00',
    lastAccessAt: '2026-03-15T09:40:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-03-15T10:00:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0014',
    firstName: 'Alejandra',
    lastName: 'Reyes',
    email: 'alejandra.reyes@conciliacion.mx',
    phone: '+52 55 3344 5566',
    avatarUrl: 'https://i.pravatar.cc/128?img=9',
    status: 'active',
    createdAt: '2026-08-20T14:00:00',
    lastAccessAt: null,
    roleIds: ['CONTABILIDAD'],
    permissions: ['view_dashboard', 'view_catalogs'],
    emailVerified: false,
    lastActivityAt: null,
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Contabilidad',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0015',
    firstName: 'Diego',
    lastName: 'Morales',
    email: 'diego.morales@conciliacion.mx',
    phone: '+52 55 4455 6677',
    avatarUrl: 'https://i.pravatar.cc/128?img=15',
    status: 'active',
    createdAt: '2025-04-02T09:00:00',
    lastAccessAt: '2026-08-21T08:50:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-21T09:10:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Tecnología',
    area: 'Sistemas',
    jobTitle: 'Supervisor de Conciliación',
    managerId: 'u0001',
  },
  {
    id: 'u0016',
    firstName: 'Valeria',
    lastName: 'Ortiz',
    email: 'valeria.ortiz@conciliacion.mx',
    phone: '+52 55 5566 7788',
    avatarUrl: 'https://i.pravatar.cc/128?img=29',
    status: 'blocked',
    createdAt: '2025-04-18T09:00:00',
    lastAccessAt: '2026-06-10T13:00:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-06-10T13:25:00',
    failedLoginAttempts: 5,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0017',
    firstName: 'Ricardo',
    lastName: 'Jiménez',
    email: 'ricardo.jimenez@conciliacion.mx',
    phone: '+52 55 6677 8899',
    avatarUrl: 'https://i.pravatar.cc/128?img=51',
    status: 'active',
    createdAt: '2025-05-06T09:00:00',
    lastAccessAt: '2026-08-19T15:15:00',
    roleIds: ['ALTAS'],
    permissions: ['manage_users', 'manage_roles', 'view_audit_log'],
    emailVerified: true,
    lastActivityAt: '2026-08-19T15:35:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Auditoría Interna',
    area: 'Cumplimiento',
    jobTitle: 'Auditor de Procesos',
    managerId: 'u0001',
  },
  {
    id: 'u0018',
    firstName: 'Gabriela',
    lastName: 'Vargas',
    email: 'gabriela.vargas@conciliacion.mx',
    phone: '+52 55 7788 9900',
    avatarUrl: 'https://i.pravatar.cc/128?img=41',
    status: 'active',
    createdAt: '2025-05-22T09:00:00',
    lastAccessAt: '2026-08-18T09:00:00',
    roleIds: ['CONTABILIDAD'],
    permissions: ['view_dashboard', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-18T09:20:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 1,
    department: 'Recursos Humanos',
    area: 'Contabilidad',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0019',
    firstName: 'Andrés',
    lastName: 'Molina',
    email: 'andres.molina@conciliacion.mx',
    phone: '+52 55 8899 0011',
    avatarUrl: 'https://i.pravatar.cc/128?img=59',
    status: 'inactive',
    createdAt: '2025-06-09T09:00:00',
    lastAccessAt: '2026-02-14T10:00:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-02-14T10:20:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 0,
    department: 'Tecnología',
    area: 'Sistemas',
    jobTitle: 'Supervisor de Conciliación',
    managerId: 'u0001',
  },
  {
    id: 'u0020',
    firstName: 'Karla',
    lastName: 'Delgado',
    email: 'karla.delgado@conciliacion.mx',
    phone: '+52 55 9900 1122',
    avatarUrl: 'https://i.pravatar.cc/128?img=20',
    status: 'active',
    createdAt: '2025-06-25T09:00:00',
    lastAccessAt: '2026-08-26T12:00:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-26T12:20:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 1,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0021',
    firstName: 'Emilio',
    lastName: 'Navarro',
    email: 'emilio.navarro@conciliacion.mx',
    phone: '+52 55 0011 2233',
    avatarUrl: 'https://i.pravatar.cc/128?img=60',
    status: 'active',
    createdAt: '2025-07-14T09:00:00',
    lastAccessAt: '2026-08-17T14:40:00',
    roleIds: ['ALTAS'],
    permissions: ['manage_users', 'manage_roles', 'view_audit_log'],
    emailVerified: true,
    lastActivityAt: '2026-08-17T15:00:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Auditoría Interna',
    area: 'Cumplimiento',
    jobTitle: 'Auditor de Procesos',
    managerId: 'u0001',
  },
  {
    id: 'u0022',
    firstName: 'Paola',
    lastName: 'Aguilar',
    email: 'paola.aguilar@conciliacion.mx',
    phone: '+52 55 1234 0011',
    avatarUrl: null,
    status: 'active',
    createdAt: '2026-08-22T11:00:00',
    lastAccessAt: null,
    roleIds: ['CONTABILIDAD'],
    permissions: ['view_dashboard', 'view_catalogs'],
    emailVerified: false,
    lastActivityAt: null,
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Recursos Humanos',
    area: 'Contabilidad',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0023',
    firstName: 'Héctor',
    lastName: 'Ibarra',
    email: 'hector.ibarra@conciliacion.mx',
    phone: '+52 55 2345 0022',
    avatarUrl: 'https://i.pravatar.cc/128?img=57',
    status: 'blocked',
    createdAt: '2025-08-11T09:00:00',
    lastAccessAt: '2026-05-28T08:30:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-05-28T08:55:00',
    failedLoginAttempts: 4,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0024',
    firstName: 'Renata',
    lastName: 'Campos',
    email: 'renata.campos@conciliacion.mx',
    phone: '+52 55 3456 0033',
    avatarUrl: 'https://i.pravatar.cc/128?img=45',
    status: 'active',
    createdAt: '2025-09-05T09:00:00',
    lastAccessAt: '2026-08-23T17:05:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-08-23T17:30:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Operaciones',
    area: 'Tesorería',
    jobTitle: 'Supervisor de Tesorería',
    managerId: 'u0001',
  },
  {
    id: 'u0025',
    firstName: 'Iván',
    lastName: 'Salazar',
    email: 'ivan.salazar@conciliacion.mx',
    phone: '+52 55 4567 0044',
    avatarUrl: 'https://i.pravatar.cc/128?img=53',
    status: 'inactive',
    createdAt: '2025-09-21T09:00:00',
    lastAccessAt: '2026-01-30T09:15:00',
    roleIds: ['TESORERIA'],
    permissions: ['view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-01-30T09:40:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Conciliación Bancaria',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0003',
  },
  {
    id: 'u0026',
    firstName: 'Camila',
    lastName: 'Rangel',
    email: 'camila.rangel@conciliacion.mx',
    phone: '+52 55 5678 0055',
    avatarUrl: 'https://i.pravatar.cc/128?img=35',
    status: 'active',
    createdAt: '2025-10-08T09:00:00',
    lastAccessAt: '2026-08-16T10:45:00',
    roleIds: ['ALTAS'],
    permissions: ['manage_users', 'manage_roles', 'view_audit_log'],
    emailVerified: true,
    lastActivityAt: '2026-08-16T11:05:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: true,
    activeSessions: 1,
    department: 'Auditoría Interna',
    area: 'Cumplimiento',
    jobTitle: 'Auditor de Procesos',
    managerId: 'u0001',
  },
  // Cuenta demo de COSTOS (login "Costos", ver login.html) — el único
  // usuario con ese rol, agregado junto con la pantalla de Catálogos
  // cargados, que es hoy lo único que ese rol puede ver. Sembrada también en
  // el backend real (ver BACKEND_USER_ID abajo y MASTER.md, "Actualización:
  // endpoints de administración de usuarios + manejo de errores").
  {
    id: 'u0027',
    firstName: 'Laura',
    lastName: 'Pineda',
    email: 'laura.pineda@conciliacion.mx',
    phone: '+52 55 5678 0066',
    avatarUrl: null,
    status: 'active',
    createdAt: '2026-09-01T09:00:00',
    lastAccessAt: '2026-09-25T12:10:00',
    roleIds: ['COSTOS'],
    permissions: ['view_catalogs'],
    emailVerified: true,
    lastActivityAt: '2026-09-25T12:30:00',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    activeSessions: 0,
    department: 'Finanzas',
    area: 'Contabilidad',
    jobTitle: 'Analista de Conciliación',
    managerId: 'u0001',
  },
];

// Catálogos pequeños solo para derivar los campos de `extraProfileFields` —
// rotan por índice (determinístico, no `Math.random`: el mismo usuario
// siempre obtiene los mismos valores entre renders/recargas), mismo
// criterio que `avatarTokensFor` (avatar-color.util.ts) para el color de
// avatar por hash de id.
const ADDRESS_POOL: { city: string; state: string; zipCode: string }[] = [
  { city: 'Ciudad de México', state: 'CDMX', zipCode: '03100' },
  { city: 'Guadalajara', state: 'Jalisco', zipCode: '44100' },
  { city: 'Monterrey', state: 'Nuevo León', zipCode: '64000' },
  { city: 'Puebla', state: 'Puebla', zipCode: '72000' },
  { city: 'Querétaro', state: 'Querétaro', zipCode: '76000' },
];
const STREET_POOL: string[] = ['Av. Reforma', 'Calle Juárez', 'Av. Insurgentes Sur', 'Calle Morelos', 'Av. Hidalgo'];
const GENDER_POOL: string[] = ['Femenino', 'Masculino', 'Prefiero no decir'];

// Completa los campos que se agregaron DESPUÉS de escribir los 25 usuarios
// de arriba (fecha de nacimiento, SSN, género, dirección, ID de empleado,
// fecha de contratación/fin de contrato) — derivados del índice en vez de
// escribirlos 25 veces a mano; sigue siendo una foto FIJA de datos (no se
// recalcula en cada acceso, se aplica una sola vez al construir
// `MOCK_USERS`, ver abajo).
function extraProfileFields(
  index: number,
  createdAt: string,
): Pick<AppUser, 'birthDate' | 'ssn' | 'gender' | 'address' | 'employeeId' | 'hireDate' | 'contractEndDate'> {
  const addr = ADDRESS_POOL[index % ADDRESS_POOL.length];
  const street = STREET_POOL[index % STREET_POOL.length];
  const birthYear = 1975 + (index % 25);
  const birthMonth = String(1 + (index % 12)).padStart(2, '0');
  const birthDay = String(1 + (index % 28)).padStart(2, '0');
  const address: AppUserAddress = {
    city: addr.city,
    state: addr.state,
    zipCode: addr.zipCode,
    street1: street,
    street2: null,
    exteriorNumber: `${100 + index * 3}`,
    interiorNumber: index % 3 === 0 ? `${1 + (index % 12)}` : null,
  };

  return {
    birthDate: `${birthYear}-${birthMonth}-${birthDay}`,
    ssn: `${300 + index}-${10 + (index % 90)}-${1000 + index}`,
    gender: GENDER_POOL[index % GENDER_POOL.length],
    address,
    employeeId: `EMP-${1000 + index}`,
    // La fecha de contratación coincide con la de creación de la cuenta —
    // en este mock no hay razón para que difieran (la cuenta se crea al
    // contratar a la persona).
    hireDate: createdAt.slice(0, 10),
    // La mayoría tiene contrato indefinido (null); 1 de cada 7 tiene fecha
    // de fin, para poder ver ambos casos en la UI.
    contractEndDate: index % 7 === 0 ? '2027-12-31' : null,
  };
}

// Puente de LOS 26 hacia su `app_user.id` REAL en el backend — ver docker
// exec directo contra Postgres al sembrarlos (MASTER.md, "Actualización:
// endpoints de administración de usuarios (CRUD real) + multi-subsidiaria/
// ubicación"). Ya no queda ninguno "solo mock": los 26 existen también en
// el backend real. Un usuario creado DESPUÉS de este seed (vía
// `UserManagementService.createUser`, que ahora llama a `POST /users`) no
// pasa por aquí — su `backendUserId` llega directo en la respuesta del
// alta, ver `AuthService.createUser`.
const BACKEND_USER_ID: Partial<Record<string, number>> = {
  u0001: 2, // admin@conciliacion.mx
  u0002: 7, // analista@conciliacion.mx
  u0003: 8, // daniela.torres@conciliacion.mx
  u0004: 9, // jorge.ramirez@conciliacion.mx
  u0005: 10, // marina.lopez@conciliacion.mx
  u0006: 3, // carlos.medina@conciliacion.mx
  u0007: 11, // sofia.hernandez@conciliacion.mx
  u0008: 12, // luis.fernandez@conciliacion.mx
  u0010: 13, // fernanda.cruz@conciliacion.mx
  u0011: 4, // roberto.sanchez@conciliacion.mx
  u0012: 14, // patricia.gomez@conciliacion.mx
  u0013: 15, // fernando.castillo@conciliacion.mx
  u0014: 16, // alejandra.reyes@conciliacion.mx
  u0015: 17, // diego.morales@conciliacion.mx
  u0016: 18, // valeria.ortiz@conciliacion.mx
  u0017: 19, // ricardo.jimenez@conciliacion.mx
  u0018: 5, // gabriela.vargas@conciliacion.mx
  u0019: 20, // andres.molina@conciliacion.mx
  u0020: 21, // karla.delgado@conciliacion.mx
  u0021: 22, // emilio.navarro@conciliacion.mx
  u0022: 23, // paola.aguilar@conciliacion.mx
  u0023: 24, // hector.ibarra@conciliacion.mx
  u0024: 25, // renata.campos@conciliacion.mx
  u0025: 26, // ivan.salazar@conciliacion.mx
  u0026: 27, // camila.rangel@conciliacion.mx
  u0027: 6, // laura.pineda@conciliacion.mx
};

export const MOCK_USERS: AppUser[] = MOCK_USERS_SEED.map((seed, index) => ({
  ...seed,
  ...extraProfileFields(index, seed.createdAt),
  // Siempre `false` en esta semilla local: quién debe cambiar su contraseña lo
  // decide el backend (simulado en esta rama, ver `auth-mock.data.ts`,
  // `MOCK_MUST_CHANGE_PASSWORD` — hoy Gabriela Vargas, la cuenta demo de
  // Contabilidad) y llega en el login/`GET /auth/me`/`GET /users`. Forzarlo
  // aquí lo "revivía" tras un F5 aunque ya se hubiera cambiado.
  mustChangePassword: false,
  // Valor mock de partida; para cualquier cuenta con `backendUserId`,
  // `user-detail` la sobreescribe con lo que devuelva `GET /users/{id}` en
  // caliente (ver `UserDetail`, efecto que llama `AuthService.getUserDetail`).
  temporaryPassword: null,
  // La única subsidiaria real sembrada hoy (id 1, "Conciliación Bancaria")
  // para los 26; ubicación varía por índice entre las 4 reales sembradas
  // (ids 1-4) — mismos valores con los que se sembró cada uno en el backend
  // real (ver el script de siembra, MASTER.md). Arreglo de UN elemento
  // porque así se sembraron; nada impide que `POST /users`
  // (`UserManagementService.createUser`) le asigne varias a alguien nuevo.
  subsidiariaIds: [1],
  ubicacionIds: [(index % 4) + 1],
  backendUserId: BACKEND_USER_ID[seed.id] ?? null,
  lockedUntil: null,
}));
