import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ACTIVE_COUNTRY, provideCountry } from '../../../../core/country/active-country';
import { SettlementTransaction, TenderMedia } from '../../../../shared/models/reconciliation-item.model';
import { DifferenceManagementService } from '../../data/difference-management.service';
import { CandidateList } from './candidate-list';

// Orden `amount_mismatch` real del mock de efectivo.
const TENDER_MEDIA: TenderMedia = 'efectivo';
const ORDER_ID = 'CORTE-0827-02';

@Component({
  selector: 'app-host',
  imports: [CandidateList],
  providers: [DifferenceManagementService],
  template: '<app-candidate-list />',
})
class Host {}

describe('CandidateList', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  let service: DifferenceManagementService;
  const orderId = signal<string | null>(ORDER_ID);

  beforeEach(async () => {
    orderId.set(ORDER_ID);
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideCountry(ACTIVE_COUNTRY)],
    }).compileComponents();

    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    service = fixture.debugElement.injector.get(DifferenceManagementService);
    service.bindOrder(signal<TenderMedia | null>(TENDER_MEDIA), orderId);
    await settle();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const cards = () => Array.from(el.querySelectorAll<HTMLElement>('.candidate-card'));
  const refs = () => cards().map((c) => c.querySelector('.candidate-card__field--ref .candidate-card__value')!.textContent!.trim());
  const filter = () => el.querySelector<HTMLInputElement>('.candidates-card__filter')!;
  const emptyMessage = () => el.querySelector('p.text-muted')?.textContent?.trim();

  async function type(text: string): Promise<void> {
    filter().value = text;
    filter().dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  const imported = (n: number): SettlementTransaction => ({
    id: `IMP-${n}`,
    date: '2026-09-10',
    orderId: `ZZ-IMP-${n}`,
    tenderMedia: TENDER_MEDIA,
    amount: 10,
    batchId: 'CSV-IMPORTADO',
    description: 'Importada',
  });

  it('lista las liquidaciones candidatas de la orden con referencia, descripción y monto', () => {
    expect(el.querySelector('.candidates-section__title')!.textContent).toContain('Transacciones bancarias candidatas');
    expect(cards().length).toBeGreaterThan(0);
    expect(cards()).toHaveLength(service.candidates().length);
    expect(cards()[0].textContent).toContain('Referencia');
    expect(cards()[0].textContent).toContain('Descripción');
    expect(cards()[0].textContent).toContain('Monto');
  });

  it('la liquidación sugerida por el motor llega seleccionada y con su origen', () => {
    const selected = el.querySelectorAll('.candidate-card--selected');

    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('aria-checked')).toBe('true');
    expect(selected[0].textContent).toContain('Motor de cálculo');
  });

  describe('filtro por referencia', () => {
    it('filtra sin distinguir mayúsculas y recorta espacios', async () => {
      const [first] = refs();

      await type(`  ${first.toLowerCase()}  `);

      expect(refs()).toContain(first);
      expect(refs().every((r) => r.toLowerCase().includes(first.toLowerCase()))).toBe(true);
    });

    it('sin coincidencias muestra el mensaje de filtro vacío', async () => {
      await type('zzz-no-existe');

      expect(cards()).toHaveLength(0);
      expect(emptyMessage()).toBe('Ninguna transacción coincide con la referencia buscada.');
    });

    it('al borrar el filtro vuelve la lista completa', async () => {
      const total = cards().length;
      await type('zzz-no-existe');

      await type('');

      expect(cards()).toHaveLength(total);
    });
  });

  describe('selección', () => {
    it('click en una tarjeta la selecciona y otro click la deselecciona', async () => {
      const unselected = cards().find((c) => !c.classList.contains('candidate-card--selected'))!;
      const before = service.selectedCount();

      unselected.click();
      await settle();
      expect(service.selectedCount()).toBe(before + 1);
      expect(unselected.classList.contains('candidate-card--selected')).toBe(true);
      expect(unselected.getAttribute('aria-checked')).toBe('true');
      expect(unselected.textContent).toContain('Match manual');

      unselected.click();
      await settle();
      expect(service.selectedCount()).toBe(before);
      expect(unselected.getAttribute('aria-checked')).toBe('false');
    });

    it('Enter y Espacio también alternan la selección; Espacio no hace scroll', async () => {
      const target = cards().find((c) => !c.classList.contains('candidate-card--selected'))!;
      const before = service.selectedCount();

      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      expect(service.selectedCount()).toBe(before + 1);

      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      target.dispatchEvent(space);
      await settle();
      expect(service.selectedCount()).toBe(before);
      expect(space.defaultPrevented).toBe(true);
    });

    it('las tarjetas son checkbox accesibles con etiqueta por referencia', () => {
      for (const card of cards()) {
        expect(card.getAttribute('role')).toBe('checkbox');
        expect(card.getAttribute('tabindex')).toBe('0');
        expect(card.getAttribute('aria-label')).toMatch(/^Seleccionar transacción /);
      }
    });
  });

  describe('importaciones y errores', () => {
    it('muestra los errores de importación del servicio', async () => {
      expect(el.querySelector('.csv-errors')).toBeNull();

      service.setImportErrors(['Línea 2: falta la referencia.', 'Línea 3: "x" no es un monto válido.']);
      await settle();

      expect(Array.from(el.querySelectorAll('.csv-errors li')).map((li) => li.textContent!.trim())).toEqual([
        'Línea 2: falta la referencia.',
        'Línea 3: "x" no es un monto válido.',
      ]);
    });

    it('las transacciones importadas aparecen como candidatas', async () => {
      const total = cards().length;

      service.importSettlements([imported(1)]);
      await settle();

      expect(cards().length).toBeGreaterThanOrEqual(Math.min(total + 1, 20));
      await type('ZZ-IMP-1');
      expect(refs()).toEqual(['ZZ-IMP-1']);
    });

    it('una orden sin candidatos muestra el mensaje de lista vacía', async () => {
      orderId.set('NO-EXISTE');
      await settle();

      expect(cards()).toHaveLength(0);
      expect(emptyMessage()).toBe('No se encontraron transacciones candidatas. Importa un CSV para agregar más.');
    });
  });
});
