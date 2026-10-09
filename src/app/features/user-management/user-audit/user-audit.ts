import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { AUDIT_ACTION_LABEL, AuditAction, AuditLogEntry, auditActionLabel } from '../data/user-management.model';
import { AuditLogService } from '../data/audit-log.service';

type ActionFilter = 'all' | AuditAction;

const PAGE_SIZE = 15;

interface AuditQuery {
  search: string;
  action: ActionFilter;
  page: number; // 1-based (nz-table); el backend usa 0-based
}

/**
 * "Historial y auditoría de usuarios" — bitácora REAL del backend
 * (`GET /audit-log`, ver `AuditLogService`): búsqueda, filtro de acción y
 * paginación son del lado del servidor, no un filtro sobre un arreglo local.
 * Exige `view_audit_log` (la ruta lo evalúa con `permissionGuard`).
 */
@Component({
  selector: 'app-user-audit',
  imports: [CommonModule, FormsModule, RouterLink, NzPageHeaderModule, NzBreadCrumbModule, NzCardModule, NzTableModule, NzSelectModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-audit.html',
  styleUrl: './user-audit.scss',
})
export class UserAudit {
  private readonly audit = inject(AuditLogService);
  private readonly router = inject(Router);
  protected readonly auditActionLabel = auditActionLabel;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly query = signal<AuditQuery>({ search: '', action: 'all', page: 1 });
  protected readonly search = computed(() => this.query().search);
  protected readonly actionFilter = computed(() => this.query().action);
  protected readonly pageIndex = computed(() => this.query().page);

  protected readonly entries = signal<AuditLogEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly actionOptions: { value: ActionFilter; label: string }[] = [
    { value: 'all', label: 'Todas las acciones' },
    ...(Object.entries(AUDIT_ACTION_LABEL) as [AuditAction, string][]).map(([value, label]) => ({ value, label })),
  ];

  constructor() {
    // Una petición por cambio de filtro/página; `switchMap` descarta la respuesta
    // de una consulta vieja si ya se pidió otra, y el `debounceTime` evita una
    // petición por cada tecla al escribir en el buscador.
    toObservable(this.query)
      .pipe(
        debounceTime(300),
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap((q) =>
          this.audit
            .listAll({ search: q.search, action: q.action === 'all' ? undefined : q.action, page: q.page - 1, size: PAGE_SIZE })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          // El aviso (403 sin permiso, 5xx...) lo da `notifyBackendError`.
          this.failed.set(true);
          this.entries.set([]);
          this.total.set(0);
          return;
        }
        this.entries.set(result.entries);
        this.total.set(result.totalElements);
      });
  }

  // Flecha del nz-page-header: de vuelta a la pantalla padre (Administración de usuarios).
  protected onBack(): void {
    void this.router.navigateByUrl('/usuarios');
  }

  protected onSearchChange(value: string): void {
    this.query.update((q) => ({ ...q, search: value, page: 1 }));
  }

  protected onActionFilterChange(value: ActionFilter): void {
    this.query.update((q) => ({ ...q, action: value, page: 1 }));
  }

  protected onPageChange(page: number): void {
    this.query.update((q) => ({ ...q, page }));
  }
}
