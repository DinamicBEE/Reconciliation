import { Routes } from '@angular/router';
import { Shell } from './core/layout/shell/shell';
import { authGuard } from './features/auth/data/auth.guard';
import { mustChangePasswordGuard } from './features/auth/data/must-change-password.guard';
import { permissionGuard } from './features/auth/data/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    // Fuera de Shell (mismo criterio que /login) — ver change-password.scss.
    // `authGuard` (Shell) empuja para acá cuando hace falta; este guard es
    // la contraparte: exige que de verdad haga falta para poder entrar, y
    // saca a cualquiera que llegue sin la sesión debida.
    path: 'cambiar-password',
    canActivate: [mustChangePasswordGuard],
    loadComponent: () => import('./features/auth/change-password/change-password').then((m) => m.ChangePassword),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Redirect estático — si el usuario logeado no puede ver /dashboard,
      // el propio permissionGuard de esa ruta lo rebota a su homeRoute()
      // real (ver AccessControlService); no hace falta resolverlo aquí.
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { permission: 'view_dashboard' },
        loadComponent: () => import('./features/sales-dashboard/sales-dashboard').then((m) => m.SalesDashboard),
      },
      {
        path: 'conciliacion',
        canActivate: [permissionGuard],
        data: { permission: 'view_reconciliation' },
        loadComponent: () =>
          import('./features/reconciliation-dashboard/reconciliation-dashboard').then(
            (m) => m.ReconciliationDashboard,
          ),
      },
      {
        path: 'conciliacion/:tenderMedia/diferencias/:orderId',
        canActivate: [permissionGuard],
        data: { permission: 'view_reconciliation' },
        loadComponent: () =>
          import('./features/difference-management/difference-management').then((m) => m.DifferenceManagement),
      },
      {
        // Sin `data.permission` — el propio perfil es visible para
        // cualquier usuario autenticado, sin importar su rol.
        path: 'perfil',
        loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'usuarios',
        canActivate: [permissionGuard],
        data: { permission: 'manage_users' },
        loadComponent: () => import('./features/user-management/user-list/user-list').then((m) => m.UserList),
      },
      // 'auditoria' y 'nuevo' antes de ':userId' — si no, ':userId' las
      // captura primero y nunca se llega a estas dos rutas estáticas.
      {
        path: 'usuarios/auditoria',
        canActivate: [permissionGuard],
        data: { permission: 'manage_users' },
        loadComponent: () => import('./features/user-management/user-audit/user-audit').then((m) => m.UserAudit),
      },
      {
        path: 'usuarios/nuevo',
        canActivate: [permissionGuard],
        data: { permission: 'manage_users' },
        loadComponent: () => import('./features/user-management/user-detail/user-detail').then((m) => m.UserDetail),
      },
      {
        path: 'usuarios/:userId',
        canActivate: [permissionGuard],
        data: { permission: 'manage_users' },
        loadComponent: () => import('./features/user-management/user-detail/user-detail').then((m) => m.UserDetail),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
