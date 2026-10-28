import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { Router, provideRouter } from '@angular/router';
import { AccessControlService } from '../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../core/country/active-country';
import { CatalogService } from '../../core/services/catalog.service';
import { OrganizationCatalogService, UbicacionCatalogEntry } from '../../core/services/organization-catalog.service';
import { CatalogEntry } from '../../shared/models/catalog-entry.model';
import { ReconciliationDashboard } from './reconciliation-dashboard';

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
  canStart(): boolean;
  openNewModal(): void;
  closeNewModal(): void;
  onCompanyChange(id: number | null): void;
  onNewPeriodChange(value: [Date, Date] | null): void;
  startReconciliation(): void;
}

describe('ReconciliationDashboard · modal "Nueva conciliación"', () => {
  let fixture: ComponentFixture<ReconciliationDashboard>;
  let cmp: Internals;
  let organizationStores: WritableSignal<readonly UbicacionCatalogEntry[]>;
  let ensureLoaded: ReturnType<typeof vi.fn>;
  let permissions: string[];

  beforeEach(async () => {
    organizationStores = signal<readonly UbicacionCatalogEntry[]>(RELATION);
    ensureLoaded = vi.fn();
    permissions = ['import_settlements'];

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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconciliationDashboard);
    cmp = fixture.componentInstance as unknown as Internals;
    fixture.detectChanges();
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
    it('requiere empresa, tienda y periodo', () => {
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

    it('sin el permiso import_settlements no hay botón para abrirlo', () => {
      TestBed.resetTestingModule();
      permissions = [];
      return TestBed.configureTestingModule({
        imports: [ReconciliationDashboard],
        providers: [
          provideRouter([]),
          provideCountry(ACTIVE_COUNTRY),
          provideNzI18n(es_ES),
          provideNzDateFnsAdapter(),
          {
            provide: CatalogService,
            useValue: { subsidiarias: signal(COMPANIES), ubicaciones: signal(SESSION_STORES) },
          },
          { provide: OrganizationCatalogService, useValue: { ubicaciones: organizationStores, ensureLoaded } },
          { provide: AccessControlService, useValue: { hasPermission: (key: string) => permissions.includes(key) } },
        ],
      })
        .compileComponents()
        .then(() => {
          const other = TestBed.createComponent(ReconciliationDashboard);
          other.detectChanges();

          const labelsOf = Array.from((other.nativeElement as HTMLElement).querySelectorAll('button')).map((b) =>
            b.textContent?.trim(),
          );
          expect(labelsOf).not.toContain('Nueva conciliación');
        });
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

    it('con todo elegido crea la conciliación, cierra el modal y navega a su proceso', () => {
      cmp.openNewModal();
      cmp.onCompanyChange(1);
      cmp.newStoreId.set(12);
      cmp.onNewPeriodChange(period());

      cmp.startReconciliation();

      expect(navigate).toHaveBeenCalledTimes(1);
      const [commands] = navigate.mock.calls[0] as [string[]];
      expect(commands[0]).toBe('/conciliacion');
      expect(commands[1]).toMatch(/^CON-\d+$/);
      expect(commands[2]).toBe('proceso');
      expect(cmp.newModalOpen()).toBe(false);
      expect(cmp.newCompanyId()).toBeNull();
      expect(cmp.newStoreId()).toBeNull();
    });
  });
});
