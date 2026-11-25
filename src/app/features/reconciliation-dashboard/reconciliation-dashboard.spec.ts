import { formatNumber } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { LOCALE_ID, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ModalOptions, NzModalService } from 'ng-zorro-antd/modal';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AccessControlService } from '../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../core/country/active-country';
import { CatalogService } from '../../core/services/catalog.service';
import { OrganizationCatalogService, UbicacionCatalogEntry } from '../../core/services/organization-catalog.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';
import { SalesCatalogService } from '../sales-dashboard/data/sales-catalog.service';
import {
  ReconciliationApiService,
  ReconciliationDto,
  ReconciliationListPage,
} from './data/reconciliation-api.service';
import { ReconciliationRun } from './data/reconciliation-run.model';
import { ReconciliationRunsStore } from './data/reconciliation-runs.store';
import { ReconciliationDashboard } from './reconciliation-dashboard';

function dto(id: number, overrides: Partial<ReconciliationDto> = {}): ReconciliationDto {
  return {
    id,
    createdAt: '2026-10-01',
    company: { id: 1, name: 'Cóctel del Mar' },
    store: { id: 12, name: 'Centro' },
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    status: { id: 1, code: 'por_conciliar', description: 'Por conciliar' },
    comments: null,
    salesCount: 1234,
    ...overrides,
  };
}

const PAGE: ReconciliationListPage = {
  data: [
    dto(7, { comments: 'En espera del extracto bancario.' }),
    dto(3, { status: { id: 2, code: 'conciliado', description: 'Conciliado' }, salesCount: 0 }),
  ],
  total: 2,
  page: 1,
  pageSize: 10,
};

const COMPANIES: CatalogEntry[] = [
  { id: 1, nombre: 'Cóctel del Mar' },
  { id: 2, nombre: 'Otra Empresa' },
];

// Tiendas de la sesión: la 12 pertenece a la empresa 1 y la 13 no aparece en la relación cargada.
const SESSION_STORES: CatalogEntry[] = [
  { id: 10, nombre: 'Chapinero' },
  { id: 11, nombre: 'Usaquén' },
  { id: 12, nombre: 'Centro' },
  { id: 13, nombre: 'Sin relación' },
];

const RELATION: UbicacionCatalogEntry[] = [
  { id: 10, nombre: 'Chapinero', subsidiariaId: 1 },
  { id: 11, nombre: 'Usaquén', subsidiariaId: 2 },
  { id: 12, nombre: 'Centro', subsidiariaId: 1 },
  { id: 99, nombre: 'Fuera de la sesión', subsidiariaId: 1 },
];

interface Internals {
  companyOptions(): { value: number; label: string }[];
  storeOptions(): { value: number; label: string }[];
  newModalOpen(): boolean;
  newCompanyId: WritableSignal<number | null>;
  newStoreId: WritableSignal<number | null>;
  newPeriod: WritableSignal<[Date, Date] | null>;
  creating(): boolean;
  canStart(): boolean;
  openNewModal(): void;
  closeNewModal(): void;
  onCompanyChange(id: number | null): void;
  onNewPeriodChange(value: [Date, Date] | null): void;
  startReconciliation(): void;
  onDesconciliarClick(run: ReconciliationRun): void;
}

describe('ReconciliationDashboard · modal "Nueva conciliación"', () => {
  let fixture: ComponentFixture<ReconciliationDashboard>;
  let cmp: Internals;
  let organizationStores: WritableSignal<readonly UbicacionCatalogEntry[]>;
  let ensureLoaded: ReturnType<typeof vi.fn>;
  let permissions: string[];
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let listResponse: () => Observable<ReconciliationListPage>;
  let message: { success: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };

  // TestBed y componente con los dobles actuales (permisos, respuesta de la lista).
  async function mount(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReconciliationDashboard],
      providers: [
        provideRouter([]),
        provideCountry(ACTIVE_COUNTRY),
        provideNzI18n(es_ES),
        provideNzDateFnsAdapter(),
        {
          provide: CatalogService,
          useValue: {
            subsidiarias: signal(COMPANIES),
            ubicaciones: signal(SESSION_STORES),
            findSubsidiaria: (id: number | null) => COMPANIES.find((c) => c.id === id) ?? null,
            findUbicacion: (id: number | null) => SESSION_STORES.find((s) => s.id === id) ?? null,
          },
        },
        { provide: OrganizationCatalogService, useValue: { ubicaciones: organizationStores, ensureLoaded } },
        { provide: AccessControlService, useValue: { hasPermission: (key: string) => permissions.includes(key) } },
        { provide: ReconciliationApiService, useValue: api },
        { provide: SalesCatalogService, useValue: { reconciliationStatuses: signal([]), ensureLoaded: vi.fn() } },
        { provide: NzMessageService, useValue: message },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconciliationDashboard);
    cmp = fixture.componentInstance as unknown as Internals;
    await settle();
  }

  // Deja que el resource de la lista publique su valor y repinta.
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const buttonLabels = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map((b) => b.textContent?.trim());

  beforeEach(async () => {
    organizationStores = signal<readonly UbicacionCatalogEntry[]>(RELATION);
    ensureLoaded = vi.fn();
    permissions = ['create_reconciliation', 'import_settlements'];
    listResponse = () => of(PAGE);
    api = { list: vi.fn(() => listResponse()), create: vi.fn() };
    message = { success: vi.fn(), create: vi.fn() };

    await mount();
  });

  const period = (): [Date, Date] => [new Date(2026, 8, 1), new Date(2026, 8, 15)];
  const labels = () => cmp.storeOptions().map((o) => o.label);

  it('las empresas salen de las subsidiarias de la sesión', () => {
    expect(cmp.companyOptions()).toEqual([
      { value: 1, label: 'Cóctel del Mar' },
      { value: 2, label: 'Otra Empresa' },
    ]);
  });

  describe('storeOptions', () => {
    it('sin empresa elegida está vacío', () => {
      expect(cmp.newCompanyId()).toBeNull();
      expect(cmp.storeOptions()).toEqual([]);
    });

    it('con la relación cargada filtra las tiendas de la sesión por la empresa elegida', () => {
      cmp.onCompanyChange(1);

      expect(cmp.storeOptions()).toEqual([
        { value: 10, label: 'Chapinero' },
        { value: 12, label: 'Centro' },
      ]);

      cmp.onCompanyChange(2);

      expect(cmp.storeOptions()).toEqual([{ value: 11, label: 'Usaquén' }]);
    });

    it('no ofrece tiendas que están en la relación pero no en la sesión', () => {
      cmp.onCompanyChange(1);

      expect(labels()).not.toContain('Fuera de la sesión');
    });

    it('con la relación cargada excluye las tiendas de la sesión que no figuran en ella', () => {
      cmp.onCompanyChange(1);
      cmp.onCompanyChange(2);

      expect(labels()).not.toContain('Sin relación');
    });

    it('una empresa sin tiendas en la relación deja la lista vacía', () => {
      organizationStores.set([{ id: 10, nombre: 'Chapinero', subsidiariaId: 1 }]);
      cmp.onCompanyChange(2);

      expect(cmp.storeOptions()).toEqual([]);
    });

    it('sin la relación cargada (lista vacía) muestra todas las tiendas de la sesión', () => {
      organizationStores.set([]);

      cmp.onCompanyChange(1);

      expect(labels()).toEqual(['Chapinero', 'Usaquén', 'Centro', 'Sin relación']);
    });

    it('sin relación cargada y sin empresa sigue vacío', () => {
      organizationStores.set([]);

      expect(cmp.storeOptions()).toEqual([]);
    });

    it('reacciona cuando la relación termina de cargar', () => {
      organizationStores.set([]);
      cmp.onCompanyChange(1);
      expect(labels()).toHaveLength(4);

      organizationStores.set(RELATION);

      expect(labels()).toEqual(['Chapinero', 'Centro']);
    });
  });

  describe('onCompanyChange', () => {
    it('guarda la empresa elegida', () => {
      cmp.onCompanyChange(2);

      expect(cmp.newCompanyId()).toBe(2);
    });

    it('descarta la tienda elegida al cambiar de empresa', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);

      cmp.onCompanyChange(2);

      expect(cmp.newStoreId()).toBeNull();
    });

    it('descarta la tienda también al volver a elegir la misma empresa', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);

      cmp.onCompanyChange(1);

      expect(cmp.newStoreId()).toBeNull();
    });

    it('limpiar la empresa (null) vacía las tiendas y descarta la tienda', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);

      cmp.onCompanyChange(null);

      expect(cmp.newCompanyId()).toBeNull();
      expect(cmp.newStoreId()).toBeNull();
      expect(cmp.storeOptions()).toEqual([]);
    });
  });

  describe('canStart', () => {
    it('requiere empresa, tienda y periodo (sin banco)', () => {
      expect(cmp.canStart()).toBe(false);

      cmp.onCompanyChange(1);
      expect(cmp.canStart()).toBe(false);

      cmp.newStoreId.set(10);
      expect(cmp.canStart()).toBe(false);

      cmp.onNewPeriodChange(period());
      expect(cmp.canStart()).toBe(true);
    });

    it('sin periodo no se puede iniciar aunque haya empresa y tienda', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);

      expect(cmp.canStart()).toBe(false);
    });

    it('cambiar de empresa vuelve a bloquear el inicio hasta elegir otra tienda', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);
      cmp.onNewPeriodChange(period());
      expect(cmp.canStart()).toBe(true);

      cmp.onCompanyChange(2);

      expect(cmp.canStart()).toBe(false);
    });

    it('la "x" del range-picker (huecos) deja el periodo en null', () => {
      cmp.onNewPeriodChange(period());
      cmp.onNewPeriodChange([undefined, undefined] as unknown as [Date, Date]);

      expect(cmp.newPeriod()).toBeNull();
    });
  });

  describe('abrir y cerrar', () => {
    it('al abrir pide la relación de tiendas con ensureLoaded y abre el modal', () => {
      expect(ensureLoaded).not.toHaveBeenCalled();

      cmp.openNewModal();

      expect(ensureLoaded).toHaveBeenCalledTimes(1);
      expect(cmp.newModalOpen()).toBe(true);
    });

    it('cada apertura vuelve a llamar a ensureLoaded (reintenta si falló)', () => {
      cmp.openNewModal();
      cmp.closeNewModal();
      cmp.openNewModal();

      expect(ensureLoaded).toHaveBeenCalledTimes(2);
    });

    it('el botón "Nueva conciliación" abre el modal si hay permiso', () => {
      const trigger = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Nueva conciliación'),
      );

      trigger!.click();

      expect(ensureLoaded).toHaveBeenCalledTimes(1);
      expect(cmp.newModalOpen()).toBe(true);
    });

    it('sin el permiso create_reconciliation no hay botón para abrirlo, aunque tenga import_settlements', async () => {
      TestBed.resetTestingModule();
      permissions = ['import_settlements'];

      await mount();

      expect(buttonLabels()).not.toContain('Nueva conciliación');
    });

    it('con create_reconciliation hay botón aunque no tenga import_settlements', async () => {
      TestBed.resetTestingModule();
      permissions = ['create_reconciliation'];

      await mount();

      expect(buttonLabels()).toContain('Nueva conciliación');
    });

    it('cerrar descarta empresa, tienda y periodo', () => {
      cmp.openNewModal();
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);
      cmp.onNewPeriodChange(period());

      cmp.closeNewModal();

      expect(cmp.newModalOpen()).toBe(false);
      expect(cmp.newCompanyId()).toBeNull();
      expect(cmp.newStoreId()).toBeNull();
      expect(cmp.newPeriod()).toBeNull();
      expect(cmp.storeOptions()).toEqual([]);
    });

    it('el modal pide Empresa, Tienda y Periodo: sin select de banco ni comentarios', () => {
      cmp.openNewModal();
      fixture.detectChanges();

      const fieldLabels = Array.from(document.body.querySelectorAll('.new-reco__label')).map((l) => l.textContent?.trim());
      expect(fieldLabels).toEqual(['Empresa', 'Tienda', 'Periodo']);
      expect(document.body.querySelector('#new-reco-bank')).toBeNull();
      expect(document.body.querySelector('#new-reco-comments')).toBeNull();

      cmp.closeNewModal();
      fixture.detectChanges();
    });
  });

  describe('select de tienda', () => {
    const storeSelect = () => document.body.querySelector<HTMLElement>('#new-reco-store');

    it('está deshabilitado sin empresa y se habilita al elegirla', () => {
      cmp.openNewModal();
      fixture.detectChanges();

      expect(storeSelect()).not.toBeNull();
      expect(storeSelect()!.classList.contains('ant-select-disabled')).toBe(true);
      expect(storeSelect()!.textContent).toContain('Selecciona primero una empresa');

      cmp.onCompanyChange(1);
      fixture.detectChanges();

      expect(storeSelect()!.classList.contains('ant-select-disabled')).toBe(false);
      expect(storeSelect()!.textContent).toContain('Selecciona una tienda');
    });

    afterEach(() => {
      cmp.closeNewModal();
      fixture.detectChanges();
    });
  });

  describe('startReconciliation', () => {
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    });

    it('no hace nada si falta empresa, tienda o periodo', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);

      cmp.startReconciliation();

      expect(navigate).not.toHaveBeenCalled();
    });

    // Modal con empresa 1, tienda 12 y el periodo del 1 al 15 de septiembre.
    function fillForm(): void {
      cmp.openNewModal();
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(12);
      cmp.onNewPeriodChange(period());
    }

    it('no llama al backend si falta el periodo', () => {
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(10);

      cmp.startReconciliation();

      expect(api.create).not.toHaveBeenCalled();
    });

    it('manda POST solo con la tienda y el periodo en yyyy-MM-dd (sin comments)', () => {
      api.create.mockReturnValue(of(dto(50)));
      fillForm();

      cmp.startReconciliation();

      expect(api.create).toHaveBeenCalledExactlyOnceWith({ store: 12, periodStart: '2026-09-01', periodEnd: '2026-09-15' });
    });

    it('en éxito guarda la conciliación creada en el store para el proceso', () => {
      api.create.mockReturnValue(of(dto(50)));
      fillForm();

      cmp.startReconciliation();

      expect(TestBed.inject(ReconciliationRunsStore).find('50')).toMatchObject({ id: '50', code: 'CON-0050' });
    });

    it('en éxito cierra el modal, recarga la tabla, avisa y navega al proceso', async () => {
      api.create.mockReturnValue(of(dto(50, { salesCount: 3 })));
      fillForm();
      const listCalls = api.list.mock.calls.length;

      cmp.startReconciliation();
      await settle();

      expect(cmp.newModalOpen()).toBe(false);
      expect(cmp.newCompanyId()).toBeNull();
      expect(cmp.newStoreId()).toBeNull();
      expect(cmp.creating()).toBe(false);
      expect(api.list.mock.calls.length).toBe(listCalls + 1);
      expect(message.success).toHaveBeenCalledWith('Conciliación CON-0050 creada con 3 ventas.');
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/conciliacion', '50', 'proceso']);
    });

    it('con una sola venta usa el singular', () => {
      api.create.mockReturnValue(of(dto(51, { salesCount: 1 })));
      fillForm();

      cmp.startReconciliation();

      expect(message.success).toHaveBeenCalledWith('Conciliación CON-0051 creada con 1 venta.');
    });

    it('el aviso usa el código que manda el backend', () => {
      api.create.mockReturnValue(of(dto(52, { code: 'CON-0099', salesCount: 2 })));
      fillForm();

      cmp.startReconciliation();

      expect(message.success).toHaveBeenCalledWith('Conciliación CON-0099 creada con 2 ventas.');
    });

    it('sin import_settlements crea y avisa, pero se queda en la tabla', () => {
      permissions = ['create_reconciliation'];
      api.create.mockReturnValue(of(dto(50)));
      fillForm();

      cmp.startReconciliation();

      expect(message.success).toHaveBeenCalledTimes(1);
      expect(cmp.newModalOpen()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('mientras espera al backend está "creando": no se puede iniciar otra vez ni cerrar el modal', () => {
      const pending = new Subject<ReconciliationDto>();
      api.create.mockReturnValue(pending);
      fillForm();

      cmp.startReconciliation();

      expect(cmp.creating()).toBe(true);
      expect(cmp.canStart()).toBe(false);
      cmp.startReconciliation();
      expect(api.create).toHaveBeenCalledTimes(1);
      cmp.closeNewModal();
      expect(cmp.newModalOpen()).toBe(true);

      pending.next(dto(50));
      pending.complete();

      expect(cmp.creating()).toBe(false);
      expect(cmp.newModalOpen()).toBe(false);
    });

    it('un 409 muestra la advertencia del backend y deja el modal abierto con los datos', () => {
      api.create.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'No hay ventas en el periodo.' } })),
      );
      fillForm();
      const listCalls = api.list.mock.calls.length;

      cmp.startReconciliation();

      expect(message.create).toHaveBeenCalledWith('warning', 'No hay ventas en el periodo.', { nzDuration: 8000 });
      expect(message.success).not.toHaveBeenCalled();
      expect(cmp.creating()).toBe(false);
      expect(cmp.newModalOpen()).toBe(true);
      expect(cmp.newStoreId()).toBe(12);
      expect(cmp.canStart()).toBe(true);
      expect(api.list.mock.calls.length).toBe(listCalls);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('un error sin detalle muestra el error genérico', () => {
      api.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      fillForm();

      cmp.startReconciliation();

      expect(message.create).toHaveBeenCalledWith('error', 'No se pudo crear la conciliación. Intenta de nuevo.', {
        nzDuration: 8000,
      });
      expect(cmp.newModalOpen()).toBe(true);
    });
  });

  describe('Desconciliar', () => {
    const run = (overrides: Partial<ReconciliationRun> = {}): ReconciliationRun => ({
      id: '3',
      code: 'CON-0003',
      createdAt: '2026-10-01',
      companyName: 'Cóctel del Mar',
      storeName: 'Centro',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
      status: 'conciliado',
      comments: '',
      salesCount: 0,
      ...overrides,
    });
    let confirm: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      confirm = vi.spyOn(fixture.debugElement.injector.get(NzModalService), 'confirm').mockReturnValue(undefined as never);
    });

    const lastOptions = () => confirm.mock.calls.at(-1)![0] as ModalOptions;

    it('pide confirmación nombrando la conciliación por su código, tienda y periodo', () => {
      cmp.onDesconciliarClick(run());

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(lastOptions().nzContent).toBe(
        '¿Desconciliar la conciliación <b>CON-0003</b> de <b>Centro</b> (01/09/2026 – 15/09/2026)? Pasará a "Desconciliado".',
      );
    });

    it('al aceptar la marca desconciliada y avisa con su código', () => {
      cmp.onDesconciliarClick(run());

      (lastOptions().nzOnOk as () => void)();

      expect(message.success).toHaveBeenCalledWith('La conciliación CON-0003 se marcó como desconciliada.');
      expect(TestBed.inject(ReconciliationRunsStore).withLocalStatus(run()).status).toBe('desconciliado');
    });

    it('una conciliación que no está conciliada no abre la confirmación', () => {
      cmp.onDesconciliarClick(run({ status: 'pendiente' }));

      expect(confirm).not.toHaveBeenCalled();
    });
  });
});

describe('ReconciliationDashboard · tabla', () => {
  let fixture: ComponentFixture<ReconciliationDashboard>;
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let listResponse: () => Observable<ReconciliationListPage>;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    listResponse = () => of(PAGE);
    api = { list: vi.fn(() => listResponse()), create: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ReconciliationDashboard],
      providers: [
        provideRouter([]),
        provideCountry(ACTIVE_COUNTRY),
        provideNzI18n(es_ES),
        provideNzDateFnsAdapter(),
        { provide: CatalogService, useValue: { subsidiarias: signal(COMPANIES), ubicaciones: signal(SESSION_STORES) } },
        { provide: OrganizationCatalogService, useValue: { ubicaciones: signal([]), ensureLoaded: vi.fn() } },
        { provide: AccessControlService, useValue: { hasPermission: () => true } },
        { provide: ReconciliationApiService, useValue: api },
        { provide: SalesCatalogService, useValue: { reconciliationStatuses: signal([]), ensureLoaded: vi.fn() } },
        { provide: NzMessageService, useValue: { success: vi.fn(), create: vi.fn() } },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ReconciliationDashboard);
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  const headers = (el: HTMLElement) => Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent!.trim());
  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr.clickable-row'));
  const reintentar = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reintentar'));

  it('pide la primera página de 10 al abrir', async () => {
    await render();

    expect(api.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it('pinta una fila por conciliación con la columna "Ventas"', async () => {
    const el = await render();

    expect(headers(el)).toContain('Ventas');
    expect(rows(el)).toHaveLength(2);
    const ventasIndex = headers(el).indexOf('Ventas');
    const ventas = rows(el).map((tr) => tr.querySelectorAll('td')[ventasIndex].textContent!.trim());
    expect(ventas).toEqual([formatCount(1234), '0']);
  });

  it('muestra los comentarios o un guion si no hay', async () => {
    const el = await render();

    expect(rows(el)[0].textContent).toContain('En espera del extracto bancario.');
    const comentariosIndex = headers(el).indexOf('Comentarios');
    expect(rows(el)[1].querySelectorAll('td')[comentariosIndex].textContent!.trim()).toBe('—');
  });

  it('si la carga va bien no ofrece "Reintentar"', async () => {
    const el = await render();

    expect(reintentar(el)).toBeUndefined();
  });

  it('si la carga falla ofrece "Reintentar", que vuelve a pedir la lista', async () => {
    listResponse = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const el = await render();

    expect(el.textContent).toContain('No se pudieron cargar las conciliaciones.');
    expect(reintentar(el)).toBeDefined();

    listResponse = () => of(PAGE);
    reintentar(el)!.click();
    await settle();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(reintentar(el)).toBeUndefined();
    expect(rows(el)).toHaveLength(2);
  });
});

// Mismo formato que el pipe `number` con el LOCALE_ID del TestBed.
function formatCount(value: number): string {
  return formatNumber(value, TestBed.inject(LOCALE_ID));
}
