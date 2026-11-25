import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProcessingIndicator } from './processing-indicator';

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('ProcessingIndicator', () => {
  let fixture: ComponentFixture<ProcessingIndicator>;
  let el: HTMLElement;

  async function render(inputs: { title: string; subtitles?: string[]; percent?: number }): Promise<void> {
    await TestBed.configureTestingModule({ imports: [ProcessingIndicator] }).compileComponents();
    fixture = TestBed.createComponent(ProcessingIndicator);
    el = fixture.nativeElement as HTMLElement;
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await update();
  }

  async function update(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const subtitles = () => Array.from(el.querySelectorAll('.validation__subtitle')).map((s) => norm(s.textContent));
  const progressText = () => norm(el.querySelector('.ant-progress-text')?.textContent);

  it('pinta los engranes, el título y la barra dentro de un estado accesible', async () => {
    await render({ title: 'Procesando información...' });

    const root = el.querySelector('.validation')!;
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelectorAll('.gears .gear')).toHaveLength(2);
    expect(el.querySelector('.gears')!.getAttribute('aria-hidden')).toBe('true');
    expect(norm(el.querySelector('.validation__title')?.textContent)).toBe('Procesando información...');
    expect(el.querySelector('nz-progress')).not.toBeNull();
  });

  it('pinta un subtítulo por línea, en orden', async () => {
    await render({ title: 'Reconciliando...', subtitles: ['Primera línea.', 'Segunda línea.'] });

    expect(subtitles()).toEqual(['Primera línea.', 'Segunda línea.']);
  });

  it('sin subtítulos no pinta ninguno', async () => {
    await render({ title: 'Reconciliando...' });

    expect(subtitles()).toEqual([]);
    expect(el.querySelector('.validation__title')).not.toBeNull();
  });

  it('el porcentaje llega a la barra y se actualiza', async () => {
    await render({ title: 'Procesando', percent: 40 });
    expect(progressText()).toBe('40%');

    fixture.componentRef.setInput('percent', 100);
    await update();

    expect(progressText()).toBe('100%');
  });

  it('por defecto la barra empieza en 0%', async () => {
    await render({ title: 'Procesando' });

    expect(progressText()).toBe('0%');
  });

  it('cambiar el título y los subtítulos actualiza el texto', async () => {
    await render({ title: 'Uno', subtitles: ['a'] });

    fixture.componentRef.setInput('title', 'Dos');
    fixture.componentRef.setInput('subtitles', ['b', 'c']);
    await update();

    expect(norm(el.querySelector('.validation__title')?.textContent)).toBe('Dos');
    expect(subtitles()).toEqual(['b', 'c']);
  });
});
