import { ComponentFixture, TestBed } from '@angular/core/testing';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { of } from 'rxjs';
import { AuditEntriesPage, AuditLogService } from '../data/audit-log.service';
import { AuditLogEntry } from '../data/user-management.model';
import { UserAudit } from './user-audit';

const ENTRIES: AuditLogEntry[] = [
  {
    id: 2,
    timestamp: '2026-10-02T10:00:00',
    actorName: 'Ana Admin',
    targetBackendUserId: null,
    targetUserName: null,
    action: 'reconciliation_created',
    detail: 'Conciliación #50',
  },
  {
    id: 1,
    timestamp: '2026-10-01T10:00:00',
    actorName: 'Ana Admin',
    targetBackendUserId: 9,
    targetUserName: 'Beto Usuario',
    action: 'role_changed',
    detail: 'ADMIN → ALTAS',
  },
];

describe('UserAudit', () => {
  let fixture: ComponentFixture<UserAudit>;
  let listAll: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Fake timers: la consulta pasa por un debounce de 300 ms.
    vi.useFakeTimers();
    const result: AuditEntriesPage = { entries: ENTRIES, page: 0, size: 15, totalElements: 2 };
    listAll = vi.fn(() => of(result));

    await TestBed.configureTestingModule({
      imports: [UserAudit],
      providers: [provideNzI18n(es_ES), { provide: AuditLogService, useValue: { listAll } }],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAudit);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const rows = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent!.trim()),
    );

  it('pide la primera página de la bitácora global', () => {
    expect(listAll).toHaveBeenCalledWith({ search: '', action: undefined, page: 0, size: 15 });
  });

  it("una entrada sin usuario afectado muestra '—' y la acción 'Conciliación creada'", () => {
    const [first] = rows();

    expect(first[1]).toBe('—');
    expect(first[2]).toBe('Conciliación creada');
    expect(first[4]).toBe('Ana Admin');
  });

  it('una entrada sobre un usuario muestra su nombre', () => {
    expect(rows()[1][1]).toBe('Beto Usuario');
  });

  it("el filtro de acciones incluye 'Conciliación creada'", () => {
    const options = (fixture.componentInstance as unknown as { actionOptions: { value: string; label: string }[] })
      .actionOptions;

    expect(options).toContainEqual({ value: 'reconciliation_created', label: 'Conciliación creada' });
  });
});
