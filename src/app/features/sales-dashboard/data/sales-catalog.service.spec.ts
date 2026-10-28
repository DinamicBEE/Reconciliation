import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccessControlService } from '../../../core/auth/access-control.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ReconciliationStatusOption, SalesCatalogService, TenderMediaOption } from './sales-catalog.service';

const TENDER_MEDIA_URL = '/sales/catalogs/tender-media';
const STATUSES_URL = '/sales/catalogs/reconciliation-statuses';

const TENDER_MEDIA: TenderMediaOption[] = [
  { id: 1, code: 'EF', description: 'Efectivo', pendingReview: false },
  { id: 2, code: 'RAPPI', description: 'Rappi', pendingReview: true },
];

const STATUSES: ReconciliationStatusOption[] = [
  { id: 10, code: 'PENDING', description: 'Pendiente' },
  { id: 11, code: 'RECONCILED', description: 'Conciliado' },
];

describe('SalesCatalogService', () => {
  let httpMock: HttpTestingController;
  let authenticated: WritableSignal<boolean>;
  let permissions: WritableSignal<string[]>;

  function setup(options: { authenticated?: boolean; permissions?: string[] } = {}): SalesCatalogService {
    authenticated = signal(options.authenticated ?? true);
    permissions = signal(options.permissions ?? ['view_dashboard']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: authenticated, currentUser: signal(null) } },
        {
          provide: AccessControlService,
          useValue: { hasPermission: (key: string) => authenticated() && permissions().includes(key) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(SalesCatalogService);
    TestBed.tick();
    return service;
  }

  // El resource publica la respuesta en una microtarea: tras `flush` hay que
  // esperar a que la app quede estable (ya sin peticiones en vuelo).
  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function ensureLoaded(service: SalesCatalogService): void {
    service.ensureLoaded();
    TestBed.tick();
  }

  function expectGet(url: string): TestRequest {
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    return req;
  }

  async function loadBoth(service: SalesCatalogService): Promise<void> {
    ensureLoaded(service);
    expectGet(TENDER_MEDIA_URL).flush(TENDER_MEDIA);
    expectGet(STATUSES_URL).flush(STATUSES);
    await settle();
  }

  afterEach(() => {
    httpMock.verify();
  });

  describe('antes de ensureLoaded', () => {
    it('no pide nada y expone listas vacías', () => {
      const service = setup();
      httpMock.expectNone(TENDER_MEDIA_URL);
      httpMock.expectNone(STATUSES_URL);
      expect(service.tenderMedia()).toEqual([]);
      expect(service.reconciliationStatuses()).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });
  });

  describe('ensureLoaded', () => {
    it('pide los dos catálogos y los expone', async () => {
      const service = setup();
      await loadBoth(service);

      expect(service.tenderMedia()).toEqual(TENDER_MEDIA);
      expect(service.reconciliationStatuses()).toEqual(STATUSES);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('está cargando mientras quede algún catálogo en vuelo', async () => {
      const service = setup();
      ensureLoaded(service);
      const tenderMedia = expectGet(TENDER_MEDIA_URL);
      const statuses = expectGet(STATUSES_URL);
      expect(service.loading()).toBe(true);

      tenderMedia.flush(TENDER_MEDIA);
      TestBed.tick();
      await Promise.resolve();
      expect(service.tenderMedia()).toEqual(TENDER_MEDIA);
      expect(service.loading()).toBe(true);

      statuses.flush(STATUSES);
      await settle();
      expect(service.loading()).toBe(false);
    });

    it('sin sesión no pide nada', () => {
      const service = setup({ authenticated: false });
      ensureLoaded(service);
      httpMock.expectNone(TENDER_MEDIA_URL);
      httpMock.expectNone(STATUSES_URL);
      expect(service.tenderMedia()).toEqual([]);
    });

    it('sin view_dashboard no pide nada', () => {
      const service = setup({ permissions: ['manage_users'] });
      ensureLoaded(service);
      httpMock.expectNone(TENDER_MEDIA_URL);
      httpMock.expectNone(STATUSES_URL);
      expect(service.reconciliationStatuses()).toEqual([]);
    });

    it('una segunda llamada sin fallos no vuelve a pedir', async () => {
      const service = setup();
      await loadBoth(service);

      ensureLoaded(service);
      httpMock.expectNone(TENDER_MEDIA_URL);
      httpMock.expectNone(STATUSES_URL);
      expect(service.tenderMedia()).toEqual(TENDER_MEDIA);
    });
  });

  describe('errores', () => {
    it('la falla de un catálogo marca loadFailed y no vacía el otro', async () => {
      const service = setup();
      ensureLoaded(service);
      expectGet(TENDER_MEDIA_URL).flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      expectGet(STATUSES_URL).flush(STATUSES);
      await settle();

      expect(service.loadFailed()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(() => service.tenderMedia()).not.toThrow();
      expect(service.tenderMedia()).toEqual([]);
      expect(service.reconciliationStatuses()).toEqual(STATUSES);
      expect(service.findTenderMedia(1)).toBeNull();
    });

    it('ensureLoaded posterior solo reintenta el que falló', async () => {
      const service = setup();
      ensureLoaded(service);
      expectGet(TENDER_MEDIA_URL).flush(TENDER_MEDIA);
      expectGet(STATUSES_URL).flush({}, { status: 0, statusText: 'Unknown Error' });
      await settle();
      expect(service.loadFailed()).toBe(true);

      ensureLoaded(service);
      httpMock.expectNone(TENDER_MEDIA_URL);
      expectGet(STATUSES_URL).flush(STATUSES);
      await settle();

      expect(service.loadFailed()).toBe(false);
      expect(service.tenderMedia()).toEqual(TENDER_MEDIA);
      expect(service.reconciliationStatuses()).toEqual(STATUSES);
    });
  });

  describe('búsquedas', () => {
    it('findTenderMedia y findReconciliationStatus buscan por id', async () => {
      const service = setup();
      await loadBoth(service);

      expect(service.findTenderMedia(2)).toEqual(TENDER_MEDIA[1]);
      expect(service.findTenderMedia(99)).toBeNull();
      expect(service.findReconciliationStatus(11)).toEqual(STATUSES[1]);
      expect(service.findReconciliationStatus(99)).toBeNull();
    });

    it('sin catálogo cargado devuelven null', () => {
      const service = setup();
      expect(service.findTenderMedia(1)).toBeNull();
      expect(service.findReconciliationStatus(10)).toBeNull();
    });
  });

  describe('cambios de sesión', () => {
    it('al cerrar sesión vuelve a vacío sin pedir nada', async () => {
      const service = setup();
      await loadBoth(service);

      authenticated.set(false);
      TestBed.tick();

      httpMock.expectNone(TENDER_MEDIA_URL);
      httpMock.expectNone(STATUSES_URL);
      expect(service.tenderMedia()).toEqual([]);
      expect(service.reconciliationStatuses()).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('al cerrar sesión con la carga en vuelo descarta la respuesta tardía', async () => {
      const service = setup();
      ensureLoaded(service);
      const tenderMedia = expectGet(TENDER_MEDIA_URL);
      const statuses = expectGet(STATUSES_URL);

      authenticated.set(false);
      TestBed.tick();
      expect(service.loading()).toBe(false);

      tenderMedia.flush(TENDER_MEDIA);
      statuses.flush(STATUSES);
      await settle();
      expect(service.tenderMedia()).toEqual([]);
      expect(service.reconciliationStatuses()).toEqual([]);
    });

    it('al volver a iniciar sesión pide de nuevo los catálogos ya solicitados', async () => {
      const service = setup();
      await loadBoth(service);
      authenticated.set(false);
      TestBed.tick();

      authenticated.set(true);
      TestBed.tick();
      expectGet(TENDER_MEDIA_URL).flush([TENDER_MEDIA[0]]);
      expectGet(STATUSES_URL).flush([]);
      await settle();

      expect(service.tenderMedia()).toEqual([TENDER_MEDIA[0]]);
      expect(service.reconciliationStatuses()).toEqual([]);
    });
  });
});
