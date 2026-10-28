import {
  MOCK_AREAS,
  MOCK_CARGOS,
  MOCK_DEMO_PASSWORDS,
  MOCK_DEPARTAMENTOS,
  MOCK_PERMISSIONS,
  MOCK_PUESTOS,
  MOCK_ROLES,
  MOCK_SUBSIDIARIAS,
  MOCK_UBICACIONES,
} from './auth-mock.data';

const unique = (values: readonly unknown[]) => new Set(values).size === values.length;

describe('auth-mock.data', () => {
  it.each([
    ['subsidiarias', MOCK_SUBSIDIARIAS],
    ['ubicaciones', MOCK_UBICACIONES],
    ['cargos', MOCK_CARGOS],
    ['puestos', MOCK_PUESTOS],
    ['departamentos', MOCK_DEPARTAMENTOS],
    ['áreas', MOCK_AREAS],
  ])('los ids de %s son únicos y tienen nombre', (_name, catalog) => {
    expect(catalog.length).toBeGreaterThan(0);
    expect(unique(catalog.map((c) => c.id))).toBe(true);
    expect(catalog.every((c) => c.nombre.trim().length > 0)).toBe(true);
  });

  it('hay 2 empresas y 16 tiendas', () => {
    expect(MOCK_SUBSIDIARIAS).toHaveLength(2);
    expect(MOCK_UBICACIONES).toHaveLength(16);
  });

  it('los nombres de las tiendas no se repiten', () => {
    expect(unique(MOCK_UBICACIONES.map((u) => u.nombre))).toBe(true);
  });

  it('cada ubicación apunta a una subsidiaria existente y cada empresa tiene tiendas', () => {
    const subsidiariaIds = MOCK_SUBSIDIARIAS.map((s) => s.id);

    expect(MOCK_UBICACIONES.every((u) => subsidiariaIds.includes(u.subsidiariaId))).toBe(true);
    for (const id of subsidiariaIds) {
      expect(MOCK_UBICACIONES.filter((u) => u.subsidiariaId === id)).toHaveLength(8);
    }
  });

  it('los códigos de roles y de permisos son únicos', () => {
    expect(unique(MOCK_ROLES.map((r) => r.code))).toBe(true);
    expect(unique(MOCK_PERMISSIONS.map((p) => p.code))).toBe(true);
  });

  it('los permisos por defecto de cada rol existen en el catálogo de permisos', () => {
    const codes = MOCK_PERMISSIONS.map((p) => p.code);

    for (const role of MOCK_ROLES) {
      expect(role.defaultPermissions.every((p) => codes.includes(p))).toBe(true);
    }
  });

  it('las cuentas demo tienen contraseña no vacía', () => {
    expect(MOCK_DEMO_PASSWORDS['admin@conciliacion.mx']).toBe('Conciliacion2026');
    expect(Object.values(MOCK_DEMO_PASSWORDS).every((p) => p.length >= 8)).toBe(true);
  });
});
