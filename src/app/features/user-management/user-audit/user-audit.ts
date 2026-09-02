import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AUDIT_ACTION_LABEL, AuditAction } from '../data/user-management.model';
import { UserManagementService } from '../data/user-management.service';

type ActionFilter = 'all' | AuditAction;

@Component({
  selector: 'app-user-audit',
  imports: [CommonModule, FormsModule, RouterLink, NzCardModule, NzTableModule, NzSelectModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-audit.html',
  styleUrl: './user-audit.scss',
})
export class UserAudit {
  protected readonly service = inject(UserManagementService);
  protected readonly auditActionLabel = AUDIT_ACTION_LABEL;

  protected readonly search = signal('');
  protected readonly actionFilter = signal<ActionFilter>('all');

  protected readonly actionOptions: { value: ActionFilter; label: string }[] = [
    { value: 'all', label: 'Todas las acciones' },
    ...(Object.entries(AUDIT_ACTION_LABEL) as [AuditAction, string][]).map(([value, label]) => ({ value, label })),
  ];

  // Log completo del módulo (todos los usuarios, existan o no hoy) — a
  // diferencia de UserDetail.userAudit, que solo filtra por un targetUserId.
  protected readonly filteredLog = computed(() => {
    const term = this.search().trim().toLowerCase();
    const action = this.actionFilter();

    return this.service.recentAuditLog().filter((entry) => {
      if (action !== 'all' && entry.action !== action) return false;
      if (term && !entry.targetUserName.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  protected onSearchChange(value: string): void {
    this.search.set(value);
  }

  protected onActionFilterChange(value: ActionFilter): void {
    this.actionFilter.set(value);
  }
}
