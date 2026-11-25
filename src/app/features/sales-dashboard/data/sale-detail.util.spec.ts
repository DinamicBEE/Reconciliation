import { SaleDetail } from './sales-api.service';
import { cardLabel, customerDocumentLabel, dianCodesLabel, taxLabel } from './sale-detail.util';

type Customer = NonNullable<SaleDetail['customer']>;

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    documentType: { code: '31', description: 'NIT' },
    document: '900123456',
    checkDigit: '7',
    name: 'Mariscos S.A.S.',
    email: null,
    phone: null,
    mobilePhone: null,
    address: null,
    personType: null,
    taxRegime: null,
    finalConsumer: false,
    ...overrides,
  };
}

describe('customerDocumentLabel', () => {
  it('une tipo de documento, número y dígito de verificación', () => {
    expect(customerDocumentLabel(customer())).toBe('NIT 900123456-7');
  });

  it('sin dígito de verificación muestra solo el número', () => {
    expect(customerDocumentLabel(customer({ documentType: { code: '13', description: 'Cédula de ciudadanía' }, checkDigit: null }))).toBe(
      'Cédula de ciudadanía 900123456',
    );
  });

  it('un dígito de verificación vacío se trata como ausente', () => {
    expect(customerDocumentLabel(customer({ checkDigit: '' }))).toBe('NIT 900123456');
  });

  it('sin tipo de documento muestra el número (con dígito si lo hay)', () => {
    expect(customerDocumentLabel(customer({ documentType: null }))).toBe('900123456-7');
    expect(customerDocumentLabel(customer({ documentType: null, checkDigit: null }))).toBe('900123456');
  });
});

describe('dianCodesLabel', () => {
  it('lista los códigos como "código descripción" separados por coma', () => {
    expect(
      dianCodesLabel([
        { code: '10', description: 'Efectivo' },
        { code: '48', description: 'Tarjeta Crédito' },
      ]),
    ).toBe('10 Efectivo, 48 Tarjeta Crédito');
  });

  it('con un solo código no agrega separador', () => {
    expect(dianCodesLabel([{ code: '10', description: 'Efectivo' }])).toBe('10 Efectivo');
  });

  it('sin códigos devuelve "—"', () => {
    expect(dianCodesLabel([])).toBe('—');
  });
});

describe('cardLabel', () => {
  it('une franquicia y adquirente con " · "', () => {
    expect(cardLabel('VISA', 'Credibanco')).toBe('VISA · Credibanco');
  });

  it('con solo uno de los dos muestra ese', () => {
    expect(cardLabel('MASTERCARD', null)).toBe('MASTERCARD');
    expect(cardLabel(null, 'Redeban')).toBe('Redeban');
  });

  it('sin franquicia ni adquirente (no es tarjeta) devuelve "—"', () => {
    expect(cardLabel(null, null)).toBe('—');
    expect(cardLabel('', '')).toBe('—');
  });
});

describe('taxLabel', () => {
  it.each([
    ['01', 'IVA (01)'],
    ['02', 'IC (02)'],
    ['03', 'ICA (03)'],
    ['04', 'INC (04)'],
    ['22', 'Impuesto a las bolsas (22)'],
  ])('el código %s se muestra como "%s"', (code, expected) => {
    expect(taxLabel(code)).toBe(expected);
  });

  it('un código que no está en el catálogo se muestra tal cual', () => {
    expect(taxLabel('ZZ')).toBe('ZZ');
  });
});
