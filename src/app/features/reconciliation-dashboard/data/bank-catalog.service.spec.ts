import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { BankCatalogService, BankOption } from './bank-catalog.service';

const URL = `${environment.apiUrl}/reconciliations/banks`;

const BANKS: BankOption[] = [
  { id: 1, code: 'BANCOLOMBIA', name: 'Bancolombia' },
  { id: 2, code: 'RAPPI', name: 'Rappi' },
];

describe('BankCatalogService', () => {
  let service: BankCatalogService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(BankCatalogService);
    TestBed.tick();
  });

  afterEach(() => {
    httpMock.verify();
  });

  // El resource publica la respuesta en una microtarea: se espera a que la app quede estable.
  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function expectGet(): TestRequest {
    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    return req;
  }

  async function load(response: BankOption[] | 'error' = BANKS): Promise<void> {
    service.ensureLoaded();
    TestBed.tick();
    const req = expectGet();
    if (response === 'error') req.flush({ detail: 'x' }, { status: 500, statusText: 'Server Error' });
    else req.flush(response);
    await settle();
  }

  describe('antes de ensureLoaded', () => {
    it('no pide nada y la lista queda vacía', () => {
      httpMock.expectNone(URL);
      expect(service.banks()).toEqual([]);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('expone la lista como señal de solo lectura', () => {
      expect('set' in service.banks).toBe(false);
    });
  });

  describe('ensureLoaded', () => {
    it('pide GET /reconciliations/banks y expone los bancos', async () => {
      await load();

      expect(service.banks()).toEqual(BANKS);
      expect(service.loading()).toBe(false);
      expect(service.loadFailed()).toBe(false);
    });

    it('está cargando mientras la petición sigue en vuelo', async () => {
      service.ensureLoaded();
      TestBed.tick();
      expect(service.loading()).toBe(true);

      expectGet().flush(BANKS);
      await settle();

      expect(service.loading()).toBe(false);
    });

    it('una segunda llamada tras una carga exitosa no vuelve a pedir', async () => {
      await load();

      service.ensureLoaded();
      TestBed.tick();

      httpMock.expectNone(URL);
      expect(service.banks()).toEqual(BANKS);
    });
  });

  describe('errores', () => {
    it('una falla marca loadFailed y deja la lista vacía sin lanzar', async () => {
      await load('error');

      expect(service.loadFailed()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(() => service.banks()).not.toThrow();
      expect(service.banks()).toEqual([]);
      expect(service.find('BANCOLOMBIA')).toBeNull();
    });

    it('ensureLoaded tras una falla reintenta y limpia loadFailed', async () => {
      await load('error');

      await load();

      expect(service.loadFailed()).toBe(false);
      expect(service.banks()).toEqual(BANKS);
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await load();
    });

    it('devuelve el banco con ese código', () => {
      expect(service.find('RAPPI')).toEqual({ id: 2, code: 'RAPPI', name: 'Rappi' });
    });

    it('devuelve null si el código no está en el catálogo', () => {
      expect(service.find('BBVA')).toBeNull();
    });

    it('distingue mayúsculas: el código es exacto', () => {
      expect(service.find('bancolombia')).toBeNull();
    });

    it('devuelve null si el código es undefined, null o vacío', () => {
      expect(service.find(undefined)).toBeNull();
      expect(service.find(null)).toBeNull();
      expect(service.find('')).toBeNull();
    });
  });
});
