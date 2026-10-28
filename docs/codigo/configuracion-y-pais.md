# Configuración, arranque, rutas y país

Porqué de la configuración del arranque, los entornos, el origen del API, la tabla de rutas y el
perfil de país (México y Colombia). El §8.5 de
[`frontend-angular.md`](../architecture/frontend-angular.md) define la política de configuración, y
[MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón: país de trabajo", su uso visual.
Convención: [README](README.md).

<a id="arranque-y-providers"></a>
## Arranque y providers

- `main.ts` arranca `App` con `appConfig`. `App` no tiene chrome propio: `login`,
  `cambiar-password` y `Shell` (header y menú) son rutas hijas, así login no queda envuelto en el
  layout del dashboard.
- Interceptores en orden: `authTokenInterceptor` y luego `httpErrorAlertInterceptor` (ver
  [`interceptores-y-errores.md`](interceptores-y-errores.md)).
- `provideCountry()` fija `LOCALE_ID` (es-MX: miles con coma y punto decimal; es-CO: miles con
  punto y coma decimal), la moneda por defecto y el perfil fiscal y de vocabulario (ver
  [#perfil-de-pais](#perfil-de-pais)).
- ng-zorro no tiene i18n para es-MX ni es-CO, por eso sus textos internos usan `es_ES`.
- `index.html` carga la hoja de tema de ng-zorro en `#nz-theme-link`; `ThemeService` la
  intercambia en runtime entre claro y oscuro (ver [`layout-y-tema.md`](layout-y-tema.md)).

Código: `src/app/app.config.ts`, `src/main.ts`, `src/index.html`, `src/app/app.ts`.

<a id="entornos-y-api-url"></a>
## Entornos y origen del Gateway

- `environment.apiUrl` es el origen del Gateway del backend y sale de `api-url.ts`:
  - **Desarrollo**: `''`. Las llamadas van a rutas relativas (`/auth/...`, `/users/...`) que el
    proxy de `ng serve` (`proxy.conf.js`) reenvía al Gateway (puerto 8080 por defecto,
    configurable con `GATEWAY_URL`). Para el navegador es el mismo origen y no depende del CORS del
    Gateway.
  - **Producción** (p. ej. Vercel): portal y Gateway son orígenes distintos y hace falta la URL
    absoluta, sin `/` final. No se escribe a mano: `scripts/set-api-url.mjs` la toma de la variable
    de entorno `API_URL` antes de compilar y reescribe `api-url.ts` en la copia del build (README
    del repo, "Despliegue en Vercel"). El dominio del portal debe estar en
    `CORS_ALLOWED_ORIGINS` del Gateway.
- `environment.country` es el país de trabajo (`'MX' | 'CO'`). `environment.ts` es México (por
  defecto); la configuración de build `co` de `angular.json` lo reemplaza por
  `environment.co.ts` (`pnpm start:co`, `pnpm build:co`). Ambos usan el mismo `apiUrl`: el Gateway
  es el mismo y solo cambia el país.

Código: `src/environments/environment.ts`, `environment.co.ts`, `api-url.ts`
(lo escribe `scripts/set-api-url.mjs` en el despliegue).

<a id="rutas"></a>
## Tabla de rutas y permiso por ruta

- `login` y `cambiar-password` quedan fuera de `Shell`; todo lo demás cuelga de `Shell` con
  `authGuard`. `cambiar-password` lleva `mustChangePasswordGuard` (ver
  [`sesion-y-acceso.md#guards`](sesion-y-acceso.md#guards)). `**` redirige a `login`.
- El redirect de `''` a `dashboard` es estático: si el usuario no puede ver `/dashboard`, el
  `permissionGuard` de esa ruta lo rebota a `homeRoute()`.
- Permiso por ruta (`data.permission`, y `data.role` cuando aplica):

| Ruta | Permiso | Notas |
|---|---|---|
| `dashboard` | `view_dashboard` | |
| `conciliacion` | `view_reconciliation` | |
| `conciliacion/:runId` | `view_reconciliation` | Comparativa POS vs. banco de una conciliación (id `CON-0001`, ver `ReconciliationRunsStore`) |
| `conciliacion/:runId/proceso` | `import_settlements` | Proceso en 3 pasos; `confirmLeaveGuard` pide confirmar al salir con un archivo cargado |
| `conciliacion/:tenderMedia/diferencias/:orderId` | `view_reconciliation` | Cuatro segmentos: no choca con las de dos y tres |
| `catalogos` | `view_catalogs` | Solo lectura para todos los roles (CU14, matriz 7.16 del DED) |
| `perfil` | — | Abierta a cualquier usuario autenticado |
| `gestion-de-roles`, `/nuevo`, `/:code` | `manage_roles` + rol `ADMIN` | `ALTAS` también tiene `manage_roles` (lo piden `GET /roles` y `GET /permissions`), por eso no basta el permiso. `:code` reutiliza el componente del alta en modo edición |
| `usuarios`, `usuarios/nuevo`, `usuarios/:userId` | `manage_users` | |
| `usuarios/auditoria` | `view_audit_log` | Permiso propio según la matriz 7.16 del DED |

- Orden: `usuarios/auditoria` y `usuarios/nuevo` se declaran antes de `usuarios/:userId`, que si no
  las capturaría.

Código: `src/app/app.routes.ts`.

<a id="perfil-de-pais"></a>
## Perfil de país (moneda, formato y campos fiscales)

- `CountryProfile` reúne todo lo que cambia entre México y Colombia: moneda y formato numérico,
  impuestos de venta, vocabulario fiscal (autoridad, comprobante, identificación tributaria,
  régimen) y vocabulario general (ubicación, estado/departamento, identificación personal).
- `environment.country` se resuelve una sola vez al cargar la app. Un valor no soportado lanza un
  error que detiene el arranque con un mensaje claro, en vez de dejar la app a medias con textos o
  impuestos de otro país.
- Dos accesos al mismo objeto: `ACTIVE_COUNTRY` para funciones puras y datos mock sin DI (p. ej.
  `saleTaxAmount`, comprobantes de `sales-mock.data.ts`) y el token `COUNTRY_PROFILE` para
  componentes y servicios.
- `provideCountry()` registra el locale, provee `COUNTRY_PROFILE`, `LOCALE_ID` y
  `DEFAULT_CURRENCY_CODE`, y marca `<html lang>` con el locale activo.
- `salesTaxes` es una lista para que la UI pinte tantas líneas como defina el país (hoy cada uno
  tiene un IVA general). `fiscalTimezone` es el offset de los documentos fiscales para el pipe
  `date` (ninguno de los dos países tiene horario de verano). `hasCfdiFields` habilita los campos
  exclusivos del CFDI mexicano (uso del CFDI, método de pago).
- Regímenes: México usa el catálogo `c_RegimenFiscal` del SAT (los que usa el mock de ventas);
  Colombia, los códigos de responsabilidad de IVA de la DIAN.
- `MoneyPipe` (`| money`) formatea en la moneda y el locale del país activo, en lugar de repetir
  `currency: 'MXN' : 'symbol-narrow' : '1.2-2'` en las plantillas. Acepta `digitsInfo` como
  `currency` (p. ej. `money: '1.0-0'` para KPIs).

Código: `src/app/core/country/country.model.ts`, `country-profiles.ts`,
`active-country.ts`, `money.pipe.ts`.
