# ADR-0003: Reactive Forms como default; Signal Forms en piloto

- **Estado:** Propuesta
- **Fecha:** 2026-10-15

## Contexto

- Formularios de captura con validación (login, cambio de contraseña, perfil, alta/edición de rol,
  detalle de usuario) usan **Reactive Forms** con `FormBuilder`, integrados con
  `nz-form-control [nzErrorTip]` de ng-zorro.
- Filtros de tabla y controles sueltos usan `[(ngModel)]` (`FormsModule`).
- En Angular 22.1.3 instalado, `@angular/forms/signals` (`form()`, `[formField]`, validadores)
  está marcado `@publicApi 22.0`; solo `provideExperimentalWebMcpForms` sigue experimental. Existe
  `@angular/forms/signals/compat` para interoperar con Reactive Forms.
- `[formField]` admite controles que implementan `ControlValueAccessor` "por compatibilidad", que
  es como se integran los controles de ng-zorro 22.0.1. ng-zorro no publica una integración propia
  con Signal Forms (no hay referencias en sus tipos instalados), y su visualización de errores
  (`nzErrorTip`, `nzValidateStatus`) está pensada para `NgControl`.

## Decisión

1. **Default para formularios con validación y envío:** Reactive Forms **tipados**
   (`fb.nonNullable`, `FormGroup<T>`).
2. **Filtros y controles sin validación:** `ngModel` ligado a signals/setters del servicio, o
   `model()`; no se crea un `FormGroup` solo para filtros.
3. **Signal Forms:** piloto en **un** formulario pequeño y nuevo (o el de cambio de contraseña al
   rehacerlo), después de tener E2E del flujo. Criterios para adoptarlo como default (nueva ADR):
   controles ng-zorro (`nz-input`, `nz-select`, `nz-date-picker`, `nz-input-password`) funcionan
   con `[formField]`; errores visibles y accesibles con el patrón de MASTER sin hacks; pruebas
   unitarias y E2E simples; no aumenta el código respecto de Reactive Forms.
4. No convertir formularios existentes solo por migrar.

## Alternativas consideradas

- **Adoptar Signal Forms ya como default:** encaja con la app zoneless/signals, pero la
  integración de errores con ng-zorro no está verificada en este repo; elegir por novedad.
- **Template-driven (`ngModel`) para todo:** menos tipado y validación más dispersa en
  formularios grandes como `user-detail`.

## Consecuencias

- Sin migración inmediata. Dos estilos conviven con un criterio claro.
- El piloto produce evidencia concreta para decidir; su resultado se registra en una ADR nueva.

## Cómo verificar

- Revisión de PR: formularios nuevos con validación usan `FormGroup` tipado (o son el piloto
  aprobado).
- En el piloto: prueba de accesibilidad de errores (`getByRole`/`getByLabel` en E2E).
