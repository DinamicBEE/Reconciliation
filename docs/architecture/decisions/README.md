# Decisiones de arquitectura (ADR)

Registro de decisiones **duraderas o discutibles** del front-end. Las reglas del día a día viven en
[`../frontend-angular.md`](../frontend-angular.md); lo visual, en
[`design-system/conciliation/MASTER.md`](../../../design-system/conciliation/MASTER.md).

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-organizacion-por-feature-y-limites.md) | Organización por feature y límites entre `core`, `shared` y `features` | Aceptada (implementada) |
| [0002](0002-estado-signals-en-servicios.md) | Estado con signals en servicios, RxJS para asincronía, sin store global | Aceptada (implementada) |
| [0003](0003-formularios.md) | Reactive Forms como default; Signal Forms en piloto | Aceptada (piloto pendiente de E2E) |
| [0004](0004-sesion-y-tokens.md) | Modelo de sesión y almacenamiento de tokens | Propuesta |

## Cuándo crear una

Ver §14.3 del documento de arquitectura. Una ADR por decisión; no por preferencias de estilo.

## Formato

Archivo `NNNN-titulo-en-kebab-case.md` con: **Estado** (Propuesta, Aceptada, Reemplazada por
NNNN, Descartada), **Fecha**, **Contexto**, **Decisión**, **Alternativas consideradas**,
**Consecuencias** y **Cómo verificar**. Una ADR aceptada no se reescribe: se crea otra que la
reemplaza y se actualiza el estado de la anterior.
