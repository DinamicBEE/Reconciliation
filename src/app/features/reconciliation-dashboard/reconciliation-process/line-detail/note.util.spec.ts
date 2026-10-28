import { validateNote } from './note.util';

const EMPTY = 'Escribe el motivo de la acción.';
const WEAK = 'Describe el motivo con palabras completas (mínimo 10 caracteres y dos palabras).';

describe('validateNote', () => {
  it.each(['', '   ', '\n\t '])('vacío o solo espacios (%j) pide escribir el motivo', (text) => {
    expect(validateNote(text)).toBe(EMPTY);
  });

  it.each([
    ['.', 'un signo'],
    ['a', 'una letra'],
    ['aaaaaaaaaa', 'una sola letra repetida'],
    ['Comision', 'una sola palabra corta'],
    ['ok ok ok', 'menos de 10 caracteres y palabras repetidas'],
    ['..........', '10 signos sin letras'],
    ['1234567890 123', 'solo números'],
  ])('"%s" (%s) se rechaza por no describir el motivo', (text) => {
    expect(validateNote(text)).toBe(WEAK);
  });

  it('una sola palabra larga no basta (hacen falta dos palabras distintas)', () => {
    expect(validateNote('Comisionbancaria')).toBe(WEAK);
  });

  it('dos palabras idénticas repetidas no cuentan como dos palabras distintas', () => {
    expect(validateNote('Ajuste Ajuste')).toBe(WEAK);
    expect(validateNote('ajuste AJUSTE ajuste')).toBe(WEAK);
  });

  it('la palabra de una sola letra no cuenta (a b c d e f g h)', () => {
    expect(validateNote('a b c d e f g h')).toBe(WEAK);
  });

  it('menos de 10 caracteres se rechaza aunque tenga dos palabras', () => {
    expect(validateNote('pago ok')).toBe(WEAK);
  });

  it('pocas letras distintas (<4) se rechaza aunque tenga dos palabras y 10 caracteres', () => {
    expect(validateNote('aa bb aa bb aa')).toBe(WEAK);
    expect(validateNote('aab aba baa')).toBe(WEAK);
  });

  it('una nota descriptiva es válida', () => {
    expect(validateNote('Ajuste por comisión bancaria')).toBeNull();
  });

  it('acepta acentos y la ñ', () => {
    expect(validateNote('Corrección por diferencia de año')).toBeNull();
    expect(validateNote('Cobro señalado sin conciliar')).toBeNull();
  });

  it('ignora los espacios alrededor al contar el largo', () => {
    expect(validateNote('   ok ok ok   ')).toBe(WEAK);
    expect(validateNote('   Pago parcial verificado   ')).toBeNull();
  });

  it('el límite de 10 caracteres: 9 se rechaza y 10 se acepta', () => {
    expect(validateNote('abcd efgh')).toBe(WEAK); // 9
    expect(validateNote('abcd efghi')).toBeNull(); // 10
  });

  it('mayúsculas y minúsculas de una misma palabra cuentan como la misma', () => {
    expect(validateNote('Pago PAGO pago')).toBe(WEAK);
  });
});
