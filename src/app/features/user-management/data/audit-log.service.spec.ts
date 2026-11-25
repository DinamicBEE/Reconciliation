import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuditEntriesPage, AuditLogEntryDto, AuditLogPage, AuditLogService } from './audit-log.service';
import { AUDIT_ACTION_LABEL, auditActionLabel } from './user-management.model';

const ALL_URL = `${environment.apiUrl}/audit-log`;

function entry(overrides: Partial<AuditLogEntryDto> = {}): AuditLogEntryDto {
  return {
    id: 1,
    actor: { id: 7, displayName: 'Ana Admin' },
    target: { id: 9, displayName: 'Beto Usuario' },
    action: 'role_changed',
    detail: 'ADMIN → ALTAS',
    createdAt: '2026-10-01T15:30:00Z',
    ...overrides,
  };
}

function page(content: AuditLogEntryDto[]): AuditLogPage {
  return { content, page: 0, size: 20, totalElements: content.length, totalPages: 1 };
}

describe('AuditLogService', () => {
  let service: AuditLogService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuditLogService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Pide la bitácora global y responde con esas entradas.
  function listAll(content: AuditLogEntryDto[]): AuditEntriesPage {
    let result: AuditEntriesPage | undefined;
    service.listAll().subscribe((p) => (result = p));
    httpMock.expectOne((r) => r.url === ALL_URL).flush(page(content));
    return result!;
  }

  it('listAll pide GET /audit-log con página 0 y tamaño 20 por defecto', () => {
    service.listAll().subscribe();

    const req = httpMock.expectOne((r) => r.url === ALL_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush(page([]));
  });

  it('mapea una entrada sobre un usuario', () => {
    expect(listAll([entry()]).entries).toEqual([
      {
        id: 1,
        timestamp: '2026-10-01T15:30:00Z',
        actorName: 'Ana Admin',
        targetBackendUserId: 9,
        targetUserName: 'Beto Usuario',
        action: 'role_changed',
        detail: 'ADMIN → ALTAS',
      },
    ]);
  });

  it('con target null (acción que no es sobre un usuario) deja id y nombre del afectado en null', () => {
    const [mapped] = listAll([
      entry({ target: null, action: 'reconciliation_created', detail: 'Conciliación #50 (3 ventas)' }),
    ]).entries;

    expect(mapped.targetBackendUserId).toBeNull();
    expect(mapped.targetUserName).toBeNull();
    expect(mapped.actorName).toBe('Ana Admin');
    expect(mapped.action).toBe('reconciliation_created');
    expect(mapped.detail).toBe('Conciliación #50 (3 ventas)');
  });

  it('sin actor lo atribuye a "Sistema" y un detail null queda vacío', () => {
    const [mapped] = listAll([entry({ actor: null, detail: null, action: 'locked' })]).entries;

    expect(mapped.actorName).toBe('Sistema');
    expect(mapped.detail).toBe('');
  });

  it('listForUser también acepta target null', () => {
    let result: AuditEntriesPage | undefined;
    service.listForUser(7).subscribe((p) => (result = p));

    httpMock
      .expectOne((r) => r.url === `${environment.apiUrl}/users/7/audit-log`)
      .flush(page([entry({ target: null, action: 'reconciliation_created' })]));

    expect(result!.entries[0]).toMatchObject({ targetBackendUserId: null, targetUserName: null });
  });
});

describe('etiquetas de la bitácora', () => {
  it("reconciliation_created se muestra como 'Conciliación creada'", () => {
    expect(AUDIT_ACTION_LABEL.reconciliation_created).toBe('Conciliación creada');
    expect(auditActionLabel('reconciliation_created')).toBe('Conciliación creada');
  });

  it('una acción desconocida se muestra con su código tal cual', () => {
    expect(auditActionLabel('algo_nuevo')).toBe('algo_nuevo');
  });
});
