import { Routes } from '@angular/router';
import { Shell } from './core/layout/shell/shell';
import { authGuard } from './features/auth/data/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/sales-dashboard/sales-dashboard').then((m) => m.SalesDashboard),
      },
      {
        path: 'conciliacion',
        loadComponent: () =>
          import('./features/reconciliation-dashboard/reconciliation-dashboard').then(
            (m) => m.ReconciliationDashboard,
          ),
      },
      {
        path: 'conciliacion/:tenderMedia/diferencias/:orderId',
        loadComponent: () =>
          import('./features/difference-management/difference-management').then((m) => m.DifferenceManagement),
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./features/user-management/user-list/user-list').then((m) => m.UserList),
      },
      // 'auditoria' y 'nuevo' antes de ':userId' — si no, ':userId' las
      // captura primero y nunca se llega a estas dos rutas estáticas.
      {
        path: 'usuarios/auditoria',
        loadComponent: () => import('./features/user-management/user-audit/user-audit').then((m) => m.UserAudit),
      },
      {
        path: 'usuarios/nuevo',
        loadComponent: () => import('./features/user-management/user-detail/user-detail').then((m) => m.UserDetail),
      },
      {
        path: 'usuarios/:userId',
        loadComponent: () => import('./features/user-management/user-detail/user-detail').then((m) => m.UserDetail),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
