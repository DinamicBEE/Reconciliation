import { Routes } from '@angular/router';
import { Shell } from './core/layout/shell/shell';
import { authGuard } from './core/auth/auth.guard';
import { mustChangePasswordGuard } from './core/auth/must-change-password.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { confirmLeaveGuard } from './features/reconciliation-dashboard/reconciliation-process/confirm-leave.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    // Fuera de Shell, como /login. Ver docs/codigo/sesion-y-acceso.md#guards
    path: 'cambiar-password',
    canActivate: [mustChangePasswordGuard],
    loadComponent: () => import('./features/auth/change-password/change-password').then((m) => m.ChangePassword),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Sin permiso de /dashboard, su permissionGuard rebota a homeRoute().
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { permission: 'view_dashboard', title: 'Resumen de venta' },
        loadComponent: () => import('./features/sales-dashboard/sales-dashboard').then((m) => m.SalesDashboard),
      },
      {
        path: 'conciliacion',
        canActivate: [permissionGuard],
        data: { permission: 'view_reconciliation', title: 'Conciliación bancaria' },
        loadComponent: () =>
          import('./features/reconciliation-dashboard/reconciliation-dashboard').then(
            (m) => m.ReconciliationDashboard,
          ),
      },
      {
        // Comparativa POS vs. banco de una conciliación (`CON-0001`).
        path: 'conciliacion/:runId',
        canActivate: [permissionGuard],
        data: { permission: 'view_reconciliation', title: 'Comparativa POS vs. banco', parent: { label: 'Conciliación bancaria', path: '/conciliacion' } },
        loadComponent: () =>
          import('./features/reconciliation-dashboard/reconciliation-compare/reconciliation-compare').then(
            (m) => m.ReconciliationCompare,
          ),
      },
      {
        // Proceso en 4 pasos de una conciliación nueva ("Nueva conciliación").
        path: 'conciliacion/:runId/proceso',
        canActivate: [permissionGuard],
        // Pide confirmación al salir con un archivo cargado (cambios sin guardar).
        canDeactivate: [confirmLeaveGuard],
        data: { permission: 'import_settlements', title: 'Nueva conciliación', parent: { label: 'Conciliación bancaria', path: '/conciliacion' } },
        loadComponent: () =>
          import('./features/reconciliation-dashboard/reconciliation-process/reconciliation-process').then(
            (m) => m.ReconciliationProcess,
          ),
      },
      {
        path: 'conciliacion/:tenderMedia/diferencias/:orderId',
        canActivate: [permissionGuard],
        data: { permission: 'view_reconciliation', title: 'Gestión de diferencias', parent: { label: 'Conciliación bancaria', path: '/conciliacion' } },
        loadComponent: () =>
          import('./features/difference-management/difference-management').then((m) => m.DifferenceManagement),
      },
      {
        // Sin `data.permission`: solo lectura para cualquier usuario autenticado (CU14; el back no pide permiso).
        path: 'catalogos',
        loadComponent: () => import('./features/catalogs/catalogs').then((m) => m.Catalogs),
        data: { title: 'Catálogos cargados' },
      },
      {
        // Sin `data.permission`: visible para cualquier usuario autenticado.
        path: 'perfil',
        loadComponent: () => import('./features/user-management/profile/profile').then((m) => m.Profile),
        data: { title: 'Perfil' },
      },
      {
        // Por permiso, no por rol: un DEV limpio no tiene roles. Ver docs/codigo/configuracion-y-pais.md#rutas
        path: 'gestion-de-roles',
        canActivate: [permissionGuard],
        data: { permission: 'manage_roles', title: 'Roles y permisos' },
        loadComponent: () => import('./features/user-management/roles-permissions/roles-permissions').then((m) => m.RolesPermissions),
      },
      {
        path: 'gestion-de-roles/nuevo',
        canActivate: [permissionGuard],
        data: { permission: 'manage_roles', title: 'Nuevo rol', parent: { label: 'Roles y permisos', path: '/gestion-de-roles' } },
        loadComponent: () => import('./features/user-management/roles-permissions/role-create/role-create').then((m) => m.RoleCreate),
      },
      {
        // Mismo componente que el alta, en modo edición por `:code`.
        path: 'gestion-de-roles/:code',
        canActivate: [permissionGuard],
        data: { permission: 'manage_roles', title: 'Editar rol', parent: { label: 'Roles y permisos', path: '/gestion-de-roles' } },
        loadComponent: () => import('./features/user-management/roles-permissions/role-create/role-create').then((m) => m.RoleCreate),
      },
      {
        path: 'usuarios',
        canActivate: [permissionGuard],
        data: { permission: 'manage_users', title: 'Administración de usuarios' },
        loadComponent: () => import('./features/user-management/user-list/user-list').then((m) => m.UserList),
      },
      // 'auditoria' antes de ':userId', que si no la captura.
      {
        path: 'usuarios/auditoria',
        canActivate: [permissionGuard],
        // Permiso propio de la matriz 7.16, no `manage_users`.
        data: { permission: 'view_audit_log', title: 'Historial y auditoría de usuarios', parent: { label: 'Administración de usuarios', path: '/usuarios' } },
        loadComponent: () => import('./features/user-management/user-audit/user-audit').then((m) => m.UserAudit),
      },
      {
        path: 'usuarios/:userId',
        canActivate: [permissionGuard],
        data: { permission: 'manage_users', title: 'Usuario', parent: { label: 'Administración de usuarios', path: '/usuarios' } },
        loadComponent: () => import('./features/user-management/user-detail/user-detail').then((m) => m.UserDetail),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
