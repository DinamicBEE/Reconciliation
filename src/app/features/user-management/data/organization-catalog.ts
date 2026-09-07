// Catálogos fijos para la pestaña "Organización" — todos sus campos son
// selectores, no texto libre (a diferencia de "Información general"), así
// que necesitan una lista de opciones cerrada. Listas planas (Área no se
// filtra por Departamento) — cascada explícita sería sobre-ingeniería para
// 3 selects de un módulo administrativo interno.
export const DEPARTMENTS: string[] = ['Finanzas', 'Tecnología', 'Auditoría Interna', 'Recursos Humanos', 'Operaciones'];

export const AREAS: string[] = ['Conciliación Bancaria', 'Tesorería', 'Sistemas', 'Cumplimiento', 'Contabilidad'];

export const JOB_TITLES: string[] = [
  'Analista de Conciliación',
  'Supervisor de Conciliación',
  'Administrador de Plataforma',
  'Auditor de Procesos',
  'Supervisor de Tesorería',
];
