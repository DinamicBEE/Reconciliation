# Arquitectura front-end — Portal de conciliación (Angular 22)

| | |
|---|---|
| Estado | **Propuesta inicial** — vigente como lineamiento una vez que el equipo la acepte (ver §16) |
| Fecha | 2026-10-15 |
| Verificado contra | `@angular/core` 22.1.3, `@angular/build`/`@angular/cli` 22.1.5, `ng-zorro-antd` 22.0.1, TypeScript 6.0.3, Vitest 4.1.11, Node 24.18.1 (instalados en el repo) |
| Decisiones duraderas | [`decisions/`](decisions/README.md) (ADRs) |

## 0. Cómo usar este documento

Jerarquía de fuentes, de mayor a menor prioridad, para cualquier cambio en el front:

1. **Requisitos de producto y contratos del backend** (`docs/*.pdf`, `docs/api-endpoints.csv`,
   guía de endpoints del equipo de back). Este documento no los reemplaza ni los inventa.
2. **`CLAUDE.md`**: reglas cortas obligatorias (page-header, botones, tablas, versionado de `docs/`).
3. **[`design-system/conciliation/MASTER.md`](../../design-system/conciliation/MASTER.md)**: fuente de
   verdad **visual** (tokens, tipografía, densidad, componentes, patrones de pantalla). Este documento
   no la duplica: cuando algo es visual, manda MASTER.
4. **Este documento**: estructura, límites entre capas, routing, estado, DI, formularios, acceso a
   API, seguridad del front, pruebas, calidad y evolución.
5. **ADRs** en `docs/architecture/decisions/`: el porqué de las decisiones duraderas o discutibles.

Convención de este documento: **"Observado"** = verificado en el código o la configuración en la
fecha indicada; **"Objetivo"** = lo que se pide para código nuevo o se propone migrar; **"Supuesto"**
= no verificado, pendiente de confirmar.

---

## 1. Contexto, alcance y restricciones

**Producto (observado en `docs/` y el código):** portal interno de conciliación bancaria
multi-tender (BBVA, Rappi, DiDi Food, Efectivo y medios del POS) para México y Colombia. Pantallas:
login y cambio obligatorio de contraseña, Resumen de venta (`/dashboard`), Conciliación
(`/conciliacion`) y Gestión de diferencias, Catálogos cargados, Perfil, Administración de usuarios
(lista, detalle, auditoría) y Roles y permisos (exclusiva de ADMIN).

**Backend (observado):** un único Gateway (`coctel_midd`, rama DEV) que enruta `/auth`, `/users`,
`/roles`, `/permissions`, `/audit-log`, `/sales` y `/catalogs` (`proxy.conf.js`). Autenticación
con access token Bearer + refresh token de un solo uso. Los permisos efectivos los devuelve el
backend en el login y en `GET /auth/me`.

**Alcance:** la aplicación Angular `conciliation` (única del workspace; `angular.json` sin
`projects/`, no es monorepo). Fuera de alcance: backend, base de datos, pipelines del Gateway.

**Restricciones:**

- Proyecto **existente**: se preserva lo que funciona; los cambios estructurales son incrementales
  y no se hacen migraciones masivas sin petición explícita.
- Es una SPA servida como estáticos (Vercel, `vercel.json` con rewrite a `index.html`). **No hay
  SSR** y no se requiere: es un portal autenticado e interno, sin necesidad de SEO.
- Dos países con el mismo código: `environment.country` (`MX` | `CO`) elegido en build
  (`build:co` / `start:co`).

**Objetivos de la arquitectura:** terminar la transición de mocks a endpoints reales sin romper
pantallas; mantener límites claros entre sesión/acceso, features y piezas compartidas; pruebas de
comportamiento en CI; y un front que no confíe en sí mismo para la seguridad.

---

## 2. Estado actual (observado)

### 2.1 Workspace y herramientas

| Aspecto | Observado | Archivo |
|---|---|---|
| Angular | 22.1.3, standalone, bootstrap con `bootstrapApplication` | `package.json`, `src/main.ts` |
| Detección de cambios | **Zoneless** (sin `zone.js` ni polyfills). En 22, `OnPush` es el default (`ChangeDetectionStrategy.Eager` es el opt-out). 21 de 22 componentes declaran `OnPush` explícito | `angular.json`, `node_modules/@angular/core` typings |
| Builder | `@angular/build:application` (esbuild), `dev-server` con proxy | `angular.json` |
| Pruebas unitarias | `@angular/build:unit-test` + Vitest 4 + jsdom. 7 archivos, 72 pruebas, **todas pasan** (`pnpm test:ci`, 2026-10-15) | `angular.json`, `tsconfig.spec.json` |
| E2E | **Playwright no está instalado** ni configurado (no hay `@playwright/test`, `playwright.config.*` ni `e2e/`). Solo existe el agente `angular-e2e` para configurarlo | `package.json`, `.claude/agents/angular-e2e.md` |
| TypeScript | 6.0.3. `tsconfig.json` no declara `strict`, pero en TS 6 las opciones estrictas son `true` salvo que `strict: false`; el código compila igual con `--strict` explícito (0 errores). `strictTemplates` es default en Angular 22 (`!== false`) | `tsconfig.json` |
| Formato | Prettier 3 (`printWidth: 100`, comillas simples, parser `angular` en HTML), **sin script** en `package.json` | `.prettierrc` |
| Lint | **No hay ESLint** ni reglas de límites entre carpetas | `package.json` |
| CI | **No hay CI** en el repo (`.github/` no existe). El único pipeline es el build de Vercel | `vercel.json`, `README.md` |
| Build prod | Compila. Inicial 672 kB raw / 169 kB transferidos (budget 1 MB/2 MB). **5 warnings** de budget `anyComponentStyle` (4 kB): `user-detail.scss` 6.79 kB, `reconciliation-dashboard.scss` 5.97 kB, `difference-management.scss` 4.89 kB, `sales-dashboard.scss` 4.71 kB, `role-create.scss` 4.02 kB | `pnpm build`, 2026-10-15 |
| Package manager | pnpm 11.1.2 (`packageManager`), `pnpm-workspace.yaml` solo para `allowBuilds` | `package.json` |
| Node | Angular 22 exige `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`; local 24.18.1 | `node_modules/@angular/core/package.json` |

### 2.2 Estructura de `src/app`

```
src/app/
├── app.ts / app.config.ts / app.routes.ts   # raíz, providers globales, rutas (todas lazy salvo Shell)
├── core/
│   ├── auth/           # sesión (AuthService), AccessControlService, AccessCatalogService, auth-errors, guards
│   ├── country/        # provideCountry(), COUNTRY_PROFILE, MoneyPipe (MX/CO)
│   ├── interceptors/   # authTokenInterceptor, httpErrorAlertInterceptor
│   ├── layout/         # shell, header, menu
│   └── services/       # tema, paleta, menú, catálogos organizacionales (/catalogs/*), CatalogService
├── features/<feature>/
│   ├── data/           # api-services (HTTP), servicios de estado, modelos, mocks, utils puros
│   └── <pantalla>/     # componentes (ts/html/scss)
└── shared/
    ├── components/     # tags de estado, sparkline, radial-progress
    ├── data/           # ResolvedMatchesStore, ReconciliationOverridesStore (root, en memoria)
    ├── mock-data/      # datasets mock usados por 2+ features
    ├── models/ utils/ styles/
```

MASTER.md ("Estructura de carpetas") ya describe esta convención; este documento la adopta y la
completa con reglas de dependencias (§4).

### 2.3 Integración con backend por feature

| Feature / pieza | Fuente de datos (observado) | Notas |
|---|---|---|
| `auth` | **Real**: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, cambio de contraseña | Sesión (tokens incluidos) en `sessionStorage` (`auth.service.ts`) |
| `user-management` | **Mixto**: `/users/**` y `/audit-log` reales (vía `UsersApiService` y `AuditLogService`), pero `UserManagementService` arranca de `MOCK_USERS`; `UserManagementService.currentAppUser` vincula la sesión a ese registro por email | Recarga dura pierde los cambios locales (MASTER, deuda #7) |
| `user-management/roles-permissions` | **Real**: `POST/GET/PATCH/DELETE /roles` (`RolesApiService`); `GET /roles` y `GET /permissions` vía `core/auth/access-catalog.service.ts` | Último commit (`bb0551e`) |
| `core/services/organization-catalog.service.ts` | **Real**: `/catalogs/{subsidiarias,ubicaciones,cargos,puestos,departamentos,areas}` | |
| `sales-dashboard` | **Real**: `GET /sales` (paginación en servidor) + catálogos de medio de pago y estado | Detalle (`GET /sales/{id}`) y reproceso sin backend; `sales-mock.data.ts` sigue existiendo porque alimenta el mock de conciliación |
| `catalogs` (pantalla "Catálogos cargados") | **Mock**: `MOCK_CATALOGS`, `country-catalogs.{mx,co}.ts` | |
| `reconciliation-dashboard` | **Mock**: `shared/mock-data/*`, tendencias y cuentas bancarias mock; importación bancaria en memoria | Endpoints `/reconciliation/**`, `/bank-accounts`, `/bank-imports` listados en `docs/api-endpoints.csv`, aún no disponibles |
| `difference-management` | **Mock** + CSV importado en memoria | Matches confirmados viven en `ResolvedMatchesStore` (root, se pierden al recargar) |
| `user-management/profile` | **Mixto** (sesión real + registro de `user-management`) | |

### 2.4 Hallazgos principales del estado actual

Priorizados por impacto. Los de seguridad se detallan en §9.3.

| # | Severidad | Hallazgo | Ubicación |
|---|---|---|---|
| H1 | Alta (seguridad) | El Bearer se adjunta a **cualquier** URL cuando `apiUrl = ''` (default): `''.startsWith` es siempre verdadero, incluidas URLs absolutas de terceros. Con `apiUrl` absoluto, la comparación por prefijo sin límite de origen también acepta `https://gateway.example.com.otro-dominio...` | `src/app/core/interceptors/auth-token.interceptor.ts:16-18,52-57`; `src/environments/api-url.ts` |
| H2 | Media (seguridad/UX) | Un 401 invalida la sesión aunque la petición **no llevara token** (si no hay `accessToken`, se reenvía `req` sin cambios pero el `catchError` igual llama a `invalidateSession`) | `src/app/core/interceptors/auth-token.interceptor.ts:56-68` |
| H3 | Media (seguridad) | Access y refresh token persistidos en `sessionStorage`: legibles por cualquier XSS. No hay cabeceras de seguridad (CSP, `frame-ancestors`, `Referrer-Policy`) en el despliegue | `src/app/core/auth/auth.service.ts` (`sessionStorage.setItem`), `vercel.json` |
| H4 | **Resuelto** (ADR-0001, puntos 3 y 5) | ~~`core/` depende de `features/auth` y `features/user-management`; `auth` ↔ `user-management` se importan mutuamente~~. Sesión, guards y control de acceso viven en `core/auth/`; `AccessControlService` ya no depende de `UserManagementService` | `src/app/core/auth/` |
| H5 | **Resuelto** (ADR-0001, punto 4) | ~~`AuthService` concentra sesión y el cliente HTTP de usuarios, roles, permisos y auditoría~~. `AuthService` solo maneja sesión; los clientes son `UsersApiService`, `AuditLogService`, `RolesApiService` y `AccessCatalogService` | `core/auth/auth.service.ts`, `features/user-management/data/{users-api,roles-api}.service.ts` |
| H6 | Media (producto/seguridad) | Decisiones de UI por **rol fijo** (`hasRole('ADMIN')` en rutas de roles, `canReprocessSales` por ADMIN/CONTABILIDAD) cuando el backend ya no garantiza roles predefinidos y pide decidir por permiso (análisis front vs back v5) | `src/app/app.routes.ts` (`data.role`), `core/auth/access-control.service.ts` |
| H7 | Baja (arquitectura) | `shared/` importa de `features/sales-dashboard` (excepción a la "regla dura" de MASTER, documentada allí como fuente única del mock) | `src/app/shared/mock-data/sales-settlements.mock-data.ts:14-15` |
| H8 | Baja (calidad) | Sin ESLint, sin script de formato, sin CI, sin E2E | `package.json` |
| H9 | Baja (mantenibilidad) | Componentes/servicios muy grandes: `user-detail.ts` 899 líneas + `user-detail.html` 1228; `user-management.service.ts` 882. Budgets de estilos superados en 5 pantallas | `features/user-management/**`, `pnpm build` |
| H10 | Baja (consistencia) | Formularios mezclados: `ngModel` (filtros y pantallas de consulta) y Reactive Forms (login, cambio de contraseña, perfil, roles, detalle de usuario). Es razonable, pero no estaba escrito | ver §7 |
| H11 | Baja (accesibilidad) | Pocos atributos ARIA explícitos (49 en todas las plantillas) y sin pruebas automáticas de accesibilidad; header y menú sin breakpoint móvil (MASTER, deuda #3-4) | `src/app/**/*.html` |
| H12 | Alta (seguridad, según entorno) | La pantalla de login muestra **5 cuentas con sus contraseñas** sin condición de entorno: se incluyen en el build de producción. Si alguna existe en un entorno desplegado, cualquiera puede entrar | `src/app/features/auth/login/login.html:160-187` |
| H13 | Media (seguridad) | La exportación CSV escapa comillas/separadores pero no neutraliza celdas que empiezan con `=`, `+`, `-`, `@` (inyección de fórmulas al abrir en Excel; los textos vienen del backend/POS) | `src/app/features/sales-dashboard/data/sale-list-export.util.ts:12-15` |

---

## 3. Stack y versiones

| Pieza | Elección | Motivo |
|---|---|---|
| Framework | Angular 22.x (standalone, zoneless, signals) | Instalado; APIs estables necesarias (`input()`, `output()`, `httpResource`, `resource`, `linkedSignal`, control flow) |
| Runtime | Node `^22.22.3`, `^24.15.0` o `>=26` (requisito de Angular 22). **Supuesto:** fijar 24 LTS en CI y Vercel | `engines` de `@angular/core` |
| TypeScript | `>=6.0 <6.1` (rango que acepta `@angular/compiler-cli` 22.1) | Peer dependency |
| Package manager | pnpm (versión en `packageManager`). No cambiar | Lockfile existente |
| UI kit | ng-zorro-antd 22 (con `@angular/cdk`) | Ya es la base visual de todo el portal (MASTER) |
| Estilos | SCSS + tokens CSS (`--color-*`) + partials en `shared/styles/` | MASTER |
| Async | RxJS 7.8 (HTTP, debounce, cancelación) + Signals (estado de UI) | §6 |
| Unit tests | Vitest vía `ng test` (`@angular/build:unit-test`), jsdom | Ya funciona |
| E2E | Playwright (preferido; **por instalar** con el agente `angular-e2e`) | §11 |
| Formato | Prettier (ya configurado) | |
| Lint | Objetivo: angular-eslint (versión compatible con Angular 22, confirmar en su documentación al instalar) | §12 |

**Regla para dependencias nuevas:** primero Angular/CDK/ng-zorro. Una librería externa nueva
requiere: problema concreto que Angular no cubre, licencia compatible, mantenimiento activo,
compatibilidad declarada con Angular 22, impacto en bundle medido con `pnpm build`, y una línea en
el PR que lo justifique. Si es estructural (estado global, formularios, i18n, gráficas), ADR.
**No** se incorpora `@angular/animations` (deprecado en 22; MASTER usa `animate.enter/leave`).
**No** se incorpora una librería de estado global (ver [ADR-0002](decisions/0002-estado-signals-en-servicios.md)).

---

## 4. Estructura y reglas de dependencias

### 4.1 Capas (proporcionales al tamaño actual)

No se introducen capas "domain/application/infrastructure" formales: con ~20 pantallas y un solo
backend serían ceremonia. Dentro de cada feature hay tres responsabilidades, con archivos
separados cuando el tamaño lo justifica:

| Responsabilidad | Archivo | Contiene | No contiene |
|---|---|---|---|
| Acceso a datos | `data/<algo>-api.service.ts` | `HttpClient`, URLs, DTOs del contrato, mapeo DTO → modelo | Estado de pantalla, toasts, navegación |
| Estado / caso de uso | `data/<feature>.service.ts` | Signals de filtros/paginación/selección, `computed`, orquestación de llamadas | `HttpClient` directo (objetivo), DOM |
| Lógica pura | `data/<algo>.util.ts`, `*.model.ts` | Funciones puras y tipos (cruce de transacciones, agrupaciones, exportación CSV) | DI, estado |
| Presentación | `<pantalla>/<pantalla>.{ts,html,scss}` | Plantilla, interacción, binding a signals | Reglas de negocio reutilizables, HTTP |

Referencia real del patrón: `features/sales-dashboard/data/sales-api.service.ts` (HTTP + DTO) →
`sales-dashboard.service.ts` (filtros como signals, `switchMap` cancelable) → `sales-dashboard.ts`
(provee el servicio a nivel de componente).

### 4.2 Reglas de dependencia

Objetivo (verificable con lint de límites cuando se instale; mientras, en revisión de PR):

1. `shared/` **no importa** de `core/` ni de `features/`. Excepción vigente: H7 (mock), a retirar
   cuando exista `/reconciliation`.
2. `core/` no importa de `features/` (se cumple desde
   [ADR-0001](decisions/0001-organizacion-por-feature-y-limites.md)). La **API de plataforma** de
   sesión y acceso vive en `core/auth/` (`auth.service.ts`, `access-control.service.ts`,
   `access-catalog.service.ts`, `auth-errors.ts`, `*.guard.ts`); los tipos transversales
   (`RoleId`, `PermissionKey`, `RoleDef`, `PermissionDef`) en `shared/models/access.model.ts`.
3. Una feature no importa de otra feature (se cumple). Si una segunda feature necesita un modelo,
   componente o util, sube a `shared/` (regla ya escrita en MASTER). Si lo compartido es **estado**
   que depende de `core` (p. ej. `UserManagementService`), las pantallas que lo usan pertenecen al
   mismo feature: así `profile` y `roles-permissions` viven dentro de `user-management`.
4. Sin ciclos entre archivos. El ciclo `AccessControlService` → `UserManagementService` →
   `AuthService` quedó roto: la sesión se resuelve solo con `AuthUser` y el `AppUser` de la sesión lo
   expone `UserManagementService.currentAppUser` (por email).
5. `environments/` solo se importa desde servicios de acceso a datos, interceptores y
   `core/country`. Componentes no leen `environment` directamente.

### 4.3 Nombres y archivos (convención observada, se mantiene)

- Archivos en kebab-case sin sufijo de tipo para componentes (`sales-dashboard.ts`, clase
  `SalesDashboard`), con sufijo para el resto: `.service.ts`, `.util.ts`, `.model.ts`,
  `.guard.ts`, `.interceptor.ts`, `.store.ts`, `-mock.data.ts` / `.mock-data.ts`, `.spec.ts`.
- Selector con prefijo `app-` (`angular.json`).
- Rutas en español (`/conciliacion`, `/usuarios`, `/gestion-de-roles`); identificadores de código en
  inglés; textos de UI en español del país (vocabulario de `COUNTRY_PROFILE`).

---

## 5. Convenciones Angular 22

- **Standalone siempre.** No se crean `NgModule`. No escribir `standalone: true` (es el default).
  Se importan los módulos de ng-zorro por componente (`NzTableModule`, etc.), como hoy.
- **Detección de cambios.** La app es zoneless y en Angular 22 `OnPush` es el default. Declarar
  `changeDetection: ChangeDetectionStrategy.OnPush` es redundante pero se tolera por consistencia
  con el código actual; **no** es requisito para código nuevo. No usar `Eager` salvo para integrar
  algo que muta estado fuera de signals/eventos, con comentario del motivo. El estado que pinta la
  plantilla debe vivir en signals (o llegar por `async`/`toSignal`): en zoneless, mutar un campo
  plano dentro de un `subscribe` no refresca la vista.
- **Entradas/salidas:** `input()`, `input.required()`, `output()`, `model()` para componentes nuevos.
  No `@Input`/`@Output` en código nuevo.
- **Parámetros de ruta:** `withComponentInputBinding()` ya está activo; recibirlos como `input()`
  (ver `difference-management.ts`), no con `ActivatedRoute` manual.
- **DI:** `inject()` en campos (`private readonly x = inject(X)`), como en todo el repo.
  Servicios con estado de una sola pantalla: `@Injectable()` + `providers: [...]` del componente
  (se destruyen con la pantalla). `providedIn: 'root'` solo para sesión, catálogos compartidos,
  preferencias de UI y estado que deba sobrevivir a la navegación entre rutas hermanas
  (justificarlo en el comentario de la clase, como ya hace `UserManagementService`).
  Configuración por país vía `InjectionToken` (`COUNTRY_PROFILE`), no con `if (country === ...)`
  disperso.
- **Plantillas:** control flow (`@if`, `@for` con `track` por id estable, `@switch`, `@let`). No
  `*ngIf`/`*ngFor`. Evitar llamar métodos costosos en plantillas: usar `computed`.
  `CommonModule` solo si se usan sus pipes; preferir importar el pipe concreto.
- **Routing:** toda pantalla es `loadComponent` lazy (ya es así). Rutas hijas protegidas cuelgan de
  `Shell` con `authGuard`; cada ruta declara `data.permission`. Rutas estáticas antes que las
  paramétricas (`usuarios/nuevo` antes de `usuarios/:userId`). Si una pantalla agrupa varias rutas
  hijas, `loadChildren` con su propio `*.routes.ts` dentro de la feature.
- **Guards/resolvers:** funcionales (`CanActivateFn`). Redirigen con `router.parseUrl(...)`, no
  `false` en seco. No se usan resolvers para cargar datos: la pantalla muestra su propio estado de
  carga (mejor percepción y evita bloquear la navegación).
- **Interceptors:** funcionales, registrados en `app.config.ts` en orden explícito. Un interceptor
  re-lanza siempre el error (`throwError`) después de su efecto.
- **`@defer`:** opcional para bloques pesados por debajo del pliegue (gráficas, drawers grandes) si
  una medición del build o del navegador lo justifica; no como regla.
- **Errores globales:** `provideBrowserGlobalErrorListeners()` ya está activo. Ver §12 para
  observabilidad.

---

## 6. Estado y asincronía

Detalle y alternativas en [ADR-0002](decisions/0002-estado-signals-en-servicios.md).

| Necesidad | Herramienta |
|---|---|
| Estado local de un componente (abierto/cerrado, selección, pestaña) | `signal()` en el componente |
| Estado de una pantalla (filtros, página, filas, `loading`, `loadFailed`) | Servicio `@Injectable()` provisto por el componente, con signals |
| Valores derivados | `computed()`; `linkedSignal()` cuando un valor editable debe reiniciarse al cambiar su fuente (p. ej. página 1 al cambiar filtros) |
| Lectura HTTP que depende de signals, sin debounce | `httpResource()` (estable en 22) o `rxResource()`; exponen `value`, `isLoading`, `error` y cancelan la petición anterior |
| Búsqueda con debounce, combinación de streams, reintentos, paginación recursiva | RxJS (`toObservable` → `debounceTime` → `switchMap`) y vuelta a signal, como `SalesDashboardService` |
| Mutaciones (POST/PATCH/DELETE) | Método del servicio que devuelve `Observable`; el componente maneja "guardando" y el resultado |
| Estado compartido entre rutas | Servicio `root` con signals privados y API de métodos (`ResolvedMatchesStore`) |
| Efectos hacia afuera (storage, DOM, navegación, sincronizar un formulario reactivo) | `effect()` |

Reglas:

- **Una sola fuente de verdad por dato.** Los permisos salen de `AuthService.currentUser()`
  (backend); no se recalculan ni se copian. Los catálogos se piden una vez y se exponen como
  signals de solo lectura (`asReadonly()`).
- **No propagar estado con `effect()`** (`effect(() => this.b.set(this.a()))`): usar `computed` o
  `linkedSignal`. Hoy hay `effect` que disparan cargas por parámetro de ruta
  (`role-create.ts`, `user-detail.ts`); en código nuevo, preferir `httpResource`/`rxResource`.
  Resetear un `FormGroup` cuando cambia la entidad sí es un uso válido de `effect`.
- **Suscripciones:** las de HTTP completan solas, pero si el callback toca estado del componente,
  cortar con `takeUntilDestroyed()` o usar `toSignal`/resources. Nunca `subscribe` anidados:
  componer con operadores.
- Signals expuestos en servicios: lectura pública (`readonly x = this._x.asReadonly()` o `computed`),
  escritura por métodos con intención (`setDateRange`, `markDesconciliado`). Los servicios actuales
  exponen algunos `signal` escribibles; aceptado, corregir al tocarlos.
- **Inmutabilidad:** `update()` crea nuevos `Set`/`Map`/arrays (patrón actual de los stores).
- **Sin store global** (NgRx u otro) mientras no exista un problema concreto que los servicios con
  signals no resuelvan (ver ADR-0002 para el disparador).
- Estado que debe sobrevivir a una recarga: solo sesión (`sessionStorage`, §9) y preferencias de UI
  (`localStorage`: tema, paleta, menú). Los datos de negocio vienen del backend; los mocks en
  memoria **no** se persisten.

---

## 7. Formularios

Decisión y evaluación de Signal Forms en [ADR-0003](decisions/0003-formularios.md). Resumen:

- **Formularios de captura/edición (validación, envío, errores del backend):** Reactive Forms
  tipados (`FormBuilder.nonNullable`, `FormGroup<T>`), con `nz-form-item`/`nz-form-control` y
  `nzErrorTip`. Es lo que ya usan login, cambio de contraseña, perfil, roles y detalle de usuario.
- **Filtros de tabla y controles sueltos sin validación:** `[(ngModel)]` ligado a un signal o a un
  setter del servicio (patrón actual de las pantallas de consulta), o `model()`/eventos de ng-zorro.
- **Signal Forms (`@angular/forms/signals`, públicos desde 22.0):** no se adoptan todavía como
  default; se habilita un piloto acotado (ADR-0003) para validar su integración con los controles
  de ng-zorro (que se conectan como `ControlValueAccessor`).
- Validación: la del front es UX; **el backend valida siempre**. Errores 400 de validación se
  muestran en el campo o en una alerta del formulario (el interceptor global no los muestra, por
  diseño). Botón de envío deshabilitado mientras se guarda; nunca doble envío.
- Accesibilidad: cada control con etiqueta (`nz-form-label` con `nzFor` o `aria-label`), errores
  asociados y foco al primer campo inválido tras enviar.

---

## 8. API, modelos, errores y configuración

### 8.1 Acceso a API

- URL siempre como `${environment.apiUrl}/<ruta>`; `apiUrl` vacío en desarrollo (proxy) y absoluto
  en Vercel (`scripts/set-api-url.mjs` desde `API_URL`). No codificar hosts en servicios.
- Un `*-api.service.ts` por recurso del backend (`SalesApiService` es la referencia). **Objetivo
  incremental (H5):** extraer de `AuthService` los clientes de `/users`, `/roles`, `/permissions`
  y `/audit-log` a `UsersApiService`, `RolesApiService`, `AuditLogApiService`, dejando en
  `AuthService` solo sesión (`/auth/**`).
- Parámetros de consulta con `HttpParams`, omitiendo `undefined`. Segmentos de ruta dinámicos con
  `encodeURIComponent` (como en `/roles/{code}`).
- Paginación en servidor cuando el endpoint la ofrece (`page` base 1, `pageSize` ≤ 100 en `/sales`).
  Nunca descargar todo para paginar en cliente si existe paginación en servidor.

### 8.2 Modelos y DTOs

- Los DTOs reflejan el contrato del backend (nombres y tipos tal cual) y viven junto al api-service.
- Si la UI necesita otra forma, mapear en el api-service o en un `*.util.ts` puro; los componentes
  consumen modelos de la UI, no DTOs crudos, cuando difieren.
- Fechas de negocio `yyyy-MM-dd` como `string` en el contrato y `Date` local solo en los controles
  (`shared/utils/iso-date.util.ts`, MASTER "fechas de calendario en hora local").
- Montos: `number` del backend, formateados con `MoneyPipe` del país; no formatear a mano ni
  codificar `'MXN'` (deuda #6 de MASTER).

### 8.3 Errores

Existe un único catálogo de códigos (`core/auth/auth-errors.ts`) y dos interceptores:

| Capa | Responsabilidad |
|---|---|
| `authTokenInterceptor` | Adjuntar Bearer a peticiones del backend; cerrar sesión ante 401 de token inválido (ver H1-H2) |
| `httpErrorAlertInterceptor` | Toast genérico para códigos sin UI propia, 403 y 5xx; redirección a `/cambiar-password` |
| Servicio de estado | Traducir el fallo a estado (`loadFailed`, filas vacías) |
| Componente | Mensajes de formulario (400, credenciales) y estado de error de la pantalla |

Reglas: un error se muestra **una sola vez** (si el componente tiene UI propia para un código,
agregarlo a `CODES_WITH_OWN_UI`). Pendiente documentado en el análisis v5: leer `detail` de
respuestas `ProblemDetail` (Core/Capture) en el interceptor antes de conectar más endpoints de
ventas. No registrar en consola tokens ni datos personales.

### 8.4 Estados de pantalla

Toda vista que carga datos contempla: **cargando** (`nzLoading` en tabla o skeleton), **vacío**
(`nzNoResult`/`nz-empty` con texto que explique si es por filtros o por ausencia de datos),
**error** (mensaje en la pantalla además del toast, con acción "Reintentar" cuando aplique) y
**sin permiso** (el guard redirige; acciones sin permiso no se muestran). La apariencia sigue MASTER.

### 8.5 Configuración y país

- `environment.ts` / `environment.co.ts` con `fileReplacements`; `api-url.ts` lo genera el build.
  No agregar secretos: todo lo que está en `environments/` termina en el bundle público.
- País: `provideCountry()` fija `LOCALE_ID`, moneda y vocabulario; las diferencias MX/CO se expresan
  en `core/country/country-profiles.ts`, no con condicionales en las pantallas.
- **Mocks:** viven solo en `data/*-mock.data.ts` o `shared/mock-data/`, importados únicamente por el
  servicio de estado de la feature que aún no tiene backend. Al conectar el endpoint, se borra el
  mock y cualquier "puente" (p. ej. mapeos por nombre), en el mismo PR o el siguiente.

---

## 9. Seguridad, autenticación y autorización

### 9.1 Principios

- **El front no es un control de seguridad.** Guards, menús ocultos y botones deshabilitados son
  UX. Toda autorización la aplica el Gateway/servicios (`hasAnyRole`, permisos). Un 403 del backend
  debe poder ocurrir sin romper la pantalla.
- **Decidir por permiso, no por rol** (`data.permission`, `hasPermission`). Las excepciones por rol
  (H6) se documentan y se migran cuando el backend exponga el permiso correspondiente.
- **Sin secretos en el front.** Ni claves de API, ni credenciales demo en código de producción
  (hoy se incumple: H12/R6).
- **XSS:** confiar en el escapado de Angular. Prohibido `bypassSecurityTrust*` y `[innerHTML]` con
  datos del backend o de archivos importados (hoy no se usan). Los CSV importados se tratan como
  texto y se validan antes de usarse.
- **Archivos exportados (CSV):** neutralizar celdas que empiecen con `=`, `+`, `-`, `@` (y
  tabulador/retorno) para evitar inyección de fórmulas al abrirlos en Excel (hoy no se hace: H13/R7).

### 9.2 Sesión (estado actual)

Login → access + refresh token → sesión en `sessionStorage` (sobrevive F5, no otra pestaña) →
refresco proactivo con refresh token de un solo uso → `GET /auth/me` revalida tras recargar →
cierre por inactividad (`SESSION_IDLE_TIMEOUT`) o 401 → `App` redirige a `/login` vía `effect`.
Detalle funcional en MASTER, "Patrón: refresh token de un solo uso…".

### 9.3 Deuda y riesgos registrados (no corregidos; hay tarea aparte)

| ID | Riesgo | Escenario | Corrección esperada | Verificación |
|---|---|---|---|---|
| R1 (H1) | Fuga del access token a terceros | Con `apiUrl = ''`, cualquier `HttpClient` hacia una URL absoluta externa (CDN, servicio de terceros, URL de un archivo) recibe `Authorization: Bearer …`. Con `apiUrl` absoluto, un host que empiece con el mismo texto también coincide | Decidir "petición al backend" por **origen + ruta**: URL relativa (`/` sin `//`) cuando `apiUrl` es vacío; si es absoluta, `new URL(req.url, location.origin).origin === new URL(apiUrl).origin` y prefijo de ruta con límite `/` | Prueba unitaria en `auth-token.interceptor.spec.ts`: URL externa absoluta no lleva cabecera en ambos modos |
| R2 (H2) | Cierre de sesión espurio | Una petición sin token (o a un tercero) que responde 401 invalida la sesión del usuario | Solo invalidar si la petición **enviada** llevaba el Bearer (`authReq !== req`) y es del backend | Prueba: 401 de una petición sin `Authorization` no llama a `invalidateSession` |
| R3 (H3) | Robo de tokens por XSS | Cualquier script inyectado lee `sessionStorage` | Confirmar con backend si el refresh token puede ir en cookie `HttpOnly; Secure; SameSite` y el access token solo en memoria. Mientras, minimizar superficie XSS (CSP) | Revisión de diseño con backend (decisión D3) |
| R4 | Sin cabeceras de seguridad en el despliegue | Clickjacking, carga de scripts no previstos | Agregar en `vercel.json`: `Content-Security-Policy` (incluyendo `connect-src` del Gateway y Google Fonts mientras se usen), `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options` | Inspeccionar cabeceras de la URL desplegada |
| R5 (H6) | Acceso inconsistente | En un DEV sin roles predefinidos, `ADMIN`/`CONTABILIDAD` pueden no existir | Migrar a permisos cuando el backend los exponga | Prueba de guard con permisos sin rol |
| R6 (H12) | Credenciales publicadas | El bloque "Cuentas de desarrollo" del login se despliega en Vercel junto con las contraseñas | Mostrarlo solo en desarrollo (p. ej. bandera en `environment` o `isDevMode()`), y confirmar que esas cuentas no existen fuera de `dev-env/` | Build de producción sin el texto de las cuentas (buscarlo en `dist/`) |
| R7 (H13) | Inyección de fórmulas en CSV | Un folio/cliente con `=HYPERLINK(...)` se ejecuta al abrir la exportación | Prefijar `'` a celdas que empiecen con `= + - @ \t \r` en `escapeCsv` | Prueba unitaria de `sale-list-export.util.ts` |

R1 y R2 caen en el paso 1 de la hoja de ruta (§15); R6 y R7 son igual de pequeños y conviene
incluirlos ahí.

---

## 10. Diseño visual, componentes, estilos y accesibilidad

**Fuente de verdad: [MASTER.md](../../design-system/conciliation/MASTER.md).** Este apartado solo
fija cómo se organiza el código; tokens, colores, densidad y patrones de pantalla están allí, y las
reglas de `CLAUDE.md` (page-header, botones icono + label, tablas en `table-card`) son obligatorias.

- **Componentes compartidos** (`shared/components/`): presentacionales, con `input()`/`output()`,
  sin servicios de feature ni HTTP. Un componente sube a `shared/` cuando lo usa una segunda
  feature (regla de MASTER), no antes.
- **Estilos:** tokens CSS (`--color-*`) y partials de `shared/styles/` (`@use`); nada de colores
  sueltos. Overrides de ng-zorro solo en el puente de `src/styles.scss` (MASTER). El `.scss` de una
  pantalla contiene solo layout propio; si supera el budget de 4 kB, extraer a partials lo que ya
  se repite antes de subir el budget (H9).
- **Responsive:** el portal es de escritorio primero; las pantallas nuevas no deben romper a 1280 px
  ni a 1024 px. La pasada móvil de header/menú es deuda conocida (MASTER #3-4).
- **Accesibilidad (objetivo WCAG 2.2 AA, supuesto a confirmar):** HTML semántico; botones que
  solo tengan icono llevan `aria-label` (la regla icono + label lo evita en la mayoría); tablas con
  encabezados reales; foco visible; contraste según tokens de MASTER; diálogos y drawers de ng-zorro
  con título; estados de tag/chip no transmitidos solo por color (texto siempre presente); mensajes
  de error asociados al campo. Los locators accesibles de E2E (§11) sirven como verificación.

---

## 11. Pruebas

| Nivel | Herramienta | Qué se prueba | Dónde |
|---|---|---|---|
| Unitarias puras | Vitest | `*.util.ts`, mapeos DTO, cálculos de conciliación, exportación CSV | `*.spec.ts` junto al archivo |
| Servicios / guards / interceptores | Vitest + `TestBed` + `provideHttpClientTesting()` / `HttpTestingController` | Contrato HTTP (URL, método, params, cabeceras), manejo de errores, transiciones de estado | junto al archivo |
| Componentes | Vitest + `TestBed` | Renderizado e interacción observable (texto, roles, eventos); servicios de feature sustituidos por dobles | junto al componente |
| E2E | Playwright (**por configurar** con `angular-e2e`) | Flujos críticos: login y cambio obligatorio de contraseña, acceso por permiso, filtros y paginación de Resumen de venta, alta/edición de rol | `e2e/` (fuera de `src/`) |

Reglas:

- Comando de CI: `pnpm test:ci` (ya existe; no cambiar el target `test`). Cobertura: medir primero
  (`ng test --coverage`) y fijar umbrales después de conocer la línea base; no inventar un número.
- Prioridad de cobertura: lo que protege seguridad y dinero — interceptores (R1/R2), guards,
  `AuthService`, `cross-match.util.ts`, `group-by-tender-day.util.ts`, importación bancaria/CSV.
- Aislar HTTP, `sessionStorage`/`localStorage`, temporizadores (`vi.useFakeTimers()`) y la fecha
  actual. Sin esperas arbitrarias.
- Componentes zoneless: después de cambiar estado, `await fixture.whenStable()` o
  `fixture.detectChanges()`; no depender de zone.js.
- E2E: locators accesibles (`getByRole`, `getByLabel`); evitar clases `.ant-*`. Backend simulado
  con `page.route` para flujos deterministas; contra el Gateway local solo con las cuentas sembradas
  de `dev-env/` (nunca entornos reales). Ver `.claude/agents/angular-e2e.md`.
- Datos de prueba: builders pequeños en el propio spec; no reutilizar los mocks grandes de la app
  como fixtures (cambian por razones de demo).

---

## 12. Calidad y entrega

**Puertas por PR (objetivo):** `pnpm build` (incluye typecheck de plantillas), `pnpm test:ci`,
formato Prettier sin cambios, lint sin errores, y E2E de humo cuando exista.

| Ítem | Estado | Objetivo |
|---|---|---|
| Typecheck | Implícito en `ng build`/`ng test` (strict efectivo) | Opcional: declarar `"strict": true` y `"strictTemplates": true` en `tsconfig.json` para que sea explícito (sin efecto en compilación; verificado 0 errores) |
| Formato | Prettier sin script | Agregar `format`/`format:check` |
| Lint | No existe | angular-eslint + regla de límites de importación (`core`/`shared`/`features`, §4.2) |
| CI | No existe | Workflow mínimo: `pnpm install --frozen-lockfile` → `build` → `test:ci` → (luego) E2E. Node según §3 |
| Budgets | 5 warnings de estilos | Bajarlos a 0 o justificar un budget mayor por pantalla en un PR propio |
| Observabilidad | Solo `provideBrowserGlobalErrorListeners` + consola | Decidir herramienta (D6). Mientras: un `ErrorHandler` propio que no filtre datos sensibles |
| Revisión | | Checklist del PR: §14.1 |

**Despliegue:** Vercel con `node scripts/set-api-url.mjs && pnpm build` (o `build:co`). El dominio
del portal debe estar en `CORS_ALLOWED_ORIGINS` del Gateway.

---

## 13. Ejemplo representativo (real): "Resumen de venta"

Flujo de lectura con filtros, debounce y paginación en servidor. Es el patrón a copiar para
conectar `/reconciliation`. Extracto simplificado de
`features/sales-dashboard/data/sales-dashboard.service.ts`:

```ts
@Injectable() // provisto en SalesDashboard.providers: vive lo que vive la pantalla
export class SalesDashboardService {
  private readonly api = inject(SalesApiService); // HTTP + DTOs, sin estado

  readonly statusFilter = signal<StatusFilter>('all');
  readonly page = signal(1);
  readonly rows = signal<SaleListItem[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  private readonly query = computed(() => ({ ...this.filters(), page: this.page() }));

  constructor() {
    toObservable(this.query).pipe(
      debounceTime(300),
      tap(() => this.loading.set(true)),
      switchMap((q) => this.api.list(q).pipe(catchError(() => { this.loadFailed.set(true); return of(null); }))),
      takeUntilDestroyed(),
    ).subscribe((res) => { this.loading.set(false); this.rows.set(res?.data ?? []); });
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
    this.page.set(1); // cambiar un filtro vuelve a la página 1
  }
}
```

Variante para lecturas sin debounce (ilustrativa, no existe aún en el repo):

```ts
// Detalle por id de ruta: el resource cancela la petición anterior al cambiar el id.
readonly roleCode = input<string>();
readonly role = httpResource<RoleDto>(() => {
  const code = this.roleCode();
  return code ? `${environment.apiUrl}/roles/${encodeURIComponent(code)}` : undefined;
});
// Plantilla: @if (role.isLoading()) {…} @else if (role.error()) {…} @else if (role.value(); as r) {…}
```

`httpResource` usa `HttpClient`, así que pasa por los mismos interceptores. Si se usa en un
componente, la URL se arma en el api-service (función o constante) para no leer `environment`
desde la pantalla.

---

## 14. Guía de evolución

### 14.1 Añadir una pantalla o feature

1. Confirmar requisito y permiso en los documentos de `docs/` (matriz de permisos, guía de
   endpoints). Si el endpoint no existe, decidir explícitamente "mock temporal" y anotarlo.
2. Crear `features/<feature>/` con `data/` y el componente de pantalla (`ng generate component`;
   schematics ya configurados para SCSS).
3. Ruta lazy en `app.routes.ts` bajo `Shell`, con `canActivate: [permissionGuard]` y
   `data.permission`. Añadir la entrada al menú respetando el permiso.
4. `*-api.service.ts` (DTOs del contrato) + servicio de estado provisto por la pantalla.
5. UI según MASTER y `CLAUDE.md` (page-header, botones, tablas); estados de carga/vacío/error.
6. Pruebas: unitarias del api-service, de utils puros y del comportamiento clave del componente;
   E2E si es un flujo crítico (delegar en `angular-unit-tests` / `angular-e2e`).
7. Si se creó un patrón visual nuevo, documentarlo en MASTER; si se tomó una decisión estructural,
   ADR.

**Checklist de revisión:** respeta §4.2; sin `HttpClient` en componentes; sin secretos; decisiones
por permiso; errores mostrados una vez; signals para lo que pinta la plantilla; sin `effect` que
copie estado; pruebas nuevas pasan; `pnpm build` sin warnings nuevos.

### 14.2 Conectar un endpoint que hoy es mock

1. Crear/ampliar el api-service con el DTO real.
2. Cambiar el servicio de estado para consumirlo; mantener la misma API pública hacia el componente
   cuando sea posible (el componente no debería cambiar).
3. Borrar mock y puentes; si `shared/mock-data` queda sin consumidores, borrarlo (y con ello la
   excepción H7).
4. Actualizar la tabla de §2.3 y, si cambia el estado del análisis front vs back, el documento de
   `docs/` siguiendo la regla de versionado de `CLAUDE.md`.

### 14.3 Cuándo escribir un ADR

Sí: cambiar el modelo de sesión/tokens, adoptar una librería estructural (estado, formularios,
gráficas, i18n), cambiar límites de carpetas, adoptar SSR, cambiar herramienta de pruebas o
despliegue, o desviarse de una regla de este documento de forma permanente. No: preferencias de
estilo, nombres, o un patrón visual (eso va en MASTER). Formato en
[`decisions/README.md`](decisions/README.md).

### 14.4 Validar un cambio arquitectónico

Build y pruebas en verde; medir antes/después cuando el motivo sea rendimiento (`pnpm build`
para tamaños, DevTools para tiempos); revisión con `angular-architect` contra este documento; y
actualizar este documento en el mismo PR si cambia una regla.

---

## 15. Hoja de ruta incremental

Cada paso es independiente y pequeño. No se reestructura todo el repositorio de una vez.

| Paso | Qué | Beneficio | Alcance / riesgo | Cómo comprobar |
|---|---|---|---|---|
| 1 (inmediato) | Corregir R1 y R2 en `auth-token.interceptor.ts` (tarea ya abierta); R6 (cuentas demo solo en desarrollo) y R7 (CSV) | Evita fuga de token, cierres espurios, credenciales publicadas e inyección en CSV | 3 archivos + specs; riesgo bajo | Specs nuevas; login/refresh manual contra DEV; `dist/` sin las cuentas |
| 2 (inmediato) | Scripts `format`/`format:check`; CI mínima (build + `test:ci`) | Puertas automáticas | Config; sin cambios de código | Pipeline en verde en un PR |
| 3 (corto) | Playwright con `angular-e2e`: login, cambio obligatorio de contraseña, acceso por permiso | Red de seguridad antes de refactors | Nuevo `e2e/`, dependencia dev; no toca `test` | `pnpm e2e` local y en CI |
| 4 (corto) | angular-eslint + regla de límites (§4.2) en modo advertencia, luego error | Hace verificables los límites | Config; muchas advertencias iniciales esperables (H4) | Lint en CI |
| 5 (corto) | Cabeceras de seguridad en `vercel.json` (R4) | Mitiga XSS/clickjacking | Riesgo: CSP demasiado estricta rompe fuentes/Gateway; probar en preview | Cabeceras en preview de Vercel |
| 6 (medio) — **hecho** | Extraer clientes HTTP de `AuthService` (H5) y mover sesión + control de acceso a `core/auth/` (H4, ADR-0001) | Rompe ciclos, `core` deja de depender de features | Mover archivos y actualizar imports; riesgo medio, mecánico | Build, `test:ci`, E2E del paso 3 |
| 7 (medio) | Conectar `/reconciliation/**`, `/bank-*` cuando el backend los publique; retirar `shared/mock-data` y los stores en memoria | Datos reales; elimina H7 | Por endpoint (§14.2) | Pruebas de api-service + E2E con `page.route` |
| 8 (medio) | `UserManagementService` sin `MOCK_USERS`; sesión resuelta solo con datos del backend | Elimina estado mixto | Depende de que `/users` cubra todos los campos de la UI | Recargas duras sin pérdida de datos |
| 9 (cuando aplique) | Migrar decisiones por rol a permisos (R5) | Consistencia con backend | Depende del backend | Pruebas de guard |
| 10 (opcional) | Dividir `user-detail` en subcomponentes por pestaña; bajar budgets de estilos | Mantenibilidad | Riesgo medio por tamaño; hacerlo con E2E presente | Build sin warnings, E2E |

---

## 16. Supuestos y decisiones por confirmar

| ID | Decisión / supuesto | Propuesta por defecto |
|---|---|---|
| D1 | Aceptar este documento y los ADR 0001-0003 como lineamientos | Aceptar; revisar en 3 meses |
| D2 | Mover sesión y control de acceso a `core/auth/` (ADR-0001) | Hecho (2026-10-15, rama `feature/agents`) |
| D3 | Modelo de tokens: ¿refresh token en cookie `HttpOnly` desde el backend? | Pedir al backend; mientras, `sessionStorage` + CSP |
| D4 | Plataforma de CI (no hay `.github/`; el remoto no se verificó) | La del hosting del repo |
| D5 | Versión de Node fijada en CI/Vercel | 24 LTS (`^24.15.0`) |
| D6 | Herramienta de observabilidad de errores en producción | Ninguna hasta decidir; no agregar SDK sin ADR |
| D7 | Nivel de accesibilidad exigido (supuesto WCAG 2.2 AA) | Confirmar con producto |
| D8 | Navegadores soportados (supuesto: Chrome/Edge/Firefox de escritorio, versiones vigentes) | Confirmar; alinea con E2E |
| D9 | Signal Forms: ¿piloto en un formulario pequeño? (ADR-0003) | Sí, uno solo, tras tener E2E |
| D11 | ¿Las cuentas demo del login existen en algún entorno desplegado (Vercel)? | Confirmar urgente; ocultarlas en producción en cualquier caso |
| D10 | Moneda/IVA por país (MASTER deuda #6) | Fuera de alcance de arquitectura; requiere producto |
