# ADR-0003: Reactive Forms como default; Signal Forms en piloto

- **Estado:** Aceptada — puntos 1, 2 y 4 aplicados; punto 3 pendiente de E2E (2026-10-16, rama `feature/agents`)
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

## Implementación (2026-10-16)

1. **Reactive Forms tipados:** login, cambio de contraseña, perfil, alta/edición de rol y los
   formularios de información/organización de `UserDetail` ya usaban `NonNullableFormBuilder` o
   `FormControl` con `nonNullable`. Única desviación corregida: el **alta de usuario** mezclaba
   `infoForm` con `ngModel` + signals (roles, subsidiarias, ubicaciones, supervisor, estado) y
   validaba "al menos un rol" a mano con un toast. Ahora es `createForm` tipado con
   `Validators.required` en `roleIds`, error en línea con el patrón de MASTER, poda de ubicaciones
   por `valueChanges` y lecturas de plantilla con `toSignal` (zoneless).
2. **Filtros con `ngModel`:** todos están ligados a signals o setters de su servicio (resumen de
   venta, conciliación, catálogos, usuarios, auditoría, referencia en gestión de diferencias); no
   hay `FormGroup` creado solo para filtros. Sin cambios.
3. **Piloto de Signal Forms:** no se inicia. Su condición previa —E2E del flujo— no existe: el repo
   tiene el agente `angular-e2e`, pero no Playwright configurado ni pruebas E2E. Siguiente paso:
   E2E de cambio de contraseña (cuenta demo con `mustChangePassword`) y después el piloto en esa
   pantalla, con el resultado en una ADR nueva.
4. **Sin migraciones por migrar:** no se convirtió ningún formulario a otro estilo. "Seguridad y
   acceso" de `UserDetail` (ngModel sobre `linkedSignal` con su propio guardado) y la nota de
   gestión de diferencias (un solo campo, regla en `canSave`) se quedan como están.

Verificado: `pnpm build`, `pnpm test:ci` (120) y el alta en la app contra el back local (errores
en línea, rol requerido, poda de ubicaciones, switch de estado y reinicio al volver a
`/usuarios/nuevo`).

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
