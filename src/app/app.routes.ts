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
        loadComponent: () =>
          import('./features/reconciliation-dashboard/reconciliation-dashboard').then(
            (m) => m.ReconciliationDashboard,
          ),
      },
      {
        path: 'detalle/:tenderMedia',
        loadComponent: () => import('./features/tender-detail/tender-detail').then((m) => m.TenderDetail),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
