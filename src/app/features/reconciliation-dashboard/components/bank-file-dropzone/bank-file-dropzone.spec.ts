import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BankFileDropzone } from './bank-file-dropzone';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xlsx = (name = 'extracto.xlsx', content = 'contenido') => new File([content], name, { type: XLSX_TYPE });
const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('BankFileDropzone', () => {
  let fixture: ComponentFixture<BankFileDropzone>;
  let el: HTMLElement;
  let message: { error: ReturnType<typeof vi.fn> };
  let selected: File[];

  beforeEach(async () => {
    message = { error: vi.fn() };
    selected = [];
    await TestBed.configureTestingModule({
      imports: [BankFileDropzone],
      providers: [{ provide: NzMessageService, useValue: message }],
    }).compileComponents();

    fixture = TestBed.createComponent(BankFileDropzone);
    el = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.selected.subscribe((file) => selected.push(file));
    fixture.detectChanges();
  });

  const zone = () => el.querySelector<HTMLElement>('.import-dropzone-row')!;
  const button = () => el.querySelector<HTMLButtonElement>('button.import-dropzone')!;
  const input = () => el.querySelector<HTMLInputElement>('input[type="file"]')!;
  const loaded = () => el.querySelector<HTMLElement>('.file-loaded');

  function drop(files: File[]): Event {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    zone().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function pick(file: File): void {
    Object.defineProperty(input(), 'files', { value: [file], configurable: true });
    input().dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  it('el botón lleva el label en dos filas y un icono', () => {
    const rows = Array.from(button().querySelectorAll('.import-dropzone__label > span')).map((s) => norm(s.textContent));

    expect(button().type).toBe('button');
    expect(button().querySelector('svg')).not.toBeNull();
    expect(rows).toEqual(['Arrastra tu archivo aquí', 'o selecciona un archivo']);
  });

  it('el input solo acepta .xlsx', () => {
    expect(input().accept).toContain('.xlsx');
    expect(input().accept).not.toContain('.csv');
    expect(input().hidden).toBe(true);
  });

  it('el botón abre el selector de archivos', () => {
    const click = vi.spyOn(input(), 'click');

    button().click();

    expect(click).toHaveBeenCalledTimes(1);
  });

  describe('selector', () => {
    it('elegir un .xlsx emite el archivo', () => {
      const file = xlsx();

      pick(file);

      expect(selected).toEqual([file]);
      expect(message.error).not.toHaveBeenCalled();
    });

    it('limpia el input para poder elegir de nuevo el mismo archivo', () => {
      const value = vi.spyOn(input(), 'value', 'set');

      pick(xlsx());

      expect(value).toHaveBeenCalledWith('');
    });

    it('elegir un .csv avisa con message.error y no emite', () => {
      pick(new File(['a,b'], 'extracto.csv', { type: 'text/csv' }));

      expect(message.error).toHaveBeenCalledTimes(1);
      expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
      expect(selected).toHaveLength(0);
    });

    it('sin archivo (cancelar el selector) no emite ni avisa', () => {
      Object.defineProperty(input(), 'files', { value: [], configurable: true });
      input().dispatchEvent(new Event('change', { bubbles: true }));

      expect(selected).toHaveLength(0);
      expect(message.error).not.toHaveBeenCalled();
    });
  });

  describe('arrastrar y soltar', () => {
    it('soltar un .xlsx emite el archivo y cancela la acción por defecto', () => {
      const file = xlsx('banco.xlsx');

      const event = drop([file]);

      expect(selected).toEqual([file]);
      expect(event.defaultPrevented).toBe(true);
    });

    it('la extensión se valida sin distinguir mayúsculas (.XLSX)', () => {
      drop([xlsx('EXTRACTO.XLSX')]);

      expect(selected).toHaveLength(1);
      expect(message.error).not.toHaveBeenCalled();
    });

    it.each(['extracto.csv', 'extracto.txt', 'extracto.xls', 'foto.png', 'extracto.xlsx.bak', 'xlsx'])(
      'soltar "%s" avisa con message.error y no emite',
      (name) => {
        drop([new File(['x'], name)]);

        expect(message.error).toHaveBeenCalledWith('El archivo bancario debe ser un .xlsx.');
        expect(selected).toHaveLength(0);
      },
    );

    it('soltar sin archivos no emite ni avisa', () => {
      drop([]);

      expect(selected).toHaveLength(0);
      expect(message.error).not.toHaveBeenCalled();
    });

    it('con varios archivos toma el primero', () => {
      const first = xlsx('uno.xlsx');

      drop([first, xlsx('dos.xlsx')]);

      expect(selected).toEqual([first]);
    });

    it('arrastrar encima marca el botón y soltar lo desmarca', () => {
      const over = new Event('dragover', { bubbles: true, cancelable: true });
      zone().dispatchEvent(over);
      fixture.detectChanges();

      expect(over.defaultPrevented).toBe(true);
      expect(button().classList.contains('import-dropzone--over')).toBe(true);

      drop([xlsx()]);
      expect(button().classList.contains('import-dropzone--over')).toBe(false);
    });

    it('salir del contenedor desmarca el botón', () => {
      zone().dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      zone().dispatchEvent(new Event('dragleave', { bubbles: true }));
      fixture.detectChanges();

      expect(button().classList.contains('import-dropzone--over')).toBe(false);
    });

    it('moverse entre los hijos del contenedor no desmarca el botón', () => {
      zone().dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
      const leave = new Event('dragleave', { bubbles: true });
      Object.defineProperty(leave, 'relatedTarget', { value: button() });

      zone().dispatchEvent(leave);
      fixture.detectChanges();

      expect(button().classList.contains('import-dropzone--over')).toBe(true);
    });
  });

  describe('archivo cargado', () => {
    it('sin archivo no muestra el indicador', () => {
      expect(loaded()).toBeNull();
    });

    it('con archivo muestra nombre, mensaje y tamaño', () => {
      fixture.componentRef.setInput('file', xlsx('banco-julio.xlsx', 'x'.repeat(2048)));
      fixture.detectChanges();

      expect(norm(loaded()!.querySelector('.file-loaded__name')?.textContent)).toBe('banco-julio.xlsx');
      expect(loaded()!.querySelector('.file-loaded__name')?.getAttribute('title')).toBe('banco-julio.xlsx');
      expect(norm(loaded()!.querySelector('.file-loaded__meta')?.textContent)).toBe(
        'Archivo cargado correctamente · 2.0 KB',
      );
      expect(loaded()!.querySelector('svg')).not.toBeNull();
    });

    it('vuelve a ocultarse si el archivo se quita', () => {
      fixture.componentRef.setInput('file', xlsx());
      fixture.detectChanges();
      fixture.componentRef.setInput('file', null);
      fixture.detectChanges();

      expect(loaded()).toBeNull();
    });

    it.each([
      [0, '0 B'],
      [1023, '1023 B'],
      [1024, '1.0 KB'],
      [1536, '1.5 KB'],
      [1024 * 1024 - 1, '1024.0 KB'],
      [1024 * 1024, '1.0 MB'],
      [5.25 * 1024 * 1024, '5.3 MB'],
    ])('el tamaño de %d bytes se ve como %s', (bytes, text) => {
      const file = new File(['x'], 'a.xlsx');
      Object.defineProperty(file, 'size', { value: bytes });
      fixture.componentRef.setInput('file', file);
      fixture.detectChanges();

      expect(norm(loaded()!.querySelector('.file-loaded__meta')?.textContent)).toContain(text);
    });

    it('no emite por sí solo: mostrar el archivo no dispara `selected`', () => {
      fixture.componentRef.setInput('file', xlsx());
      fixture.detectChanges();

      expect(selected).toHaveLength(0);
    });
  });
});
