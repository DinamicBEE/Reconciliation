import { AppUser, AuditLogEntry } from './user-management.model';

// Incluye a 'admin' y 'analista' — los mismos dos usuarios demo de
// `features/auth/data/auth-mock.data.ts` — para que el módulo de
// administración se sienta parte de la misma app y no un dataset
// desconectado. El resto son personas ficticias para dar variedad realista
// de roles/estado/último acceso (incluyendo "nunca ha iniciado sesión").
export const MOCK_USERS: AppUser[] = [
  {
    id: 'u1',
    fullName: 'Administrador',
    email: 'admin@conciliacion.mx',
    roleId: 'admin',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports', 'manage_users', 'manage_roles', 'view_audit_log'],
    status: 'active',
    createdAt: '2025-01-10T09:00:00',
    lastAccessAt: '2026-08-27T09:14:00',
  },
  {
    id: 'u2',
    fullName: 'Analista de Conciliación',
    email: 'analista@conciliacion.mx',
    roleId: 'analista',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements'],
    status: 'active',
    createdAt: '2025-01-10T09:05:00',
    lastAccessAt: '2026-08-27T08:02:00',
  },
  {
    id: 'u3',
    fullName: 'Daniela Torres',
    email: 'daniela.torres@conciliacion.mx',
    roleId: 'supervisor',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports'],
    status: 'active',
    createdAt: '2025-03-02T10:00:00',
    lastAccessAt: '2026-08-26T18:40:00',
  },
  {
    id: 'u4',
    fullName: 'Jorge Ramírez',
    email: 'jorge.ramirez@conciliacion.mx',
    roleId: 'analista',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements'],
    status: 'active',
    createdAt: '2025-05-14T09:30:00',
    lastAccessAt: '2026-08-27T07:55:00',
  },
  {
    id: 'u5',
    fullName: 'Marina López',
    email: 'marina.lopez@conciliacion.mx',
    roleId: 'analista',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements'],
    status: 'inactive',
    createdAt: '2025-06-20T09:00:00',
    lastAccessAt: '2026-07-30T11:20:00',
  },
  {
    id: 'u6',
    fullName: 'Carlos Medina',
    email: 'carlos.medina@conciliacion.mx',
    roleId: 'auditor',
    // Un permiso extra sobre el default de "Auditor" — demuestra que el rol
    // fija un punto de partida, no un techo fijo (ver "Roles y permisos" en
    // user-detail).
    permissions: ['view_dashboard', 'view_reconciliation', 'view_audit_log', 'export_reports'],
    status: 'active',
    createdAt: '2025-09-01T09:00:00',
    lastAccessAt: '2026-08-20T10:00:00',
  },
  {
    id: 'u7',
    fullName: 'Sofía Hernández',
    email: 'sofia.hernandez@conciliacion.mx',
    roleId: 'analista',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements'],
    status: 'active',
    createdAt: '2026-08-24T15:20:00',
    lastAccessAt: null,
  },
  {
    id: 'u8',
    fullName: 'Luis Fernández',
    email: 'luis.fernandez@conciliacion.mx',
    roleId: 'supervisor',
    permissions: ['view_dashboard', 'view_reconciliation', 'manage_differences', 'import_settlements', 'export_reports'],
    status: 'inactive',
    createdAt: '2025-11-11T09:00:00',
    lastAccessAt: '2026-05-02T09:00:00',
  },
];

// Incluye una entrada para 'u9', un usuario ELIMINADO que ya no existe en
// MOCK_USERS — a propósito: el historial de auditoría debe sobrevivir a la
// eliminación de la cuenta que describe (ver
// UserManagementService.deleteUser, que nunca borra entradas de auditoría).
export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  { id: 'a1', timestamp: '2025-01-10T09:00:00', actorName: 'Sistema', targetUserId: 'u1', targetUserName: 'Administrador', action: 'created', detail: 'Usuario creado con rol Administrador.' },
  { id: 'a2', timestamp: '2025-01-10T09:05:00', actorName: 'Administrador', targetUserId: 'u2', targetUserName: 'Analista de Conciliación', action: 'created', detail: 'Usuario creado con rol Analista de Conciliación.' },
  { id: 'a3', timestamp: '2025-03-02T10:00:00', actorName: 'Administrador', targetUserId: 'u3', targetUserName: 'Daniela Torres', action: 'created', detail: 'Usuario creado con rol Analista de Conciliación.' },
  { id: 'a4', timestamp: '2025-04-01T09:00:00', actorName: 'Administrador', targetUserId: 'u9', targetUserName: 'Usuario de Pruebas', action: 'created', detail: 'Usuario creado con rol Analista de Conciliación.' },
  { id: 'a5', timestamp: '2025-04-20T09:00:00', actorName: 'Administrador', targetUserId: 'u9', targetUserName: 'Usuario de Pruebas', action: 'deleted', detail: 'Usuario eliminado del sistema (cuenta de pruebas).' },
  { id: 'a6', timestamp: '2025-05-14T09:30:00', actorName: 'Administrador', targetUserId: 'u4', targetUserName: 'Jorge Ramírez', action: 'created', detail: 'Usuario creado con rol Analista de Conciliación.' },
  { id: 'a7', timestamp: '2025-06-01T12:00:00', actorName: 'Administrador', targetUserId: 'u3', targetUserName: 'Daniela Torres', action: 'role_changed', detail: 'Rol cambiado de Analista de Conciliación a Supervisor.' },
  { id: 'a8', timestamp: '2025-06-20T09:00:00', actorName: 'Administrador', targetUserId: 'u5', targetUserName: 'Marina López', action: 'created', detail: 'Usuario creado con rol Analista de Conciliación.' },
  { id: 'a9', timestamp: '2025-09-01T09:00:00', actorName: 'Administrador', targetUserId: 'u6', targetUserName: 'Carlos Medina', action: 'created', detail: 'Usuario creado con rol Auditor (solo lectura).' },
  { id: 'a10', timestamp: '2025-09-15T09:00:00', actorName: 'Administrador', targetUserId: 'u6', targetUserName: 'Carlos Medina', action: 'permissions_changed', detail: 'Se otorgó el permiso adicional "Exportar reportes".' },
  { id: 'a11', timestamp: '2025-11-11T09:00:00', actorName: 'Administrador', targetUserId: 'u8', targetUserName: 'Luis Fernández', action: 'created', detail: 'Usuario creado con rol Supervisor.' },
  { id: 'a12', timestamp: '2026-02-01T09:00:00', actorName: 'Administrador', targetUserId: 'u1', targetUserName: 'Administrador', action: 'updated', detail: 'Se actualizó el correo de contacto.' },
  { id: 'a13', timestamp: '2026-05-03T09:00:00', actorName: 'Administrador', targetUserId: 'u8', targetUserName: 'Luis Fernández', action: 'deactivated', detail: 'Cuenta desactivada — colaborador dado de baja.' },
  { id: 'a14', timestamp: '2026-07-31T09:00:00', actorName: 'Administrador', targetUserId: 'u5', targetUserName: 'Marina López', action: 'deactivated', detail: 'Cuenta desactivada por inactividad prolongada.' },
  { id: 'a15', timestamp: '2026-08-10T16:45:00', actorName: 'Administrador', targetUserId: 'u4', targetUserName: 'Jorge Ramírez', action: 'password_reset', detail: 'Se generó una nueva contraseña temporal.' },
  { id: 'a16', timestamp: '2026-08-24T15:20:00', actorName: 'Administrador', targetUserId: 'u7', targetUserName: 'Sofía Hernández', action: 'created', detail: 'Usuario creado con rol Analista de Conciliación.' },
];
