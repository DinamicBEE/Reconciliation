# ADR-0002: Estado con signals en servicios, RxJS para asincronía, sin store global

- **Estado:** Aceptada — puntos 1 a 6 aplicados (2026-10-16, rama `feature/agents`)
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

## Implementación (2026-10-16)

1. **Signals:** sin cambios necesarios; el estado de plantilla ya estaba en signals. Se añadió
   `linkedSignal` para borradores editables que se reinician al cambiar su fuente.
2. **RxJS en el borde:** `HttpClient` sigue solo en servicios; los resources convierten el
   `Observable` en signal.
3. **Resources** en lugar de `effect` + `subscribe`:
   - `core/auth/access-catalog.service.ts`: `GET /roles` + `GET /permissions` (`forkJoin`) según
     `canLoad`; `load()` = `reload()`.
   - `core/services/organization-catalog.service.ts`: un `rxResource` por catálogo
     (`/catalogs/*`); `ensureLoaded()` activa la carga y después solo reintenta los fallidos.
   - `features/sales-dashboard/data/sales-catalog.service.ts`: medios de pago y estados.
   - `user-management/roles-permissions/role-create/role-create.ts`: `GET /roles/{code}` por `:code`.
   - `user-management/user-detail/user-detail.ts`: `GET /users/{id}` por cuenta y
     `GET /users/{id}/audit-log` por cuenta + página (cancela la consulta anterior).
4. **Alcance:** `CatalogsService` (estado de una sola pantalla) pasó de `root` a `providers` de
   `Catalogs`. Los servicios `root` dejan de exponer signals escribibles: `ThemeService.mode`,
   `PaletteService.selected`, `MenuService.expanded`, filtros de `UserManagementService` y los
   catálogos son de solo lectura (`asReadonly()`/`computed`) con escritura por métodos.
5. **Sin store global:** confirmado (no hay dependencias de store en `package.json`).
6. **`effect()` solo hacia afuera.** Quedan: navegación (`App`), foco del buscador (`Header`),
   `localStorage`/DOM (`ThemeService`, `PaletteService`, `MenuService`) y sincronizar `FormGroup`
   (`Profile`, `RoleCreate`, `UserDetail`). Se eliminaron los que copiaban estado: los de limpieza
   al cerrar sesión (resources con `params` `undefined`), el de `DifferenceManagement` (el
   servicio recibe los signals de ruta con `bindOrder` y reinicia selección/nota/importados con
   `linkedSignal`), y los `set` de borradores y modo edición en `UserDetail`/`Profile`/`RoleCreate`
   (`linkedSignal`).

Cancelación: cambiar `params` a otro valor (otra cuenta, otra página, otro `:code`) aborta la
petición anterior. Pasar a `undefined` (cerrar sesión) **no** la aborta en Angular 22.1: el resource
queda en reposo y descarta la respuesta tardía, pero la petición HTTP termina igual. Es inocuo para
estos GET; si algún día importa cortar la petición, hacerlo con RxJS (`takeUntil` de la sesión).
Cubierto por los specs `access-catalog`, `sales-catalog` y `organization-catalog`.

Verificado: `pnpm build`, `pnpm test:ci` (120 tests) y recorrido manual contra el back local (login, roles,
edición de rol, detalle de usuario con bitácora y cambio de cuenta, catálogos, gestión de
diferencias) sin errores de consola.

## Alternativas consideradas

- **NgRx Store / SignalStore:** estructura y devtools, a costa de dependencia y boilerplate que el
  tamaño actual no justifica.
- **Solo RxJS (`BehaviorSubject`):** funciona, pero en zoneless obliga a `async`/`toSignal` en
  todas partes y es menos directo que signals para estado síncrono.
- **Solo signals (sin RxJS):** pierde debounce/cancelación expresivos; `HttpClient` sigue
  devolviendo `Observable`.

## Consecuencias

- Consistente con el código existente: no requiere migración.
- Las cargas por parámetro con `effect` existentes se migraron a resources (ver Implementación).
- El estado en memoria (`root`) se pierde al recargar; aceptable mientras sean mocks, y desaparece
  al conectar backend.

## Cómo verificar

- Revisión de PR: ningún `effect(() => x.set(y()))`; ningún `HttpClient` en componentes; estado de
  plantilla en signals.
- Pruebas de servicio con `TestBed` + `HttpTestingController` cubren cancelación y estados de
  carga/error.
