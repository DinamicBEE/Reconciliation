import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AccessControlService } from '../../core/auth/access-control.service';
import { ACTIVE_COUNTRY, provideCountry } from '../../core/country/active-country';
import { PermissionKey } from '../../shared/models/access.model';
import { PageHeaderService } from '../../core/layout/header/page-header.service';
import { DifferenceManagementService } from './data/difference-management.service';
import { DifferenceManagement } from './difference-management';

// Orden `amount_mismatch` real del mock de efectivo.
const TENDER_MEDIA = 'efectivo';
const ORDER_ID = 'CORTE-0827-02';

describe('DifferenceManagement', () => {
  let fixture: ComponentFixture<DifferenceManagement>;
  let el: HTMLElement;
  let message: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };
  let permissions: PermissionKey[];
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    message = { success: vi.fn(), warning: vi.fn() };
    permissions = ['manage_differences'];

    await TestBed.configureTestingModule({
      imports: [DifferenceManagement],
      providers: [
        provideRouter([]),
        provideCountry(ACTIVE_COUNTRY),
        { provide: NzMessageService, useValue: message },
        { provide: AccessControlService, useValue: { hasPermission: (key: PermissionKey) => permissions.includes(key) } },
      ],
    }).compileComponents();

    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(DifferenceManagement);
    el = fixture.nativeElement as HTMLElement;
  });

  async function render(inputs: { tenderMedia?: string; orderId?: string } = {}): Promise<void> {
    const { tenderMedia = TENDER_MEDIA, orderId = ORDER_ID } = inputs;
    fixture.componentRef.setInput('tenderMedia', tenderMedia);
    fixture.componentRef.setInput('orderId', orderId);
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const pageHeader = () => TestBed.inject(PageHeaderService);
  const service = () => fixture.debugElement.injector.get(DifferenceManagementService);
  const backLink = () => el.querySelector('a[href="/conciliacion"]');
  const saveButton = () => el.querySelector<HTMLButtonElement>('.save-match-button')!;

  describe('pantalla de una orden', () => {
    beforeEach(() => render());

    it('le entrega al header el título con la orden, sin botones ni subtítulo', () => {
      expect(pageHeader().header()).toEqual({
        title: `Gestión de diferencias — Orden ${ORDER_ID}`,
        subtitle: null,
        parent: null,
        actions: null,
      });
    });

    it('no pinta su propio encabezado de página', () => {
      expect(el.querySelector('nz-page-header')).toBeNull();
      expect(el.querySelector('nz-breadcrumb')).toBeNull();
    });

    it('resume la orden: referencia y medio de pago', () => {
      const summary = el.querySelector('.order-summary-card')!.textContent!;

      expect(summary).toContain(ORDER_ID);
      expect(summary).toContain('Efectivo');
    });

    it('renderiza la lista de candidatos y la importación de CSV', () => {
      expect(el.querySelector('app-candidate-list')).not.toBeNull();
      expect(el.querySelector('app-settlements-import')).not.toBeNull();
      expect(el.querySelector('.candidate-card')).not.toBeNull();
    });

    it('los errores de importación del servicio se ven en la lista de candidatos', async () => {
      service().setImportErrors(['Línea 2: falta la referencia.']);
      await settle();

      expect(el.querySelector('app-candidate-list .csv-errors')!.textContent).toContain('Línea 2: falta la referencia.');
    });
  });

  describe('estado vacío', () => {
    it('con una orden inexistente muestra el aviso y el enlace "Volver a conciliación"', async () => {
      await render({ orderId: 'NO-EXISTE' });

      expect(el.textContent).toContain('Esta orden no requiere gestión de diferencias, o no existe.');
      expect(el.textContent).toContain('Volver a conciliación');
      expect(backLink()).not.toBeNull();
      expect(el.querySelector('app-candidate-list')).toBeNull();
    });

    it('con un medio de pago inválido muestra el estado vacío', async () => {
      await render({ tenderMedia: 'otro' });

      expect(el.textContent).toContain('Esta orden no requiere gestión de diferencias, o no existe.');
      expect(el.querySelector('.difference-management')).toBeNull();
    });
  });

  describe('guardar', () => {
    let confirm: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      await render();
      // `NzModalModule` provee su propio `NzModalService` en el componente: se espía esa instancia.
      confirm = vi
        .spyOn(fixture.debugElement.injector.get(NzModalService), 'confirm')
        .mockImplementation(() => ({}) as never);
    });

    async function writeNote(text: string): Promise<void> {
      const textarea = el.querySelector<HTMLTextAreaElement>('#match-note')!;
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    }

    const okCallback = () => (confirm.mock.calls[0][0] as unknown as { nzOnOk: () => void }).nzOnOk;

    it('la orden arranca con la liquidación sugerida seleccionada y "Guardar" deshabilitado sin nota', () => {
      expect(el.querySelector('.selected-indicator__count')!.textContent!.trim()).toBe('1');
      expect(saveButton().disabled).toBe(true);
    });

    it('con nota habilita "Guardar"; al confirmar el modal guarda, avisa y vuelve a /conciliacion', async () => {
      await writeNote('  Pago parcial verificado  ');
      expect(saveButton().disabled).toBe(false);

      saveButton().click();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(message.success).not.toHaveBeenCalled(); // nada se guarda hasta confirmar

      okCallback()();

      expect(message.success).toHaveBeenCalledWith(`Match guardado para la orden ${ORDER_ID}.`);
      expect(navigateByUrl).toHaveBeenCalledWith('/conciliacion');
    });

    it('al cancelar el modal (no llamar a nzOnOk) no guarda ni navega', async () => {
      await writeNote('Una nota');
      saveButton().click();

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(message.success).not.toHaveBeenCalled();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('sin permiso `manage_differences` el botón está deshabilitado y no se abre el modal', async () => {
      permissions = [];
      await writeNote('Una nota');

      expect(saveButton().disabled).toBe(true);
      (fixture.componentInstance as unknown as { onSave(): void }).onSave();

      expect(confirm).not.toHaveBeenCalled();
    });
  });
});
