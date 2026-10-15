# ADR-0002: Estado con signals en servicios, RxJS para asincronía, sin store global

- **Estado:** Propuesta
- **Fecha:** 2026-10-15

## Contexto

La app es zoneless (sin `zone.js`) y en Angular 22 `OnPush` es el default, así que la vista se
actualiza por signals, eventos de plantilla y `async`. El código ya usa: servicios de pantalla
provistos por componente con signals (`SalesDashboardService`, `ReconciliationService`,
`DifferenceManagementService`), servicios `root` para lo que cruza rutas (`AuthService`,
`UserManagementService`, `ResolvedMatchesStore`, `ReconciliationOverridesStore`) y RxJS para HTTP
con debounce y cancelación (`toObservable` → `debounceTime` → `switchMap`). Hay ~15 `effect()`,
algunos para disparar cargas al cambiar un parámetro de ruta. Angular 22 ofrece como API pública
`resource`, `rxResource`, `httpResource` y `linkedSignal`.

## Decisión

1. **Signals** para todo estado que lea una plantilla y para derivados (`computed`,
   `linkedSignal`).
2. **RxJS** para HTTP, composición asíncrona, debounce, cancelación, reintentos y paginación
   recursiva; se convierte a signal en el borde (`toSignal` o `subscribe` que hace `set`).
3. **Resources** (`httpResource`/`rxResource`) como opción preferida en código nuevo para lecturas
   que dependen de signals (detalle por id de ruta), en lugar de `effect` + `subscribe`.
4. **Alcance del estado:** de pantalla → servicio `@Injectable()` en `providers` del componente;
   entre rutas → servicio `root` con escritura solo por métodos.
5. **Sin store global** (NgRx Store/SignalStore u otro). Se reconsidera con ADR si aparece al menos
   uno de estos disparadores: estado de negocio editado desde 3+ features con reglas de
   consistencia entre ellas; necesidad de deshacer/rehacer o historial; caché compartida con
   invalidación compleja que los servicios no resuelvan con claridad.
6. `effect()` solo para efectos hacia afuera (storage, DOM, navegación, sincronizar un
   `FormGroup`); nunca para copiar un signal en otro.

## Alternativas consideradas

- **NgRx Store / SignalStore:** estructura y devtools, a costa de dependencia y boilerplate que el
  tamaño actual no justifica.
- **Solo RxJS (`BehaviorSubject`):** funciona, pero en zoneless obliga a `async`/`toSignal` en
  todas partes y es menos directo que signals para estado síncrono.
- **Solo signals (sin RxJS):** pierde debounce/cancelación expresivos; `HttpClient` sigue
  devolviendo `Observable`.

## Consecuencias

- Consistente con el código existente: no requiere migración.
- Las cargas por parámetro con `effect` existentes se migran a resources solo al tocar esas
  pantallas.
- El estado en memoria (`root`) se pierde al recargar; aceptable mientras sean mocks, y desaparece
  al conectar backend.

## Cómo verificar

- Revisión de PR: ningún `effect(() => x.set(y()))`; ningún `HttpClient` en componentes; estado de
  plantilla en signals.
- Pruebas de servicio con `TestBed` + `HttpTestingController` cubren cancelación y estados de
  carga/error.
