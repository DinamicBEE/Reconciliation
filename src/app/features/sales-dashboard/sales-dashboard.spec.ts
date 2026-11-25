import { formatNumber } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ModalOptions, NzModalService } from 'ng-zorro-antd/modal';
import { NzOptionComponent, NzSelectComponent } from 'ng-zorro-antd/select';
import { Subject, of, throwError } from 'rxjs';
import { AccessControlService } from '../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../core/country/active-country';
import { MoneyPipe } from '../../core/country/money.pipe';
import { CatalogService } from '../../core/services/catalog.service';
import { PermissionKey } from '../../shared/models/access.model';
import { CaptureBatchResult, SaleDetail, SaleListItem } from './data/sales-api.service';
import { SalesCatalogService } from './data/sales-catalog.service';
import { DateRangeFilter, ReprocessTarget, SalesDashboardService } from './data/sales-dashboard.service';
import { SalesDashboard } from './sales-dashboard';

const STORES = [
  { id: 7, nombre: 'Centro' },
  { id: 8, nombre: 'Polanco' },
];

function sale(id: number, overrides: Partial<SaleListItem> = {}): SaleListItem {
  return {
    id,
    folio: `A-${id}`,
    documentType: 'INVOICE',
    date: '2026-10-20',
    time: '14:05',
    store: { id: 7, name: 'Centro' },
    customer: { id: 3, document: 'XAXX010101000', name: 'Ana López', finalConsumer: false },
    tenderMedia: { id: 1, code: 'EF', description: 'Efectivo', mixed: false, paymentCount: 1 },
    reconciliationStatus: { id: 10, code: 'conciliado', description: 'Conciliado' },
    subtotal: 100,
    taxes: 16,
    total: 116,
    ...overrides,
  };
}

// Detalle completo de `GET /sales/{id}` para la venta 7; cada prueba lo ajusta.
function saleDetail(overrides: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: 7,
    folio: 'A-7',
    documentType: 'INVOICE',
    date: '2026-10-20',
    time: '14:05:00',
    store: { id: 7, name: 'Centro' },
    reconciliationStatus: { id: 10, code: 'conciliado', description: 'Conciliado' },
    reference: { posCheckNumber: '1234', posFolio: 55 },
    customer: {
      id: 3,
      documentType: { code: '31', description: 'NIT' },
      document: '900123456',
      checkDigit: '7',
      name: 'Mariscos S.A.S.',
      email: 'compras@mariscos.co',
      phone: '6011234567',
      mobilePhone: '3001234567',
      address: 'Calle 1 # 2-3',
      personType: { code: '1', description: 'Persona jurídica' },
      taxRegime: { code: '48', description: 'Responsable de IVA' },
      finalConsumer: false,
    },
    fiscal: {
      prefix: 'FE',
      number: '1234',
      cufe: 'cufe-abc-123',
      billedAt: '2026-10-20T13:45:00',
      resolutionNumber: '18760000001',
      dianPaymentMethods: [
        { code: '10', description: 'Efectivo' },
        { code: '48', description: 'Tarjeta Crédito' },
      ],
    },
    lines: [
      { seq: 1, productCode: 'P-01', description: 'Ceviche', quantity: 2, unitPrice: 30, amount: 60, taxAmount: 11.4, taxCode: '01', taxRate: 19 },
      { seq: 2, productCode: null, description: 'Limonada', quantity: 1, unitPrice: 10, amount: 10, taxAmount: null, taxCode: null, taxRate: null },
    ],
    payments: [
      {
        seq: 1,
        tenderMedia: { id: 2, code: 'TC', description: 'Tarjeta' },
        dianPaymentMethod: { code: '48', description: 'Tarjeta Crédito' },
        amount: 50,
        cardNetwork: 'VISA',
        acquirer: 'Credibanco',
        approvalCode: 'AUT123',
        paidAt: '2026-10-20T13:50:00',
      },
      {
        seq: 2,
        tenderMedia: null,
        dianPaymentMethod: null,
        amount: 33.4,
        cardNetwork: null,
        acquirer: null,
        approvalCode: null,
        paidAt: null,
      },
    ],
    adjustments: {
      discountTotal: 5,
      tipTotal: 7,
      otherChargesTotal: 0,
      items: [
        { seq: 1, kind: 'DISCOUNT', reason: 'Cliente frecuente', percentage: 10, amount: 5 },
        { seq: 2, kind: 'TIP', reason: null, percentage: null, amount: 7 },
      ],
    },
    taxes: [
      { code: '01', rate: 19, base: 60, amount: 11.4 },
      { code: '22', rate: 66, base: 1, amount: 66 },
    ],
    breakdown: { linesTotal: 70, subtotal: 65, taxes: 11.4, charges: 7, total: 83.4, totalPaid: 83.4 },
    ...overrides,
  };
}

function captureResult(overrides: Partial<CaptureBatchResult> = {}): CaptureBatchResult {
  return {
    status: 'OK',
    capturedCount: 3,
    insertedCount: 2,
    skippedCount: 1,
    failedCount: 0,
    capturedAmount: 300,
    dateFrom: '2026-10-20',
    dateTo: '2026-10-20',
    locationsRequested: 1,
    daysRequested: 1,
    declaredCount: 3,
    locations: [],
    ...overrides,
  };
}

// Doble de `SalesDashboardService` con los signals que lee la plantilla y métodos
// espiados; el servicio real tiene su propia spec.
function createServiceStub() {
  return {
    selectedSale: signal<SaleListItem | null>(null),
    saleDetail: signal<SaleDetail | null>(null),
    saleDetailLoading: signal(false),
    saleDetailFailed: signal(false),
    reloadSaleDetail: vi.fn(),
    dateRange: signal<DateRangeFilter>(null),
    subsidiariaFilter: signal<number | 'all'>('all'),
    storeFilter: signal<number | 'all'>('all'),
    statusFilter: signal<number | 'all'>('all'),
    tenderMediaFilter: signal<number | 'all'>('all'),
    search: signal(''),
    page: signal(1),
    pageSize: signal(10),
    rows: signal<SaleListItem[]>([]),
    total: signal(0),
    loading: signal(false),
    loadFailed: signal(false),
    reprocessTarget: signal<ReprocessTarget | null>(null),
    setDateRange: vi.fn(),
    setSubsidiariaFilter: vi.fn(),
    setStoreFilter: vi.fn(),
    setStatusFilter: vi.fn(),
    setTenderMediaFilter: vi.fn(),
    setSearch: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    exportRows: vi.fn(() => of<SaleListItem[]>([])),
    reprocessDay: vi.fn(() => of(captureResult())),
    reload: vi.fn(),
    openSale: vi.fn(),
    closeSale: vi.fn(),
  };
}

describe('SalesDashboard', () => {
  let fixture: ComponentFixture<SalesDashboard>;
  let el: HTMLElement;
  let service: ReturnType<typeof createServiceStub>;
  let permissions: WritableSignal<PermissionKey[]>;
  let salesCatalog: { ensureLoaded: ReturnType<typeof vi.fn> };
  let modal: { confirm: ReturnType<typeof vi.fn> };
  let message: { info: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };

  async function setup(granted: PermissionKey[] = ['view_dashboard']) {
    service = createServiceStub();
    permissions = signal(granted);
    salesCatalog = { ensureLoaded: vi.fn() };
    modal = { confirm: vi.fn() };
    message = { info: vi.fn(), create: vi.fn() };

    TestBed.configureTestingModule({
      imports: [SalesDashboard],
      providers: [
        // Igual que `app.config.ts`: país, i18n y adaptador de fechas de ng-zorro.
        provideCountry(ACTIVE_COUNTRY),
        provideNzI18n(es_ES),
        provideNzDateFnsAdapter(),
        {
          provide: CatalogService,
          useValue: {
            ubicaciones: signal(STORES),
            subsidiarias: signal([{ id: 1, nombre: 'Coctel del Mar SA' }]),
            findUbicacion: (id: number | null) => STORES.find((s) => s.id === id) ?? null,
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            hasPermission: (key: PermissionKey) => permissions().includes(key),
            canReprocessSales: () => permissions().includes('capture_sales'),
          },
        },
        {
          provide: SalesCatalogService,
          useValue: {
            ensureLoaded: salesCatalog.ensureLoaded,
            loading: signal(false),
            reconciliationStatuses: signal([
              { id: 10, code: 'conciliado', description: 'Conciliado' },
              { id: 11, code: 'por_conciliar', description: 'Por conciliar' },
            ]),
            tenderMedia: signal([
              { id: 1, code: 'EF', description: 'Efectivo', pendingReview: false },
              { id: 2, code: 'XYZ', description: 'Vale', pendingReview: true },
            ]),
          },
        },
        { provide: NzMessageService, useValue: message },
      ],
    });
    // `overrideProvider` (no `overrideComponent`) reemplaza en el injector del componente
    // sin recompilar en JIT, así la cobertura sigue mapeada a la plantilla.
    TestBed.overrideProvider(SalesDashboardService, { useValue: service });
    TestBed.overrideProvider(NzModalService, { useValue: modal });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SalesDashboard);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const tableRows = () => Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr.clickable-row'));
  const cells = (row: HTMLTableRowElement) => Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
  const buttonByText = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(text));
  const selects = () => fixture.debugElement.queryAll(By.directive(NzSelectComponent));
  // `nz-option` no se proyecta al DOM mientras el select está cerrado: se leen
  // las opciones declaradas desde el `contentChildren` del select.
  const optionsOf = (index: number) =>
    (selects()[index].componentInstance as NzSelectComponent).listOfNzOptionComponent
      .toArray()
      .map((opt: NzOptionComponent) => ({ value: opt.nzValue, label: opt.nzLabel }));
  const lastConfirm = () => modal.confirm.mock.calls.at(-1)![0] as ModalOptions;
  const confirmOk = () => (lastConfirm().nzOnOk as () => Promise<void>)();

  async function render() {
    await fixture.whenStable();
  }

  describe('renderizado', () => {
    beforeEach(() => setup());

    it('carga los catálogos de ventas al entrar', () => {
      expect(salesCatalog.ensureLoaded).toHaveBeenCalledTimes(1);
    });

    it('no pinta su título (lo da el header) y muestra la columna de ubicación con el vocabulario del país', () => {
      expect(el.querySelector('nz-page-header')).toBeNull();
      const headers = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(headers).toContain(ACTIVE_COUNTRY.vocabulary.location);
    });

    it('sin filas muestra el mensaje de "sin coincidencias"', () => {
      expect(tableRows()).toHaveLength(0);
      expect(el.textContent).toContain('Ninguna venta coincide con los filtros aplicados.');
    });

    it('si falló la carga muestra el mensaje de error', async () => {
      service.loadFailed.set(true);
      await render();
      expect(el.textContent).toContain('No se pudieron cargar las ventas.');
    });

    it('pinta una fila por venta con fecha, tienda, cliente, medio de pago, estado e importes', async () => {
      service.rows.set([sale(1)]);
      service.total.set(1);
      await render();

      expect(tableRows()).toHaveLength(1);
      const [folio, date, store, customer, media, status, subtotal, taxes, total] = cells(tableRows()[0]);
      expect(folio).toBe('A-1');
      expect(date).toBe('20/10/2026 14:05');
      expect(store).toBe('Centro');
      expect(customer).toBe('Ana López');
      expect(media).toBe('Efectivo');
      expect(status).toBe('Conciliado');
      expect(subtotal).toContain('100.00');
      expect(taxes).toContain('16.00');
      expect(total).toContain('116.00');
    });

    it('marca las notas crédito y cubre los datos ausentes', async () => {
      service.rows.set([sale(2, { documentType: 'CREDIT_NOTE', time: null, customer: null, tenderMedia: null })]);
      await render();

      const [folio, date, , customer, media] = cells(tableRows()[0]);
      expect(folio).toBe('A-2 Nota crédito');
      expect(date).toBe('20/10/2026');
      expect(customer).toBe('Sin cliente');
      expect(media).toBe('Sin pagos');
    });

    it('un pago mixto muestra el medio principal y cuántos pagos más hay', async () => {
      service.rows.set([
        sale(3, { tenderMedia: { id: 2, code: 'TC', description: 'Tarjeta', mixed: true, paymentCount: 3 } }),
      ]);
      await render();
      expect(cells(tableRows()[0])[4]).toBe('Tarjeta +2');
    });

    it('un código de estado desconocido se muestra como "Por conciliar"', async () => {
      service.rows.set([
        sale(4, { reconciliationStatus: { id: 12, code: 'desconciliado', description: 'x' } }),
        sale(5, { reconciliationStatus: { id: 99, code: 'NUEVO', description: 'Nuevo' } }),
      ]);
      await render();
      expect(cells(tableRows()[0])[5]).toBe('Desconciliado');
      expect(cells(tableRows()[1])[5]).toBe('Por conciliar');
    });

    it('clic en la fila o en "Ver detalles" abre el detalle de la venta', async () => {
      const row = sale(6);
      service.rows.set([row]);
      await render();

      tableRows()[0].click();
      expect(service.openSale).toHaveBeenCalledWith(row);

      service.openSale.mockClear();
      tableRows()[0].querySelector<HTMLButtonElement>('button[aria-label="Ver detalles"]')!.click();
      expect(service.openSale).toHaveBeenCalledTimes(1);
    });

    it('con una venta seleccionada muestra el drawer con su detalle', async () => {
      service.selectedSale.set(
        sale(7, { tenderMedia: { id: 2, code: 'TC', description: 'Tarjeta', mixed: true, paymentCount: 2 } }),
      );
      await render();

      const drawer = document.querySelector('.ant-drawer');
      expect(drawer?.textContent).toContain('Venta A-7');
      expect(drawer?.textContent).toContain('XAXX010101000');
      expect(drawer?.textContent).toContain('(pago mixto: 2 pagos)');
    });
  });

  describe('detalle de la venta (drawer)', () => {
    const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
    const money = (value: number) => norm(TestBed.runInInjectionContext(() => new MoneyPipe().transform(value)));
    const drawer = () => document.querySelector<HTMLElement>('.ant-drawer')!;
    const headings = () => Array.from(drawer().querySelectorAll('.sale-drawer__heading')).map((h) => norm(h.textContent));
    const section = (heading: string) =>
      Array.from(drawer().querySelectorAll<HTMLElement>('.sale-drawer__section')).find(
        (s) => norm(s.querySelector('.sale-drawer__heading')?.textContent) === heading,
      );
    // Campos `label -> valor` de una sección con `.info-field`.
    const fields = (heading: string) =>
      Object.fromEntries(
        Array.from(section(heading)!.querySelectorAll('.info-field')).map((f) => [
          norm(f.querySelector('.info-field__label')?.textContent),
          norm(f.querySelector('.info-field__value')?.textContent),
        ]),
      );
    // Sin el placeholder ni la fila de medición que agrega `nzScroll` (celdas vacías).
    const tableRowsOf = (heading: string) =>
      Array.from(section(heading)!.querySelectorAll('tbody tr'))
        .filter((tr) => !tr.classList.contains('ant-table-placeholder'))
        .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => norm(td.textContent)))
        .filter((cells) => cells.some((cell) => cell !== ''));

    async function open(detail: SaleDetail | null = saleDetail(), row: SaleListItem = sale(7)): Promise<void> {
      service.selectedSale.set(row);
      service.saleDetail.set(detail);
      await render();
    }

    beforeEach(() => setup());

    it('con el detalle pinta las secciones en orden', async () => {
      await open();

      expect(headings()).toEqual([
        'Resumen de la venta',
        'Cliente',
        'Comprobante fiscal',
        'Productos',
        'Pagos',
        'Descuentos y propinas',
        'Impuestos',
        'Importes',
      ]);
    });

    it('sin detalle (aún no llega) solo muestra el resumen de la fila y los importes', async () => {
      await open(null);

      expect(headings()).toEqual(['Resumen de la venta', 'Importes']);
    });

    describe('Cliente', () => {
      it('muestra nombre, documento con dígito de verificación, tipo de persona, régimen, correo, celular y dirección', async () => {
        await open();

        expect(fields('Cliente')).toEqual({
          Nombre: 'Mariscos S.A.S.',
          Documento: 'NIT 900123456-7',
          'Tipo de persona': 'Persona jurídica',
          'Régimen fiscal': 'Responsable de IVA',
          Correo: 'compras@mariscos.co',
          Teléfono: '3001234567',
          Dirección: 'Calle 1 # 2-3',
        });
      });

      it('sin celular usa el teléfono fijo y los datos ausentes van como "—"', async () => {
        const base = saleDetail().customer!;
        await open(
          saleDetail({
            customer: { ...base, mobilePhone: null, email: null, address: null, personType: null, taxRegime: null, checkDigit: null },
          }),
        );

        expect(fields('Cliente')).toMatchObject({
          Documento: 'NIT 900123456',
          'Tipo de persona': '—',
          'Régimen fiscal': '—',
          Correo: '—',
          Teléfono: '6011234567',
          Dirección: '—',
        });
      });

      it('sin ningún teléfono muestra "—"', async () => {
        await open(saleDetail({ customer: { ...saleDetail().customer!, mobilePhone: null, phone: null } }));

        expect(fields('Cliente')['Teléfono']).toBe('—');
      });

      it('sin cliente no pinta la sección', async () => {
        await open(saleDetail({ customer: null }));

        expect(section('Cliente')).toBeUndefined();
      });
    });

    describe('Comprobante fiscal', () => {
      it('muestra número (prefijo + número), fecha de facturación, resolución, medios DIAN y CUFE', async () => {
        await open();

        expect(fields('Comprobante fiscal')).toEqual({
          Número: 'FE1234',
          Facturada: '20/10/2026 13:45',
          'Resolución DIAN': '18760000001',
          'Medios de pago DIAN': '10 Efectivo, 48 Tarjeta Crédito',
          CUFE: 'cufe-abc-123',
        });
        expect(section('Comprobante fiscal')!.querySelector('.sale-drawer__cufe')!.getAttribute('title')).toBe('cufe-abc-123');
      });

      it('sin datos fiscales muestra "—" en cada campo', async () => {
        await open(
          saleDetail({
            fiscal: { prefix: null, number: null, cufe: null, billedAt: null, resolutionNumber: null, dianPaymentMethods: [] },
          }),
        );

        expect(fields('Comprobante fiscal')).toEqual({
          Número: '—',
          Facturada: '—',
          'Resolución DIAN': '—',
          'Medios de pago DIAN': '—',
          CUFE: '—',
        });
      });

      it('sin comprobante no pinta la sección', async () => {
        await open(saleDetail({ fiscal: null }));

        expect(section('Comprobante fiscal')).toBeUndefined();
      });
    });

    describe('Productos', () => {
      it('lista cada línea con código, cantidad, precio, impuesto e importe', async () => {
        await open();

        expect(tableRowsOf('Productos')).toEqual([
          ['Ceviche (P-01)', formatNumber(2, ACTIVE_COUNTRY.locale, '1.0-3'), money(30), money(11.4), money(60)],
          ['Limonada', formatNumber(1, ACTIVE_COUNTRY.locale, '1.0-3'), money(10), '—', money(10)],
        ]);
      });

      it('sin líneas capturadas muestra el aviso', async () => {
        await open(saleDetail({ lines: [] }));

        expect(tableRowsOf('Productos')).toEqual([]);
        expect(norm(section('Productos')!.textContent)).toContain('Los productos de esta venta aún no se capturaron.');
      });
    });

    describe('Pagos', () => {
      it('muestra medio con su código DIAN, franquicia y adquirente, aprobación, fecha e importe', async () => {
        await open();

        expect(tableRowsOf('Pagos')).toEqual([
          ['Tarjeta · DIAN 48', 'VISA · Credibanco', 'AUT123', '20/10/2026 13:50', money(50)],
          ['—', '—', '—', '—', money(33.4)],
        ]);
      });

      it('sin pagos muestra el aviso', async () => {
        await open(saleDetail({ payments: [] }));

        expect(norm(section('Pagos')!.textContent)).toContain('La venta no tiene pagos.');
      });
    });

    describe('Descuentos y propinas', () => {
      it('distingue descuento de propina y muestra motivo, porcentaje e importe', async () => {
        await open();

        expect(tableRowsOf('Descuentos y propinas')).toEqual([
          ['Descuento', 'Cliente frecuente', `${formatNumber(10, ACTIVE_COUNTRY.locale, '1.0-2')} %`, money(5)],
          ['Propina / recargo', '—', '—', money(7)],
        ]);
      });

      it('sin ajustes o con la lista vacía no pinta la sección', async () => {
        await open(saleDetail({ adjustments: null }));
        expect(section('Descuentos y propinas')).toBeUndefined();

        service.saleDetail.set(saleDetail({ adjustments: { discountTotal: 0, tipTotal: 0, otherChargesTotal: 0, items: [] } }));
        await render();
        expect(section('Descuentos y propinas')).toBeUndefined();
      });
    });

    describe('Impuestos', () => {
      it('muestra el tributo con su nombre DIAN, la tasa, la base y el impuesto', async () => {
        await open();

        expect(tableRowsOf('Impuestos')).toEqual([
          ['IVA (01)', `${formatNumber(19, ACTIVE_COUNTRY.locale, '1.0-2')} %`, money(60), money(11.4)],
          // La bolsa (22) es un valor por unidad: sin "%".
          ['Impuesto a las bolsas (22)', formatNumber(66, ACTIVE_COUNTRY.locale, '1.0-2'), money(1), money(66)],
        ]);
      });

      it('sin impuestos no pinta la sección', async () => {
        await open(saleDetail({ taxes: [] }));

        expect(section('Impuestos')).toBeUndefined();
      });
    });

    describe('Importes', () => {
      it('con el desglose del back muestra subtotal, impuestos, propinas, total y total pagado de él', async () => {
        await open();

        expect(fields('Importes')).toEqual({
          Subtotal: money(65),
          Impuestos: money(11.4),
          'Propinas y recargos': money(7),
          Total: money(83.4),
          'Total pagado': money(83.4),
        });
      });

      it('sin desglose usa los importes de la fila, sin propinas ni total pagado', async () => {
        await open(saleDetail({ breakdown: null }));

        expect(fields('Importes')).toEqual({ Subtotal: money(100), Impuestos: money(16), Total: money(116) });
      });

      it('sin detalle también usa los importes de la fila', async () => {
        await open(null);

        expect(fields('Importes')).toEqual({ Subtotal: money(100), Impuestos: money(16), Total: money(116) });
      });
    });

    describe('carga y error', () => {
      const note = () => drawer().querySelector<HTMLElement>('.sale-drawer__note');
      const retry = () =>
        Array.from(drawer().querySelectorAll<HTMLButtonElement>('button')).find((b) => norm(b.textContent) === 'Reintentar');

      it('mientras carga muestra el aviso, sin botón de reintentar', async () => {
        service.saleDetailLoading.set(true);
        await open(null);

        expect(norm(note()?.textContent)).toBe('Cargando el detalle de la venta…');
        expect(retry()).toBeUndefined();
      });

      it('si falló muestra el error con "Reintentar" (icono + label) y vuelve a pedir el detalle', async () => {
        service.saleDetailFailed.set(true);
        await open(null);

        expect(norm(note()?.textContent)).toContain('No se pudo cargar el detalle de la venta.');
        const button = retry()!;
        expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');

        button.click();

        expect(service.reloadSaleDetail).toHaveBeenCalledTimes(1);
      });

      it('con el detalle cargado no muestra avisos', async () => {
        await open();

        expect(note()).toBeNull();
      });
    });
  });

  describe('filtros', () => {
    beforeEach(() => setup());

    it('ofrece las tiendas del login, los estados y los medios de pago del catálogo', () => {
      expect(optionsOf(1)).toEqual([
        { value: 'all', label: ACTIVE_COUNTRY.vocabulary.allLocations },
        { value: 7, label: 'Centro' },
        { value: 8, label: 'Polanco' },
      ]);
      expect(optionsOf(2)).toEqual([
        { value: 'all', label: 'Todos los estados' },
        { value: 10, label: 'Conciliado' },
        { value: 11, label: 'Por conciliar' },
      ]);
      expect(optionsOf(3)).toEqual([
        { value: 'all', label: 'Todos los medios' },
        { value: 1, label: 'Efectivo' },
        { value: 2, label: 'Vale (por revisar)' },
      ]);
    });

    it('el filtro de empresa lista las subsidiarias y está deshabilitado', () => {
      expect(optionsOf(0)).toEqual([
        { value: 'all', label: 'Todas las empresas' },
        { value: 1, label: 'Coctel del Mar SA' },
      ]);
      expect((selects()[0].componentInstance as NzSelectComponent).nzDisabled).toBe(true);
    });

    it('cada select actualiza su filtro en el estado de la pantalla', () => {
      selects()[0].triggerEventHandler('ngModelChange', 1);
      selects()[1].triggerEventHandler('ngModelChange', 7);
      selects()[2].triggerEventHandler('ngModelChange', 11);
      selects()[3].triggerEventHandler('ngModelChange', 2);

      expect(service.setSubsidiariaFilter).toHaveBeenCalledWith(1);
      expect(service.setStoreFilter).toHaveBeenCalledWith(7);
      expect(service.setStatusFilter).toHaveBeenCalledWith(11);
      expect(service.setTenderMediaFilter).toHaveBeenCalledWith(2);
    });

    it('el rango de fechas actualiza el filtro', () => {
      const range: [Date, Date] = [new Date(2026, 9, 1), new Date(2026, 9, 20)];
      fixture.debugElement.query(By.css('nz-range-picker')).triggerEventHandler('ngModelChange', range);
      expect(service.setDateRange).toHaveBeenCalledWith(range);
    });

    it('la búsqueda envía el texto escrito', async () => {
      const input = el.querySelector<HTMLInputElement>('input[placeholder="Buscar por folio, documento o cliente"]')!;
      input.value = 'Ana';
      input.dispatchEvent(new Event('input'));
      await render();
      expect(service.setSearch).toHaveBeenCalledWith('Ana');
    });

    it('la paginación del servidor cambia página y tamaño', () => {
      const table = fixture.debugElement.query(By.css('nz-table'));
      table.triggerEventHandler('nzPageIndexChange', 3);
      table.triggerEventHandler('nzPageSizeChange', 50);
      expect(service.setPage).toHaveBeenCalledWith(3);
      expect(service.setPageSize).toHaveBeenCalledWith(50);
    });
  });

  describe('Reprocesar', () => {
    const TARGET: ReprocessTarget = { date: new Date(2026, 9, 20), storeId: 7 };

    it('no se muestra sin el permiso capture_sales', async () => {
      await setup(['view_dashboard', 'export_reports']);
      expect(buttonByText('Reprocesar')).toBeUndefined();
    });

    it('con capture_sales se muestra deshabilitado si no hay un día y una tienda', async () => {
      await setup(['view_dashboard', 'capture_sales']);
      expect(buttonByText('Reprocesar')?.disabled).toBe(true);
    });

    it('se habilita con un objetivo de reproceso', async () => {
      await setup(['capture_sales']);
      service.reprocessTarget.set(TARGET);
      await render();
      expect(buttonByText('Reprocesar')?.disabled).toBe(false);
    });

    it('al perder el permiso desaparece', async () => {
      await setup(['capture_sales']);
      permissions.set(['view_dashboard']);
      await render();
      expect(buttonByText('Reprocesar')).toBeUndefined();
    });

    it('pide confirmación con el día y la tienda, sin capturar todavía', async () => {
      await setup(['capture_sales']);
      service.reprocessTarget.set(TARGET);
      await render();
      buttonByText('Reprocesar')!.click();

      expect(modal.confirm).toHaveBeenCalledTimes(1);
      expect(lastConfirm().nzTitle).toBe('Reprocesar día');
      expect(lastConfirm().nzContent).toContain('<b>20/10/2026</b> de <b>Centro</b>');
      expect(lastConfirm().nzOkText).toBe('Reprocesar');
      expect(service.reprocessDay).not.toHaveBeenCalled();
    });

    it('usa "#id" cuando la tienda no está en las ubicaciones del login', async () => {
      await setup(['capture_sales']);
      service.reprocessTarget.set({ date: new Date(2026, 0, 5), storeId: 99 });
      await render();
      buttonByText('Reprocesar')!.click();
      expect(lastConfirm().nzContent).toContain('<b>05/01/2026</b> de <b>#99</b>');
    });

    it('al confirmar captura, avisa el resultado y recarga si entraron documentos', async () => {
      await setup(['capture_sales']);
      service.reprocessTarget.set(TARGET);
      await render();
      buttonByText('Reprocesar')!.click();
      await confirmOk();

      expect(service.reprocessDay).toHaveBeenCalledWith(TARGET);
      expect(message.create).toHaveBeenCalledWith('success', expect.stringContaining('Centro del 20/10/2026'), {
        nzDuration: 4500,
      });
      expect(service.reload).toHaveBeenCalledTimes(1);
    });

    it('sin documentos nuevos avisa pero no recarga', async () => {
      await setup(['capture_sales']);
      service.reprocessTarget.set(TARGET);
      service.reprocessDay.mockReturnValue(of(captureResult({ insertedCount: 0, skippedCount: 3 })));
      await render();
      buttonByText('Reprocesar')!.click();
      await confirmOk();

      expect(message.create).toHaveBeenCalledWith('success', expect.any(String), { nzDuration: 4500 });
      expect(service.reload).not.toHaveBeenCalled();
    });

    it('un error HTTP se describe y se avisa con más duración, sin recargar', async () => {
      await setup(['capture_sales']);
      service.reprocessTarget.set(TARGET);
      service.reprocessDay.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Captura en curso' } })),
      );
      await render();
      buttonByText('Reprocesar')!.click();

      await expect(confirmOk()).resolves.toBeUndefined();
      expect(message.create).toHaveBeenCalledWith('warning', 'Captura en curso', { nzDuration: 8000 });
      expect(service.reload).not.toHaveBeenCalled();
    });

    it('el reprocesamiento se ignora si no hay objetivo (defensa en profundidad)', async () => {
      await setup(['capture_sales']);
      (fixture.componentInstance as unknown as { onReprocessClick(): void }).onReprocessClick();
      expect(modal.confirm).not.toHaveBeenCalled();
    });

    it('sin permiso se ignora aunque haya objetivo (defensa en profundidad)', async () => {
      await setup(['view_dashboard']);
      service.reprocessTarget.set(TARGET);
      (fixture.componentInstance as unknown as { onReprocessClick(): void }).onReprocessClick();
      expect(modal.confirm).not.toHaveBeenCalled();
    });
  });

  describe('Exportar', () => {
    let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let anchorClick: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // jsdom no implementa `URL.createObjectURL`: se simula y se evita la descarga real.
      createObjectURL = vi.fn(() => 'blob:mock');
      revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    afterEach(() => {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    });

    it('no se muestra sin el permiso export_reports', async () => {
      await setup(['view_dashboard']);
      expect(buttonByText('Exportar')).toBeUndefined();
    });

    it('sin resultados avisa y no descarga nada', async () => {
      await setup(['export_reports']);
      buttonByText('Exportar')!.click();
      await render();

      expect(service.exportRows).toHaveBeenCalledTimes(1);
      expect(message.info).toHaveBeenCalledWith('No hay ventas que exportar con los filtros actuales.');
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(anchorClick).not.toHaveBeenCalled();
    });

    it('descarga un CSV con BOM UTF-8 y la fecha del día en el nombre', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 21, 10, 0));
      await setup(['export_reports']);
      service.exportRows.mockReturnValue(of([sale(1), sale(2, { customer: null })]));

      buttonByText('Exportar')!.click();
      await render();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.type).toBe('text/csv;charset=utf-8;');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).slice(1);
      const lines = text.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain(`Hora,${ACTIVE_COUNTRY.vocabulary.location},Cliente`);
      expect(lines[1]).toContain('A-1,Factura,2026-10-20,14:05,Centro,Ana López');

      expect(anchorClick).toHaveBeenCalledTimes(1);
      const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('resumen-de-venta_2026-10-21.csv');
      expect(anchor.getAttribute('href')).toBe('blob:mock');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('mientras exporta ignora clics repetidos y muestra el botón en carga', async () => {
      await setup(['export_reports']);
      const response = new Subject<SaleListItem[]>();
      service.exportRows.mockReturnValue(response);

      buttonByText('Exportar')!.click();
      await render();
      expect(buttonByText('Exportar')!.classList).toContain('ant-btn-loading');

      buttonByText('Exportar')!.click();
      expect(service.exportRows).toHaveBeenCalledTimes(1);

      response.next([]);
      response.complete();
      await render();
      expect(buttonByText('Exportar')!.classList).not.toContain('ant-btn-loading');
    });

    it('si falla la exportación libera el botón', async () => {
      await setup(['export_reports']);
      service.exportRows.mockReturnValue(throwError(() => new Error('500')));

      buttonByText('Exportar')!.click();
      await render();

      expect(buttonByText('Exportar')!.classList).not.toContain('ant-btn-loading');
      expect(createObjectURL).not.toHaveBeenCalled();
      buttonByText('Exportar')!.click();
      expect(service.exportRows).toHaveBeenCalledTimes(2);
    });
  });
});
