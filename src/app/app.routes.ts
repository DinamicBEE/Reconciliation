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
    ],
  },
  { path: '**', redirectTo: 'login' },
];
