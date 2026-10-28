import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReconciliationResultStatus } from '../../data/reconciliation-result.model';
import { ResultStatusTag } from './result-status-tag';

describe('ResultStatusTag', () => {
  let fixture: ComponentFixture<ResultStatusTag>;

  async function render(status: ReconciliationResultStatus): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ResultStatusTag);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('nz-tag')!;
  }

  it.each([
    ['coincide', 'Coincide', 'success'],
    ['diferencia', 'Diferencia', 'warning'],
    ['sin_coincidencia', 'Sin coincidencia', 'error'],
  ] as const)('%s se muestra como "%s" con el color %s', async (status, label, color) => {
    const tag = await render(status);

    expect(tag.textContent!.trim()).toBe(label);
    expect(tag.classList.contains(`ant-tag-${color}`)).toBe(true);
  });

  it('cada estado usa un color distinto', async () => {
    const colors = new Set<string>();
    for (const status of ['coincide', 'diferencia', 'sin_coincidencia'] as const) {
      const tag = await render(status);
      colors.add(Array.from(tag.classList).find((c) => /^ant-tag-(success|warning|error)$/.test(c))!);
    }
    expect(colors.size).toBe(3);
  });

  it('al cambiar el estado actualiza etiqueta y color', async () => {
    const tag = await render('coincide');
    fixture.componentRef.setInput('status', 'sin_coincidencia');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tag.textContent!.trim()).toBe('Sin coincidencia');
    expect(tag.classList.contains('ant-tag-error')).toBe(true);
    expect(tag.classList.contains('ant-tag-success')).toBe(false);
  });
});
