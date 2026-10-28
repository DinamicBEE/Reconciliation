import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TenderMedia } from '../../../../shared/models/reconciliation-item.model';
import { DifferenceManagementService } from '../../data/difference-management.service';
import { SettlementsImport } from './settlements-import';

@Component({
  selector: 'app-host',
  imports: [SettlementsImport],
  providers: [DifferenceManagementService],
  template: '<app-settlements-import [tenderMedia]="tenderMedia()" />',
})
class Host {
  readonly tenderMedia = signal<TenderMedia | null>('efectivo');
}

const VALID_CSV = ['referencia,descripcion,monto,fecha', 'IMP-1,Depósito uno,100.50,2026-09-10', 'IMP-2,,200,2026-09-11'].join('\n');
const MIXED_CSV = ['IMP-1,Depósito uno,100,2026-09-10', ',sin ref,10,2026-09-10', 'IMP-3,Monto malo,abc,2026-09-10'].join('\n');
const INVALID_CSV = ['IMP-1,Sin fecha válida,100,10/09/2026', 'solo-una-columna'].join('\n');

describe('SettlementsImport', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  let service: DifferenceManagementService;
  let message: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };
  let importSettlements: ReturnType<typeof vi.spyOn>;
  let setImportErrors: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    message = { success: vi.fn(), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: NzMessageService, useValue: message }],
    }).compileComponents();

    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    service = fixture.debugElement.injector.get(DifferenceManagementService);
    importSettlements = vi.spyOn(service, 'importSettlements');
    setImportErrors = vi.spyOn(service, 'setImportErrors');
    fixture.detectChanges();
  });

  const input = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;
  const csv = (content: string, name = 'liquidaciones.csv') => new File([content], name, { type: 'text/csv' });

  // El componente lee con `FileReader`: se espera a que termine el `onload`.
  async function pick(file: File | undefined, calls = 1): Promise<void> {
    Object.defineProperty(input(), 'files', { value: file ? [file] : [], configurable: true });
    input().dispatchEvent(new Event('change', { bubbles: true }));
    if (!file) return;
    await vi.waitFor(() => expect(setImportErrors.mock.calls.length + importSettlements.mock.calls.length).toBeGreaterThanOrEqual(calls));
  }

  it('muestra el botón "Importar CSV" y el input solo acepta CSV', () => {
    expect(el.querySelector('.import-dropzone')!.textContent).toContain('Importar CSV');
    expect(input().accept).toContain('.csv');
    expect(input().hidden).toBe(true);
  });

  it('el botón abre el selector de archivos', () => {
    const click = vi.spyOn(input(), 'click').mockImplementation(() => undefined);

    el.querySelector<HTMLButtonElement>('.import-dropzone')!.click();

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('un CSV válido importa las filas, limpia los errores y avisa con success', async () => {
    await pick(csv(VALID_CSV));

    expect(importSettlements).toHaveBeenCalledTimes(1);
    const rows = importSettlements.mock.calls[0][0] as { orderId: string; amount: number; tenderMedia: string }[];
    expect(rows.map((r) => [r.orderId, r.amount, r.tenderMedia])).toEqual([
      ['IMP-1', 100.5, 'efectivo'],
      ['IMP-2', 200, 'efectivo'],
    ]);
    expect(setImportErrors).toHaveBeenCalledWith([]);
    expect(service.importedCount()).toBe(2);
    expect(service.importErrors()).toEqual([]);
    expect(message.success).toHaveBeenCalledWith('Se importaron 2 transacción(es) del CSV.');
    expect(message.warning).not.toHaveBeenCalled();
  });

  it('un CSV con líneas inválidas importa las buenas y avisa de las rechazadas con warning', async () => {
    await pick(csv(MIXED_CSV));

    expect(service.importedCount()).toBe(1);
    expect(service.importErrors()).toHaveLength(2);
    expect(service.importErrors()[0]).toContain('Línea 2');
    expect(service.importErrors()[1]).toContain('Línea 3');
    expect(message.success).toHaveBeenCalledWith('Se importaron 1 transacción(es) del CSV.');
    expect(message.warning).toHaveBeenCalledWith('2 línea(s) del CSV no se pudieron importar.');
  });

  it('un CSV sin filas válidas solo avisa con warning y deja los errores', async () => {
    await pick(csv(INVALID_CSV));

    expect(importSettlements).toHaveBeenCalledWith([]);
    expect(service.importedCount()).toBe(0);
    expect(service.importErrors()).toHaveLength(2);
    expect(message.success).not.toHaveBeenCalled();
    expect(message.warning).toHaveBeenCalledWith('2 línea(s) del CSV no se pudieron importar.');
  });

  it('un archivo vacío registra el error "El archivo está vacío."', async () => {
    await pick(csv(''));

    expect(service.importErrors()).toEqual(['El archivo está vacío.']);
    expect(message.warning).toHaveBeenCalledWith('1 línea(s) del CSV no se pudieron importar.');
  });

  it('sin medio de pago no importa nada ni avisa', async () => {
    fixture.componentInstance.tenderMedia.set(null);
    fixture.detectChanges();
    const read = vi.spyOn(FileReader.prototype, 'readAsText');

    Object.defineProperty(input(), 'files', { value: [csv(VALID_CSV)], configurable: true });
    input().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(importSettlements).not.toHaveBeenCalled();
    expect(setImportErrors).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
    expect(message.warning).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it('sin archivo elegido (cancelar el selector) no hace nada', async () => {
    await pick(undefined);

    expect(importSettlements).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });

  it('se puede importar un segundo archivo y las filas se acumulan', async () => {
    await pick(csv(VALID_CSV));
    await pick(csv('IMP-9,Otro,50,2026-09-12'), 2);
    await vi.waitFor(() => expect(service.importedCount()).toBe(3));

    expect(importSettlements).toHaveBeenCalledTimes(2);
  });
});
