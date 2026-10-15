import { toRoleCode } from './role-code.util';

describe('toRoleCode', () => {
  it('convierte el nombre a MAYÚSCULAS separadas por guion bajo', () => {
    expect(toRoleCode('Contabilidad Sur')).toBe('CONTABILIDAD_SUR');
  });

  it('elimina acentos y diacríticos', () => {
    expect(toRoleCode('Gestión Ñandú')).toBe('GESTION_NANDU');
  });

  it('colapsa separadores y recorta guiones bajos de los extremos', () => {
    expect(toRoleCode('  --Admin  /  Global!! ')).toBe('ADMIN_GLOBAL');
  });

  it('limita el código a 40 caracteres sin dejar guion bajo final', () => {
    const code = toRoleCode(`${'A'.repeat(39)} B`);
    expect(code).toBe('A'.repeat(39));
    expect(code.length).toBeLessThanOrEqual(40);
  });

  it('devuelve "ROL" cuando el nombre no tiene caracteres válidos', () => {
    expect(toRoleCode('')).toBe('ROL');
    expect(toRoleCode('¿?¡!')).toBe('ROL');
  });
});
