# Sistema de diseño — Conciliation

> Fuente de verdad: **no es una recomendación de la skill `ui-ux-pro-max`**, es el
> código real ya construido y verificado en el dashboard de conciliación bancaria
> (`src/app/features/reconciliation-dashboard/`). Este documento existe para que
> los próximos módulos (y cualquier sesión futura) reutilicen exactamente estas
> decisiones en vez de reinventarlas o improvisar otras distintas.
>
> Origen del punto de partida (v1, antes de las iteraciones de esta sesión):
> paleta **Banking/Traditional Finance** + tipografía **Dashboard Data** (Fira
> Sans/Fira Code) + patrón **Data-Dense Dashboard**, de la skill `ui-ux-pro-max`.
> Todo lo que sigue documenta cómo terminó realmente después de las iteraciones.

## Stack

| | |
|---|---|
| Framework | Angular 22 (standalone components, signals, `@if`/`@for`) |
| Gestor de paquetes | pnpm |
| UI kit | ng-zorro-antd v22 (MIT, sin license key) |
| Animaciones | API nativa de Angular (`animate.enter`/`animate.leave`) — **no** `@angular/animations` (deprecado en v22) |
| Locale | `es-MX` (`LOCALE_ID`), ng-zorro en `es_ES` (no hay `es_MX` en ng-zorro todavía) |
| Ruteo | `provideRouter(routes, withComponentInputBinding())` — un param de ruta (p. ej. `:tenderMedia`/`:orderId`) se recibe como `input<string>()` en el componente, sin `ActivatedRoute`/`paramMap` manual (ver `difference-management.ts`). Un param ausente llega como `undefined` al input — el componente decide qué hacer (validar, redirigir, default). |

## Estructura de carpetas (por feature)

```
src/app/
├── core/              # singletons, se instancian una sola vez
│   ├── layout/shell/    # Grid de <app-menu> + <app-header> + <router-outlet>
│   ├── layout/menu/     # nav lateral colapsable (iconos + etiquetas)
│   ├── layout/header/   # toggle de tema, selector de paleta, card de usuario logeado
│   └── services/        # ThemeService, PaletteService, MenuService, color-utils
├── shared/            # reutilizable entre features — NUNCA depende de features/
│   ├── components/      # match-status-tag, sale-status-tag, sparkline, radial-progress
│   ├── models/           # tipos de dominio compartidos (TransactionMatch, Sale, etc.)
│   ├── mock-data/        # datasets mock usados por 2+ features (ver abajo)
│   ├── utils/            # funciones puras usadas por 2+ features (cross-match.util.ts)
│   └── styles/           # partials SCSS (@use) — ver "Patrón de layout" abajo
└── features/
    └── <feature>/
        ├── data/           # <Feature>Service (signals) + mock/utils propios del feature
        └── <feature>.{ts,html,scss}
```

Regla dura: `shared` no importa de `features`. Si un modelo/componente/mock/util
empieza siendo específico de un feature pero un SEGUNDO feature lo necesita,
sube a `shared/` (mismo criterio en todo el proyecto — modelos, componentes,
mocks, utils puros o partials SCSS: así se hizo con `_summary-strip.scss`/
`_back-link.scss`/`_status-dot.scss`, y con `cross-match.util.ts` +
`sales-settlements.mock-data.ts` + `tender-media-status.mock-data.ts` al
aparecer segundos consumidores de lo que antes vivía en el `data/` de un solo
feature — hoy esos dos últimos los consumen `reconciliation-dashboard` y
`difference-management` juntos, ver "Patrón: cruce transacción a transacción"
más abajo).

Una función de derivación pura y testeable (sin estado, sin DI) que un
`<Feature>Service` consume va en su propio archivo — junto al service si es
específica de ESE feature (`data/<algo>.util.ts`), o en `shared/utils/` si un
segundo feature la necesita (así terminó `cross-match.util.ts`). Nunca inline
en el service ni en el componente.

## Tokens de color

Definidos como CSS custom properties en `src/styles.scss`, bajo `:root` (claro)
y `html.dark` (oscuro). **Nunca hardcodear un hex en un componente** — siempre
`var(--color-*)`.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-primary` | `#0f172a` | `#eab308` | Marca — bordes hover, focus, dona por defecto |
| `--color-on-primary` | `#ffffff` | `#0f172a` | Texto sobre `--color-primary` |
| `--color-secondary` | `#1e3a8a` | `#93c5fd` | Énfasis secundario |
| `--color-accent` | `#a16207` | `#eab308` | CTA |
| `--color-background` | `#eef1f6` | `#020617` | Fondo de página (`body`, `.shell`) |
| `--color-foreground` | `#020617` | `#f8fafc` | Texto principal |
| `--color-card` | `#ffffff` | `#141a2e` | Fondo de tarjetas/tabla |
| `--color-card-foreground` | `#020617` | `#f8fafc` | Texto sobre card |
| `--color-muted` | `#e4e8ef` | `#1c2338` | Fondos tenues (hover de fila, header de tabla) |
| `--color-muted-foreground` | `#475569` | `#94a3b8` | Texto secundario/etiquetas |
| `--color-border` | `#dde2ea` | `#33395a` | Bordes |
| `--color-ring` | `#0f172a` | `#f8fafc` | Focus ring |
| `--color-chart-donut` | `#2563eb` | `#eab308` | Acento de gráficas (dona KPI) |
| `--card-shadow` | ver `styles.scss` | ver `styles.scss` | Sombra de `.ant-card` (ver "Patrón: card base" abajo) |

### Colores semánticos — **fijos, no cambian con la paleta**

| Token | Claro | Oscuro | Significado |
|---|---|---|---|
| `--color-success` | `#16a34a` | `#22c55e` | Conciliado / al día |
| `--color-warning` | `#d97706` | `#f59e0b` | Pendiente |
| `--color-destructive` | `#dc2626` | `#ef4444` | Discrepancia / atrasado |

**Regla dura:** estos tres nunca se tocan por el selector de paleta ni por
ninguna personalización de marca. Su significado está atado al ESTADO de un
movimiento, no al gusto visual — mezclarlos rompe la semántica (ver
`PaletteService`, que los excluye explícitamente de `TOKEN_NAMES`).

### Selector de paleta (personalización en runtime)

`core/services/palette.service.ts` + `core/services/color-utils.ts`.

- 6 acentos base: Azul `#2563eb`, Índigo `#4f46e5`, Violeta `#7c3aed`, Rosa
  `#db2777`, Cian `#0891b2`, Dorado `#eab308` — deliberadamente distintos de
  verde/ámbar/rojo semánticos.
- Al elegir uno, se deriva una paleta COMPLETA (14 tokens: primary, secondary,
  accent, background, foreground, card, muted, border, ring, chart-donut +
  sus "on-*") a partir del **matiz (hue)** de ese color, con fórmulas HSL
  distintas para claro/oscuro — no son 6×2 paletas hardcodeadas.
- Se recalcula solo con el modo (claro/oscuro), independiente de él una vez
  elegido (si activas "Rosa", sigue siendo rosa aunque cambies de tema).
- Persiste en `localStorage` (`conciliation-palette`). Click de nuevo sobre el
  color activo lo desactiva (vuelve al default de `styles.scss`).
- UI: botón de paleta junto al toggle de tema en el header (`nz-popover` con
  grid de 6 swatches circulares).

### Puente ng-zorro-antd ↔ tokens (`styles.scss`, sección final)

ng-zorro trae colores fijos de Ant Design (`.ant-card{background:#fff}`) que
**no leen nuestras variables**. Hay un bloque de overrides con `!important`
que conecta `nz-card`, `nz-table`, encabezado de tabla, `nz-select`,
`nz-picker`, `nz-drawer`, `nz-dropdown-menu`, `nz-tabs` y `nz-modal`
(confirm/`nzOnOk` incluido) a `--color-*`. **Cualquier componente nuevo de
ng-zorro que uses por primera vez, revisa si necesita su propia entrada
aquí** (patrón: buscar el selector real en
`node_modules/ng-zorro-antd/ng-zorro-antd.min.css`, confirmar que trae un
color hardcodeado, y puentearlo).

El criterio real para bridgear no es "es la primera vez que lo uso" sino "su
fondo/texto fijo queda ilegible o descuadrado en modo oscuro" — `nz-switch`,
`nz-checkbox` y `nz-avatar` (primer uso de los tres en "Administración de
usuarios", ver más abajo) se dejaron SIN bridge a propósito: su gris/azul de
Ant por defecto no rompe la lectura en ningún modo, mismo criterio ya
aceptado para botones primarios y `nz-radio-group` (azul de Ant sin
bridgear desde `sales-dashboard`, nunca corregido a navy/dorado). El color
del avatar de iniciales tampoco se resolvió bridgeando `.ant-avatar` —
`user-list`/`user-detail` y el card de usuario del `Header` le pasan
`[ngStyle]` con `--color-primary`/`--color-secondary`/`--color-accent` por
instancia (rotación por hash de un id estable, ver
`shared/utils/avatar-color.util.ts` — promovido ahí desde
`features/user-management/data/` al aparecer el Header como segundo
consumidor), que ya son tokens — un bridge global de `.ant-avatar` habría
sido redundante.

Pendiente conocido: el borde de `nz-range-picker` no toma `--color-border`
pese a varios overrides reforzados — cosmético, no bloqueante, sin causa raíz
confirmada aún (posible tooling del entorno de verificación, no descartado
del todo). Investigar con captura de pantalla real antes de insistir más con CSS.

### Patrón: card base (aplica a TODA `nz-card`, actual y futura)

`.ant-card { border: 1px solid var(--color-border); border-radius: 8px;
box-shadow: var(--card-shadow); background: var(--color-card); }` vive en el
bloque de puente de `styles.scss` — **no** en el `.scss` de cada feature. Un
módulo nuevo que use `<nz-card>` hereda esto automáticamente sin tocar nada;
no repitas estas propiedades en un componente a menos que necesites
DESVIARTE (como `.table-card`, ver abajo). Verificar que esto siga
cumpliéndose es tan simple como: ¿la card nueva se ve con borde + esquinas
redondeadas + sombra sin que su propio `.scss` declare nada de eso? Si no,
algo con más especificidad la está pisando (mismo gotcha de siempre, ver
"Gotcha de CSS" en `sales-dashboard`).

**Gotcha real encontrado con `.table-card`**: la regla de `_data-table.scss`
(`.table-card { border-radius: 0; }`, la excepción documentada para que las
tablas mantengan bordes rectos) dejó de funcionar al agregar el bloque de
arriba — las tablas aparecieron con esquinas redondeadas Y una sombra que
nunca debieron tener. La causa NO fue especificidad (`.table-card` con su
atributo `[_ngcontent-*]` de encapsulación YA es más específico que
`.ant-card` sola) sino **`!important`**: el bloque de card base usa
`!important`, y una declaración con `!important` le gana a CUALQUIER
declaración sin `!important` sin importar cuánto más específico sea su
selector — la especificidad solo desempata entre reglas de la MISMA
importancia. La solución fue agregar `!important` también a `.table-card`
(border/border-radius/box-shadow, los tres explícitos a "ninguno", no solo
heredados). **Regla general**: cualquier excepción puntual a `.ant-card`
(o a cualquier bridge con `!important` en `styles.scss`) necesita su propio
`!important` para poder ganar — confirmar visualmente después de escribirla,
nunca asumir que "más específico" alcanza cuando el otro lado ya usa
`!important`.

### Patrón: card centrada (formulario de una sola columna)

`.card-centered` (`user-detail.scss`) — `max-width: 560px; margin: 0 auto;`
sobre el `<nz-card>`, para cuando una pantalla es UN SOLO formulario sin
nada al lado (creación de usuario, "Organización") y no debe estirarse de
borde a borde como sí hacen las cards de `.tab-columns` ("Información
general"/"Seguridad y acceso", ver arriba) o una tabla. Dentro de
`.card-centered`, el botón de guardar (`.user-form__submit`) se centra
horizontalmente en vez de pegarse a la izquierda — sigue siendo el último
elemento del formulario, así que "abajo de la card" ya lo resuelve el flujo
normal del documento, sin necesitar un spacer ni una card de altura fija.

### Patrón: botones — radius uniforme + color atado a la paleta

Bloque de puente en `styles.scss` (después del de `.ant-card`). Dos
problemas que resolvió a la vez:

1. **`border-radius` de Ant (2px) → 8px en todos**, mismo valor que las
   cards — `.ant-btn { border-radius: 8px !important; ... }`.
2. **Los botones no reaccionaban al selector de paleta**: `.ant-btn-primary`
   traía su azul de Ant (`#1890ff`) fijo en el CSS precompilado,
   completamente ajeno a `--color-primary`. Se puentea
   `background`/`border-color` a `var(--color-primary)` (y `color` a
   `var(--color-on-primary)`) — como `PaletteService` ya escribe esa
   variable en `<html>` en runtime, el botón cambia solo, sin tocar
   `PaletteService`. Hover/focus/active usan `filter: brightness(1.1/0.9)`
   en vez de un segundo tono fijo (no hay un token "--color-primary-hover" y
   crear uno solo para esto habría sido de más) — funciona con cualquier
   matiz sin necesitar más tokens.
3. **"Semáforo" preservado a propósito**: `nzDanger` (`.ant-btn-dangerous`)
   se puentea a `var(--color-destructive)` — **fijo, no sigue la paleta** —
   mismo criterio que los 3 colores semánticos de la sección de tokens
   ("fijos, no cambian con la paleta"): un botón de eliminar debe seguir
   leyéndose como destructivo sin importar qué acento haya elegido el
   usuario. `.ant-btn-text`/`.ant-btn-link` también se puentearon (color de
   Ant fijo en negro/azul, invisible o desentonado en oscuro) — mismo
   criterio de siempre: revisar el CSS compilado antes de asumir que un
   componente "ya está temeado".
4. **Orden de las reglas = orden de especificidad de Ant** (base → primary →
   dangerous → dangerous+primary → link → dangerous+link → text →
   disabled): todas usan `!important` con la MISMA especificidad (una sola
   clase), así que el orden de declaración decide cuál gana — igual que en
   el CSS fuente de ng-zorro. Cualquier override LOCAL de color sobre un
   `nz-button` (como `.row-menu-trigger` en `user-list`) necesita su propio
   `!important` para poder ganarle a este bloque — mismo gotcha que
   `.table-card` de arriba.

Pendiente/deuda deliberada: `nz-radio-group`/`nz-switch` siguen sin
bridgear (azul de Ant fijo) — "los botones" de este pase se entendió como
`nz-button`/`.ant-btn`, no como cualquier control interactivo de ng-zorro.
Si un módulo futuro necesita que un radio-toggle o un switch también se
ajuste a la paleta, es el mismo patrón: revisar el CSS compilado, puentear
`background`/`border-color` al token correspondiente.

`--color-background` y `--color-card` se separaron a propósito (antes casi
idénticos — `#f8fafc`/`#ffffff` en claro, una diferencia de 1-2 puntos de
luminosidad en las paletas derivadas por `PaletteService`) para que la card
se lea como una superficie ELEVADA sobre la página, no como el mismo plano:
en claro el fondo baja de tono (más gris) y la card se queda cerca del
blanco puro; en oscuro es al revés, la card sube de tono (más clara) sobre
un fondo casi negro. `PaletteService.buildPalette()` seedea `--color-muted`/
`--color-border` en cadena a partir de esos dos para que seguir siendo
distinguibles entre sí — si ajustas alguno de los 4, revisa los otros tres
en la misma función antes de dar por bueno un solo hex.

## Tipografía

```scss
--font-heading: 'Fira Sans', sans-serif;
--font-body: 'Fira Sans', sans-serif;
--font-mono: 'Fira Code', monospace;   // cifras/tablas — tabular-nums
```

Google Fonts cargadas en `index.html` (`preconnect` + `<link>`), no `@import`
en CSS. Clase `.font-mono` (o `.nz-table-numeric-cell`) para cualquier celda
numérica — activa `font-variant-numeric: tabular-nums` para alinear dígitos.

## Densidad y layout

```scss
--grid-gap: 16px;      // gap por defecto entre cards/secciones
--card-padding: 16px;  // referencia, no todos los cards lo usan igual
--header-height: 56px;
```

- KPI: **máximo 3 indicadores arriba**, la fila entera topada a
  `max-height: 22vh` (regla dura — nunca más de ~1/3 de la ventana).
- Padding interno de KPI card: `8px` uniforme (no `10px 12px`) cuando el
  card tiene un elemento decorativo (dona) que debe quedar a una distancia
  exacta y conocida del borde.
- Tablas: sin `border-radius` (bordes rectos, no curvos — regla explícita).
  Columnas de texto libre (descripción, categoría, referencia, orden) llevan
  la clase genérica `.col-truncate` (`shared/styles/_data-table.scss`) con el
  ancho vía variable CSS inline — `<th class="col-truncate" style="--col-max-width: 220px">` —
  más `[attr.title]` en el `<td>` con el texto completo. Nunca una clase
  `.col-<nombre-de-columna>` por columna (así empezó y se refactorizó a esto).

## Componentes reutilizables (`shared/components`)

| Componente | Selector | Para qué |
|---|---|---|
| `MatchStatusTag` | `<app-match-status-tag [status]="...">` | Traduce `MatchStatus` (cruce venta/liquidación) a `nz-tag` con color+label. Patrón: cualquier enum de estado nuevo debería tener su propio "X-tag" así, no un `[ngSwitch]` inline repetido — así nació también `SaleStatusTag` para `SaleStatus` en `sales-dashboard`. |
| `Sparkline` | `<app-sparkline [values]="number[]" [color]="...">` | Gráfica de área estilizada (línea delgada + degradado bajo la curva), SVG puro, sin librería de charting. |
| `RadialProgress` | `<app-radial-progress [percent]="..." [color]="...">` | Anillo de progreso, llena el 100% de su contenedor (el tamaño lo decide el padre vía CSS). `preserveAspectRatio="meet"` — nunca se distorsiona aunque su caja no sea cuadrada. |

## Patrón de layout: card de KPI (con o sin gráfica)

Las clases `.kpi-grid`/`.kpi-card`/`.kpi-card__*` viven en
**`shared/styles/_kpi-card.scss`** (partial SCSS, no un componente Angular).
Cualquier feature con una fila de KPIs le hace `@use '../../shared/styles/kpi-card';`
al inicio de su `.scss` — **no copiar/pegar estas clases**, es exactamente el
problema que este documento existe para evitar. Mismo patrón para
`shared/styles/_toolbar.scss` (`.toolbar`/`.toolbar__filter`) y
`shared/styles/_data-table.scss` (`.table-card`, `.clickable-row`,
`.col-truncate`, `.text-right/success/destructive/muted`).

Estructura repetible para cualquier KPI (usada en `reconciliation-dashboard.html`):

```html
<nz-card class="kpi-card" [nzBodyStyle]="{ padding: '8px', height: '100%', display: 'flex', flexDirection: 'column' }">
  <span class="kpi-card__title">Título</span>
  <div class="kpi-card__body kpi-card__body--donut"> <!-- o --stacked o --stat -->
    <div class="kpi-card__stat"> <!-- valor + delta --> </div>
    <div class="kpi-card__donut"> <!-- o kpi-card__sparkline; --stat no lleva esto --> </div>
  </div>
</nz-card>
```

Tres variantes de `.kpi-card__body`:

- `--donut` (dona a un costado): la dona se **centra** en el espacio libre
  tras el texto vía `margin: 0 auto` en `.kpi-card__donut` (sin `gap` en el
  contenedor — un `gap` fijo rompe la simetría del centrado).
- `--stacked` (gráfica abajo): info arriba, `app-sparkline` abajo ocupando el
  resto del alto (`flex: 1 1 auto`).
- `--stat` (solo número, sin visual): centra `.kpi-card__stat` verticalmente
  en el card. Úsalo cuando el KPI no tiene (o no necesita) una gráfica de
  apoyo — no fuerces un donut/sparkline decorativo solo por consistencia
  visual. Primer consumidor: los 3 KPI de `user-list` (Usuarios totales /
  Cuentas activas / Cuentas inactivas) — ninguno tiene gráfica de apoyo, solo
  una cifra. (El patrón de "resumen global" de abajo sigue siendo un caso
  distinto: una sola card con varias métricas, no varias cards
  independientes.)

Deltas ("+5 pts vs. ayer", o simplemente una segunda línea con `.text-muted`):
triángulo SVG inline (no icon font, no emoji) + color success/destructive
según signo cuando el delta es una comparación; texto plano `.text-muted`
cuando es solo contexto (p. ej. "3 de 6 transacciones").

## Patrón de layout: resumen global (tira de métricas en una sola card)

Distinto del patrón de KPI cards de arriba — aquí NO son indicadores
independientes, es **una sola card** con varios campos/sumas relacionados en
fila. Usado en `difference-management.html` para la identidad de una orden
puntual: Orden / Medio de pago / Fecha / Estado / Monto vendido / Monto
liquidado / Diferencia. Vive en **`shared/styles/_summary-strip.scss`**
(promovido en su momento desde `tender-detail`, que también lo usó para un
resumen del día — ese feature se retiró por completo, ver "Patrón: cruce
transacción a transacción" más abajo; el partial se quedó porque
`difference-management` lo sigue necesitando).

```html
<nz-card class="summary-card" [nzBodyStyle]="{ padding: '14px 16px' }">
  <div class="summary-strip">
    <div class="summary-strip__item">
      <span class="summary-strip__label">Etiqueta</span>
      <span class="summary-strip__value">{{ valor | currency: 'MXN' : 'symbol-narrow' : '1.0-0' }}</span>
    </div>
    <!-- más .summary-strip__item, separados por borde izquierdo excepto el primero -->
  </div>
</nz-card>
```

Reglas: `grid-template-columns: repeat(N, 1fr)`, `N` configurable con la
variable CSS `--summary-strip-cols` en el `nz-card` contenedor (default `5`;
`difference-management` usa `4` para sus 7 campos) — colapsa a 2 columnas en
`max-width: 900px` sin importar `N`.
Separador `border-left` entre items (no gap solo). El valor NUNCA lleva color
por defecto — solo se colorea (`.text-warning`, `.text-destructive`) cuando
el número representa algo que requiere atención, igual que en las tablas. Un
campo que no es numérico (p. ej. un `*StatusTag`) no usa la clase
`.summary-strip__value` — se coloca el componente directo dentro de
`.summary-strip__item`, sin forzar la tipografía mono/bold pensada para cifras.

## Convención: "hoy" sin backend

No hay reloj real que usar — el `new Date()` del navegador correría
desalineado de los datos mock (fijos en agosto de 2026) y "hoy" mostraría
siempre una tabla vacía. Cada feature que necesite "hoy" define su propia
constante `APP_TODAY_ISO` en su `data/*.service.ts` (ver
`sales-dashboard.service.ts`) — **no** una global compartida todavía (hoy es
1 solo uso; `tender-detail` tenía la suya propia, se fue con el feature al
retirarse, ver nota histórica abajo). Si aparece un segundo consumidor, ese
es el momento de subirla a `shared`.

## Patrón de layout: Header (extraído de Shell) y card de usuario logeado

`core/layout/header/` (`Header`, selector `app-header`) — extraído de
`Shell` para aislar navegación + acciones + identidad del usuario logeado en
su propio componente; `Shell` solo orquesta `<app-header>` +
`<router-outlet>` (`shell.html`/`.ts`).

- El Header **no lleva fondo ni línea divisora** — flota sobre
  `--color-background`, a diferencia de cualquier otra "card" del sistema.
  `.shell__header` (wrapper `nz-header`) solo neutraliza el fondo navy y el
  alto/line-height por defecto de `.ant-layout-header`; el layout real
  (flex, gap, padding) vive en `.app-header` dentro de `header.scss`.
- Card de usuario logeado (`.user-card`, extremo derecho del Header,
  después de los `.icon-button`): rectángulo con el **ancho al doble del
  alto** (`96px × 48px`), `border-radius: 8px`, fondo `--color-card`
  (blanco en modo claro — el único elemento con fondo propio dentro del
  Header). Contenido: `nz-avatar` de iniciales (mismo patrón de
  `avatarTokensFor`/`initialsFor` que `user-list`, ver abajo) + una columna
  con el nombre en negritas arriba y el rol debajo, ambos con
  `text-overflow: ellipsis` + `[attr.title]` con el nombre completo y el rol
  (el card es angosto a propósito, no se agranda por texto largo).
- **"Primer nombre + primer apellido"**, no el nombre completo: se deriva
  con un `computed()` en `Header` que toma los dos primeros tokens de
  `AuthUser.fullName` (`"Ana Martínez López"` → `"Ana Martínez"`) — función
  trivial de un solo consumidor, vive inline en el componente, no en su
  propio archivo (no amerita `shared/utils/` todavía).
- `AuthUser`/`MockUser` (`features/auth/data/`) tienen `fullName` y `role`
  además de `displayName` — `displayName` es histórico y sigue usándose tal
  cual como `actorName` en la auditoría de `user-management`
  (`UserManagementService`); no se reutilizó para el card del Header porque
  no es un nombre real de persona en los datos mock, es un texto tipo-rol.
  Mantenerlos separados evita forzar un campo a cumplir dos propósitos
  distintos.

### Acciones del Header: búsqueda de pantallas y notificaciones

`app-header__actions` (de izquierda a derecha): buscador → notificaciones →
cerrar sesión → card de usuario. **Ya no hay toggle de tema ni selector de
paleta en el Header** (se quitaron a pedido explícito). `ThemeService` sigue
viva porque `login.ts` todavía la usa fuera de `Shell`. Si al leer esto
`PaletteService`/`ThemeService` ya tienen otro punto de entrada de UI (p.
ej. en `Menu`), es porque se movieron ahí después de este cambio — no es
parte de lo que documenta esta sección, revisar el commit que lo haya
introducido.

- **Búsqueda** (`core/layout/header/header-search.util.ts` +
  signals en `Header`): el botón de lupa (`.icon-button`) y el input de
  búsqueda **nunca conviven** — un `@if`/`@else` sobre `searchOpen()` los
  intercambia dentro del mismo `.app-header__search`, así el dropdown de
  resultados se posiciona relativo a ese contenedor sin importar cuál de
  los dos está montado. El input (`.search-box__input`) es un pill
  (`border-radius: 9999px`) con el icono de lupa **dentro**, a la
  izquierda, vía `position: absolute` — mismo criterio de "esquinas
  totalmente redondeadas" que ya usan `.icon-button`/`.palette-swatch`.
  - `SEARCHABLE_PAGES`: registro estático de rutas SIN params (Dashboard,
    Conciliación, Usuarios, Nuevo usuario, Auditoría de usuarios) — las
    rutas con `:param` (`difference-management`, `usuarios/:userId`) se
    excluyen a propósito, no tienen un destino único que buscar. `searchPages()`
    es la función pura de filtrado (label + keywords, substring
    case-insensitive) — sin resultados con query vacío, el dropdown solo
    aparece mientras se escribe.
  - **"pantallas que el usuario pueda tener acceso"**: hoy `AuthUser` no
    tiene permisos granulares (ver bullet de `fullName`/`role` arriba), así
    que el registro es el mismo para cualquier logeado — el comentario en
    `header-search.util.ts` deja explícito que el filtrado por permisos
    llega ahí el día que `AuthUser` los tenga, no inventar un sistema de
    permisos paralelo solo para el buscador.
  - **Foco automático**: `viewChild('searchInput')` + un `effect()` en el
    constructor que llama `.focus()` cuando `searchOpen()` pasa a `true` —
    no se puede enfocar en el mismo tick de `openSearch()` porque el
    `@else` todavía no renderizó el `<input>`.
  - **Cerrar sin perder el click de un resultado**: cada
    `.search-box__result` lleva `(mousedown)="$event.preventDefault()"` —
    evita que el input pierda el foco (y dispare `(blur)="closeSearch()"`)
    antes de que el `(click)` de navegación llegue a correr. Patrón estándar
    de combobox, sin necesidad de `setTimeout`. `Escape` cierra explícito
    (`closeSearch()`), `Enter` navega al primer resultado si hay alguno.
- **Notificaciones**: mismo patrón de `nz-popover` que ya usaba el selector
  de paleta (trigger `click`, `nzPopoverPlacement="bottomRight"`) — hoy solo
  muestra "No tienes notificaciones nuevas." porque no existe todavía un
  sistema de notificaciones real en la app; el botón queda listo para
  conectarse a uno sin cambiar el patrón de interacción.

## Patrón: navegación entre módulos (Menu lateral)

Los módulos de nivel superior se acceden desde `core/layout/menu/` (`Menu`,
selector `app-menu`) — tres links con icono: `Dashboard` (`/dashboard`,
`sales-dashboard`, resumen de venta — la pantalla de aterrizaje tras login),
`Conciliación` (`/conciliacion`, `reconciliation-dashboard` — vivió en
`/dashboard` hasta que ese path pasó a ser el resumen de venta) y `Usuarios`
(`/usuarios`). `routerLinkActive` con su default (`exact: false`) alcanza
para marcar "Conciliación" activo también en
`/conciliacion/:tenderMedia/diferencias/:orderId` (la ruta de
`difference-management`, que cuelga de `conciliacion` pero no tiene entrada
propia en el menú — se llega solo desde una fila accionable de la tabla).

**Si mueves qué vive en qué ruta** (como pasó con `/dashboard`: pasó de
`reconciliation-dashboard` a `sales-dashboard`), revisa TODOS los
`routerLink`/`navigateByUrl` que apuntan al path viejo antes de asumir que el
rename es seguro. `login.ts` apunta a `/dashboard` post-login, y eso sigue
siendo correcto porque el resumen de venta es la pantalla de aterrizaje
deseada, no un accidente.

### Historial: del nav de texto en el Header al Menu lateral

Hasta el tercer link (`/usuarios`, al agregar "Administración de usuarios")
la navegación vivió como texto plano en `.shell__nav`/`app-header__nav`
dentro del Header — este documento ya anticipaba ese punto como el
disparador para evaluar una barra lateral, pero en ese momento se decidió NO
migrar todavía (3 links de texto no apretaban el header en desktop, y
puentear `.ant-menu` a los tokens no se justificaba por un link más). La
migración ocurrió después, no por un cuarto módulo sino porque se pidió
explícitamente un menú lateral colapsable — y se resolvió con links propios
(`<a class="app-menu__link">`) en vez de `nz-menu`/`.ant-menu`: los mismos
efectos de hover/seleccionado que ya existían en `app-header__nav-link` se
reutilizaron tal cual, evitando el trabajo de puentear un componente de
Ant Design nuevo solo para terminar sobrescribiendo su tema por completo.

### Menu lateral: layout, expandido/contraído y tokens

`core/layout/menu/` (`Menu`, selector `app-menu`) + `core/services/menu.service.ts`
(`MenuService` — signal `expanded: boolean`, persistida en `localStorage`,
mismo patrón que `ThemeService`).

- **Layout**: `Shell` (`shell.html`/`.scss`) es un CSS Grid de 2 columnas ×
  2 filas (`grid-template-columns: auto 1fr`, `grid-template-rows:
  var(--header-height) 1fr`), alto fijo `100vh` (no `min-height`) con
  `overflow: hidden`. `.shell__menu` ocupa la columna izquierda y abarca
  **ambas filas** (`grid-row: 1 / 3`) — por eso mide el largo total de la
  pantalla y "se ve por arriba" del header, que solo ocupa la fila 1 de la
  columna derecha junto con `.shell__content` en la fila 2. El ancho de la
  columna del menú es `auto`: lo determina el propio ancho de `.app-menu`
  (64px contraído / 220px expandido), así que expandir/contraer empuja el
  contenido (push layout) en vez de superponerse — sin variables CSS
  compartidas entre `Menu` y `Shell` para el ancho.
- **Scroll**: al ser `.shell` de alto fijo, el scroll de una tabla larga
  queda contenido en `.shell__content` (`overflow-y: auto`), no en la
  página completa — así el menú (y el header) nunca se desplazan fuera de
  vista. Cambio de comportamiento respecto al layout anterior (que sí
  scrolleaba la página completa), necesario para que el menú mida siempre
  el alto real de la pantalla.
- **Despegado de los bordes**: `.app-menu` lleva `margin: 4px 0 4px 4px` y
  `height: calc(100% - 8px)` — **restar los 8px es obligatorio**, si el
  alto se deja en `100%` la caja excede el alto de `.shell` y el margen
  inferior queda recortado por su `overflow: hidden` en vez de verse como
  espacio real (bug real encontrado al implementar esto).
- **Colores compartidos con `.user-card`**: `.app-menu` usa exactamente los
  mismos dos tokens que la card de usuario del Header —
  `background: var(--color-on-primary)` y
  `border: 1px solid var(--color-border)` — para que ambas superficies
  "flotantes" del layout luzcan consistentes. `border-radius: 8px`, igual
  que el resto de cards flotantes del sistema.
- **Contraído/expandido**: `MenuService.expanded` controla la clase
  `.app-menu--expanded` (`width: 220px`; contraído son `64px`). Contraído
  solo se ven los iconos (`.app-menu__label` en `display: none`) — cada
  link lleva `[attr.title]` con el nombre de la pantalla como tooltip
  nativo cuando está contraído. Un botón `.app-menu__toggle` (chevron que
  cambia de dirección según el estado) alterna `MenuService.toggle()`.
- **Efectos de hover/seleccionado**: son los mismos que ya existían en
  `app-header__nav-link` antes de la migración (`background:
  var(--color-muted)` + `color: var(--color-foreground)`, en hover y en
  `.app-menu__link--active`) — no se inventó un estilo nuevo. Lo único
  agregado es que el **icono** (`.app-menu__icon`, `color: inherit` por
  defecto) pasa a `color: var(--color-primary)` específicamente cuando el
  link está activo, para que se note cuál pantalla está seleccionada
  incluso contraído (sin la etiqueta de texto visible).

### Historial: "Detalle por tender media" (retirado)

Existió durante dos iteraciones como módulo aislado (`/detalle`, con su
propio selector `tender-media-picker` y una pantalla `tender-detail` que
mostraba el cruce venta/liquidación **por medio de pago**, uno a la vez) con
entrada propia en el menú de `Shell`. Se retiró por completo al unificar esa
tabla con la de `reconciliation-dashboard` — mostrar el mismo cruce en dos
tablas separadas (una por tender media individual, otra consolidada con
todos) no aportaba nada, así que `reconciliation-dashboard` absorbió el
cruce completo de los 4 medios de pago a la vez (ver "Patrón: cruce
transacción a transacción" abajo) y `tender-detail`/`tender-media-picker` se
borraron junto con su ruta y su link de menú. `difference-management` (la
única pantalla que dependía de `tender-detail`) se reapuntó a colgar de
`/conciliacion/:tenderMedia/diferencias/:orderId` en vez de
`/detalle/:tenderMedia/diferencias/:orderId` — su lógica interna no cambió,
solo su padre de ruta y sus links "Volver".

## Patrón de layout: toggle de periodo para KPIs (día/mes)

Usado en `features/sales-dashboard` — un `nz-radio-group` con
`nzButtonStyle="solid"` y `nzSize="small"` arriba del `.kpi-grid`, dos
opciones (`día`/`mes` como tipo unión, no boolean — un tercer periodo futuro
como "año" no debería requerir invertir la lógica). El toggle recalcula
SOLO las cards de KPI (`summary` en el service, `computed` que lee
`period()`); la tabla debajo tiene su propio alcance fijo e independiente
("hoy", sin importar el periodo elegido en los KPI) — dos conceptos
distintos que no deben compartir una sola señal de filtro aunque ambos
"filtran por fecha". Ver `sales-dashboard.service.ts`: `todaySales` (tabla,
fijo) vs `scopedSales`/`summary` (KPIs, sigue a `period`).

## Patrón: Drawer de detalle al hacer click en una fila (sin navegar)

Usado en `sales-dashboard` para ver el detalle completo de una venta sin
abandonar la tabla — a diferencia de `reconciliation-dashboard`/
`difference-management`, que sí navegan a otra ruta al hacer click en una
fila accionable. Usar Drawer (no ruta) cuando el detalle es puramente
informativo/de solo lectura y no tiene su propio flujo de acciones que
amerite una URL propia; usar ruta cuando el detalle es "gestionable" (como
resolver una diferencia). Mismo criterio que siguió después `UserDetail`
(ruta, no drawer — sí es gestionable).

- Estado en el service, no en el componente: `selectedSale = signal<Sale | null>(null)`,
  `openSale(sale)`/`closeSale()`. El template solo hace
  `[nzVisible]="service.selectedSale() !== null"` y `(nzOnClose)="service.closeSale()"`.
- Contenido con `<ng-container *nzDrawerContent>` + `@if (service.selectedSale(); as sale)`.
- `nzWidth="50%"` — mitad de la pantalla, no un ancho fijo en px (a
  diferencia del ancho fijo típico de otros drawers de Ant); ajustar aquí si
  un futuro drawer necesita otra proporción, no asumir 50% por defecto.
- Primer uso de `nz-drawer` en el proyecto → necesitó su propia entrada en el
  puente ng-zorro↔tokens (`.ant-drawer-content`, `.ant-drawer-header`,
  `.ant-drawer-title`) — mismo patrón de siempre: cualquier componente nuevo
  de ng-zorro, revisar si trae colores fijos antes de darlo por "ya
  temeado".
- **Secciones fijas, en este orden**: Resumen de la venta (2 columnas, ver
  abajo) → Productos (tabla de `items`, con fila `TOTAL` = suma de
  subtotales únicamente, sin impuestos/propina) → Pagos (tabla de
  `payments[]` — pago MIXTO real, ver `V-2007` en el mock: BBVA + Efectivo en
  la misma venta; fila `TOTAL PAGADO` solo se muestra si hay más de un pago)
  → Descuentos y propinas → Impuestos (base gravable + IVA 16%,
  `SALE_TAX_RATE` en `sale.util.ts`) → Desglose financiero (el recap final:
  subtotal, descuento, IVA, propina, total). Los montos de impuesto y total
  son SIEMPRE derivados (`saleTaxAmount`/`saleTotal` en `sale.util.ts`),
  nunca un campo guardado aparte que se pueda desincronizar. Excepción
  deliberada: cuando una venta trae `payments` explícito (pago mixto), esos
  montos NO se derivan de `saleTotal()` — el reparto entre métodos es un
  dato propio de esa venta que debe sumar el total, no algo calculable a
  partir de él (ver `withPayment()` en `sales-mock.data.ts`: respeta
  `payments` si ya viene, solo deriva un pago único si no).

### Patrón "icono + etiqueta + valor" (2 columnas opcional)

`shared/styles/_summary-columns.scss` (`.summary-columns`/`.summary-col`/
`.summary-field*`) — promovido desde `sales-dashboard.scss` ("Resumen de la
venta" en el drawer) al aparecer un segundo consumidor: `user-detail`
("Información general"/"Organización") lo reutiliza para sus campos, con la
diferencia de que ahí son EDITABLES (nz-input/nz-select dentro de
`.summary-field__control`, con `.summary-field__error` para el mensaje de
validación) en vez de solo texto — `sales-dashboard` sigue usando
`.summary-field__value` (texto) porque su resumen es de solo lectura.
`.summary-fields` es la variante SIN el divisor de 2 columnas, para una sola
card con pocos campos que no necesita partirse (ver "Información general"/
"Organización" de `user-detail`, cada una es una sola lista vertical, no dos
columnas de campos).

Para cuando un grupo de datos relacionados sí debe verse como dos bloques de
igual jerarquía en vez de una sola lista larga (`.summary-columns`):

- Grid de 2 columnas fijas (4 campos + 3 campos aquí, pero el layout no
  asume ningún número concreto — el reparto es decisión de quien lo usa).
  Colapsa a 1 columna en `max-width: 640px` (divisor pasa de `border-right`
  a `border-bottom`).
- El separador entre columnas usa `var(--color-primary)` — **no**
  `var(--color-border)` — es la única línea divisoria del proyecto con el
  acento de marca en vez del borde neutro de siempre; úsalo cuando el
  divisor debe sentirse como parte de la identidad visual (responde al
  selector de paleta), no como una simple separación estructural.
- Cada campo: icono SVG inline (`.summary-field__icon`, `color: var(--color-primary)`,
  `stroke="currentColor"`) + `.summary-field__label` (termina en "`:`") +
  `.summary-field__value` — o, si el valor es un estado, el `*StatusTag`
  directo sin envolverlo en `.summary-field__value` (esa clase fuerza
  `white-space: nowrap` pensado para texto, no para un tag).
- Icono por campo, no genérico: cada uno referencia visualmente su dato
  (documento→folio, calendario→fecha, persona→cliente, tarjeta→medio de
  pago, numeral→referencia, check→estado de venta, eslabones→conciliación).
  Si un campo nuevo no tiene un icono obvio, es señal de que ese campo no
  pertenece a este patrón (úsalo para identidad/metadatos, no para
  cualquier lista de datos).

### Gotcha de CSS: una utilidad compartida puede perder contra un selector
### local con más especificidad

`.text-right` (de `_data-table.scss`) dejó de aplicarse en los headers de
"Productos" porque `.sale-drawer__items th { text-align: left; ... }` (1
clase + 1 elemento) es MÁS específico que `.text-right` sola (1 clase) — el
header se quedaba a la izquierda mientras su columna de valores ya estaba a
la derecha, y visualmente parecía que el valor "se corría" a la columna
siguiente. Nunca asumir que agregar una clase utilidad gana solo por venir
después en el HTML — si el selector local del componente apunta al mismo
elemento con igual o mayor especificidad, hay que neutralizarlo
explícitamente ahí mismo (`&.text-right { text-align: right; }` dentro del
bloque del componente), no en la utilidad compartida.
- `sale.reconciliationStatus` reusa `MatchStatus`/`MatchStatusTag` (no un
  enum nuevo "para ventas") — es el mismo concepto que en
  `reconciliation-dashboard`: ¿ya se cruzó este registro contra lo que
  liquidó el proveedor? `SaleStatus` (`completada`/`cancelada`, su propio
  `SaleStatusTag`) es un concepto DISTINTO — si la venta en sí se completó o
  se canceló — y ambos se muestran juntos en "Resumen de la venta" sin
  fusionarse en un solo estado.

## Iconografía

**Nunca emoji.** SVG inline, `stroke="currentColor"`, `viewBox="0 0 24 24"`,
tamaño `18px` para botones de header (`.icon-button`, `.app-menu__toggle`,
ambos en sus respectivos `.scss`) y `20px` para los links de navegación del
`Menu` (`.app-menu__icon` — un poco más grande porque ahí el icono es el
único elemento visible en estado contraído, no un botón secundario). Patrón
`.icon-button` en `core/layout/header/header.scss` — cualquier botón de
icono nuevo (header o menú) lo reutiliza, no lo reinventa. Sin fondo ni
borde en reposo (solo el icono es visible) y `border-radius: 50%` — el
borde y el fondo tenue solo aparecen en `:hover`, nunca en reposo.

## Servicios de tema (`core/services`)

- **`ThemeService`**: signal `mode: 'light'|'dark'`, persiste en
  `localStorage`, alterna la clase `.dark` en `<html>` Y el `href` del
  `<link id="nz-theme-link">` (ng-zorro no tiene toggle de dark mode vía CSS
  vars — solo dos hojas precompiladas alternas, hay que intercambiar el
  `<link>`).
- **`PaletteService`**: ver arriba. Depende de `ThemeService` (recalcula al
  cambiar de modo).

## Patrón: cruce transacción a transacción entre dos fuentes

En **`shared/mock-data/sales-settlements.mock-data.ts`** y
**`shared/utils/cross-match.util.ts`**. `reconciliation-dashboard` (tabla de
"Conciliación", TODOS los tender media a la vez — `ALL_TENDER_MEDIA.flatMap`
en `reconciliation.service.ts`) y `difference-management` (una orden
puntual) son los dos consumidores del mismo dataset y la misma función de
cruce — no tiene sentido duplicar el mock, ambas pantallas cruzan
EXACTAMENTE las mismas ventas/liquidaciones. (Hasta la iteración anterior
había un tercer consumidor, `tender-detail`, que mostraba este mismo cruce
pero acotado a un solo tender media a la vez — se retiró al unificarse con
`reconciliation-dashboard`, ver "Historial: 'Detalle por tender media'"
arriba). Reutilizar este patrón si un módulo futuro necesita comparar dos
listas independientes por un ID común (p. ej. facturas vs. pagos, inventario
vs. conteo físico):

1. Modelo en `shared/models`: dos entidades "lado A"/"lado B" con un campo de
   cruce común (`orderId`), + un tipo unión de resultado (`MatchStatus`) que
   cubre los 4 casos posibles: coincide, existe en ambos pero difiere, solo en
   A, solo en B. + un tipo `*Match` que trae ambos lados (nullable) y el
   resultado.
2. Función pura de cruce en `shared/utils/cross-match.util.ts` (no en ningún
   service): `Map` por ID del lado B, recorre A marcando coincidencias, luego
   agrega lo de B que quedó sin marcar. Sin estado — se puede probar aislada.
3. Cada `<Feature>Service` que la consume solo orquesta: guarda las listas
   fuente (o las importa del mock compartido), expone `computed` con el
   resultado del cruce (`reconciliation.service.ts` lo corre una vez por
   tender media y concatena; `difference-management` busca una orden puntual
   dentro del resultado), y deriva lo demás de ESE intermedio — nunca del
   filtro de UI (`statusFilter`), que solo debe afectar qué se VE, no qué se
   suma/procesa.
4. Cada uno de los 4 estados tiene su propio color en `MatchStatusTag` — no
   reutilizar los estados de otro dominio de estado aunque coincidan
   visualmente (p. ej. `SaleStatus` de `sales-dashboard` es un concepto
   totalmente distinto, aunque ambos usan verde/rojo).

## Patrón: resolución manual de un cruce (candidatos seleccionables + CSV)

Usado en `features/difference-management` ("Gestión de diferencias", ruta
`/conciliacion/:tenderMedia/diferencias/:orderId`) — a dónde se llega SOLO
desde una fila `sale_only`/`amount_mismatch` de la tabla de
`reconciliation-dashboard` (las otras dos, `matched`/`settlement_only`, no
tienen nada que resolver o no tienen una orden propia que gestionar; ver
`ACTIONABLE_STATUSES` en `reconciliation-dashboard.ts`). Reutilizar si un
módulo futuro necesita que un humano elija manualmente entre varias opciones
candidatas para completar un cruce automático incompleto:

1. **Candidatos, no una lista fija**: una función pura
   (`data/candidate-match.util.ts`) ordena el pool disponible por cercanía
   (monto primero, fecha después) a partir del registro que se está
   resolviendo — nunca una lista estática. Si el motor de cálculo ya traía un
   candidato vinculado (mismo `orderId`, cruce `amount_mismatch`), ese va
   siempre primero, marcado `suggestedByBackend`.
2. **Selección con origen, no un simple booleano**: el estado de selección es
   un `Map<id, 'backend' | 'manual'>` en el service (no un `Set<id>` ni un
   array) — la ausencia de una entrada significa "no seleccionada". Cualquier
   toggle del usuario (incluso sobre algo que el backend ya traía marcado)
   pasa a `'manual'`: el humano acaba de intervenir sobre esa fila, deja de
   ser una decisión automática. El tag de origen (`nz-tag` azul "Backend" /
   morado "Match manual") solo se pinta si la fila está seleccionada — no
   hay tag para candidatos disponibles pero no elegidos.
3. **Cards horizontales, no tabla**: cuando cada fila necesita ser un
   objetivo de click grande (seleccionar/deseleccionar) en vez de solo
   mostrar datos, usar `nz-card` con `role="checkbox"` +
   `[attr.aria-checked]` + `tabindex="0"` + `(keydown.enter/space)` en el
   propio `<nz-card>` (no solo `(click)`) — la card completa es el control,
   el `<input type="checkbox">` interno es puramente visual (sin su propio
   listener, para no duplicar el toggle).
4. **Import CSV sin backend**: `<input type="file" hidden>` disparado por un
   botón (`fileInput.click()`), `FileReader.readAsText`, y un parser puro en
   `data/csv-import.util.ts` que devuelve `{ rows, errors }` — nunca lanza ni
   aborta el import completo por una fila inválida, junta los errores para
   mostrarlos todos juntos y sigue importando el resto. Las filas importadas
   entran al mismo pool de candidatos que las del motor de cálculo, sin
   distinción visual salvo que no traen `suggestedByBackend`.
5. **Nota obligatoria, sin `ReactiveFormsModule`**: a diferencia de `login`
   (formulario con varias reglas de validación reales), aquí es un solo
   campo con una sola regla ("no vacío") — se resuelve con `FormsModule` +
   `[ngModel]`/`(ngModelChange)` contra un signal del service, más un signal
   local `touched` que se activa en `(blur)` para mostrar el error. Usar
   Reactive Forms para un solo campo hubiera sido sobre-ingeniería.

## Patrón: módulo de administración (CRUD + estado + auditoría)

`features/user-management` ("Administración de usuarios", rutas `/usuarios`,
`/usuarios/nuevo`, `/usuarios/:userId`, `/usuarios/auditoria`). Primer módulo
del proyecto que no gira en torno al cruce venta/liquidación — sirve de
referencia para cualquier futuro módulo de administración (roles, catálogos,
configuración) con el mismo shape: lista con filtros + alta/edición +
activar-desactivar + acción sensible con confirmación + auditoría.

**Campos del registro (`AppUser`), organizados en 3 secciones** — la lista
(`user-list`) muestra exactamente los campos de "Información general":
Nombre(s)/Apellidos (separados, no un `fullName` guardado — se deriva con la
función pura `fullName()` del model), Correo, Teléfono, Estado, Fecha de
creación, Última conexión. El detalle (`user-detail`) repite esos mismos
campos en su primera tab y agrega dos tabs más: "Seguridad y acceso" (roles
asignados — **array `roleIds: RoleId[]`, no un rol único** — permisos
efectivos, estado de la cuenta, email verificado, último inicio de
sesión/última actividad, intentos fallidos, 2FA, sesiones activas) y
"Organización" (departamento, área, puesto, administrador responsable —
`managerId` referencia a otro `AppUser` con rol admin/supervisor, ver
`MANAGER_ROLE_IDS`). "Historial" (auditoría) se conservó como cuarta tab
aunque no forma parte de las 3 secciones pedidas — información valiosa ya
construida, ninguna razón para retirarla. Un rol/permiso NUNCA se re-deriva
solo en cada render: cambiar `roleIds` resetea `permissions` a la UNIÓN de
los defaults de los roles seleccionados (`defaultPermissionsForRoles()`), el
admin ajusta desde ahí — mismo criterio de "rol como punto de partida, no
techo fijo" que ya regía con un solo rol.

1. **Service `providedIn: 'root'`, no `providers` de componente**: a
   diferencia de `SalesDashboardService`/`ReconciliationService`
   (recreados por ruta, un solo componente consumidor), `UserManagementService`
   sirve a 3 rutas de nivel superior (lista, detalle, auditoría) que deben
   ver el MISMO estado — mismo criterio que `AuthService`. Cualquier módulo
   futuro con más de una pantalla operando sobre la misma colección mutable
   necesita este mismo alcance, no `providers` por componente.
2. **Un componente, dos modos (crear/editar) por presencia de `:userId`**:
   `/usuarios/nuevo` y `/usuarios/:userId` apuntan al mismo componente
   (`UserDetail`); `isCreate()` es `computed(() => !this.userId())`. Rutas
   estáticas (`nuevo`, `auditoria`) DEBEN declararse antes que `:userId` en
   `app.routes.ts` — si no, el segmento param las captura primero y nunca se
   llega a ellas.
3. **Carga/reset de estado por `effect()` sobre el input de ruta**: mismo
   patrón que `DifferenceManagement` con `tenderMedia()`/`orderId()` — un
   `effect()` en el constructor (no un `computed`, porque tiene
   side-effects: `infoForm.reset(...)`, borradores de rol/permisos) reacciona
   a `userId()` y carga el registro. Lee el service con `untracked()` para
   que el efecto solo dispare al NAVEGAR a otro usuario, no cada vez que
   cualquier usuario cambia en la colección (si no, guardar en otra pestaña
   pisaría un formulario a medio llenar).
4. **Reactive Forms + `ngModel` mezclados a propósito**: nombre/correo tienen
   reglas reales (`required`, `email`, `minlength`) → `ReactiveFormsModule`
   (mismo criterio que `login`). Rol/estado/permisos son selección simple sin
   reglas propias → `[ngModel]`/`(ngModelChange)` contra signals locales
   (mismo criterio que los filtros de `reconciliation-dashboard`). Un control
   `ngModel` DENTRO de un `<form [formGroup]>` que no pertenece a ese
   `FormGroup` necesita `[ngModelOptions]="{ standalone: true }"` o Angular
   lanza un error en runtime — solo aplica cuando el control vive dentro del
   `<form>`; fuera de él (como los checkboxes de permisos, en un `<div>`
   normal) no hace falta.
5. **Nunca factorizar campos de formulario compartidos con
   `<ng-template>` + `*ngTemplateOutlet` cuando hay `formControlName` de por
   medio**: se intentó compartir los campos nombre/correo entre el formulario
   de creación y el de edición así, y falla en runtime
   (`NG01050: formControlName must be used with a parent formGroup
   directive`) — el `ControlContainer` no viaja con la vista incrustada de
   `ngTemplateOutlet` de la forma que uno esperaría. La solución fue duplicar
   el bloque de campos (con sus `<ng-template>` de error, renombrados para no
   chocar) en cada `<form>`. Una duplicación pequeña y explícita es preferible
   a una abstracción que rompe en runtime sin error de compilación.
6. **Confirmación de acciones sensibles vía `NzModalService.confirm()`, no
   `nz-popconfirm`**: eliminar/restablecer contraseña se confirman con
   `this.modal.confirm({ nzTitle, nzContent, nzOnOk })` inyectando
   `NzModalService` (requiere `NzModalModule` en `imports` del componente —
   el servicio no es `providedIn: 'root'`, solo se registra vía el módulo).
   Se prefirió sobre `nz-popconfirm` porque estas acciones se disparan desde
   un item de `nz-dropdown-menu` (`user-list`) — un popconfirm anidado ahí
   compite con el cierre automático del menú al hacer click y es un patrón
   frágil ya conocido en Ant Design. `Modal.confirm()` al ser una llamada
   programática independiente del menú no tiene ese problema.
7. **Restablecer contraseña sin backend**: `resetPassword()` genera una
   contraseña temporal legible (`data/password.util.ts`, función pura) y la
   devuelve una sola vez para mostrarla en un `nz-message` — no se simula un
   envío de correo que la app no puede hacer real. El día que exista backend,
   el service deja de devolver la contraseña y dispara el correo real; el
   componente no cambia.
8. **Auditoría como colección independiente, no un campo del usuario**:
   `AuditLogEntry` guarda `targetUserId` + `targetUserName` (snapshot del
   nombre al momento del evento) y sobrevive a que el usuario se elimine —
   el mock incluye a propósito un usuario fantasma (`u9`, ver
   `user-management-mock.data.ts`) que ya no existe en `MOCK_USERS` pero sí
   tiene entradas de auditoría, para forzar justo ese caso. **Gotcha real
   encontrado**: el generador de ids de usuarios nuevos (`nextUserSeq`) debe
   considerar también los `targetUserId` del log de auditoría, no solo
   `MOCK_USERS.length` — si no, un usuario creado en la sesión puede reciclar
   el id de un fantasma y heredar su historial completo (pasó en esta misma
   sesión de desarrollo; el fix quedó en `maxSeq()` dentro del service).
9. **Rol → permisos por defecto, ajustables por usuario**: `RoleDef.defaultPermissions`
   es un punto de partida, no un techo — `AppUser.permissions` es la lista
   EFECTIVA y puede divergir del default de su rol (ver `Carlos Medina` en el
   mock, auditor con "Exportar reportes" de más). Cambiar de rol
   (`changeRole`) resetea el borrador de permisos a los defaults de ese rol;
   el admin ajusta desde ahí — nunca se re-deriva solo en cada render.
10. **Tabs para un detalle "gestionable" con varias secciones**: variante del
    patrón "Drawer vs. ruta" ya documentado — `UserDetail` (ruta, no drawer,
    porque tiene flujo de acciones propio) usa `nz-tabs` (selector real en
    ng-zorro-antd 22: `nz-tabs`/`nz-tab`, **no** `nz-tabset`) para separar
    Información general / Roles y permisos / Historial cuando un solo
    formulario sería demasiado largo. Modo creación NO muestra tabs (un
    usuario que no existe aún no tiene roles que ajustar en detalle ni
    historial) — un solo formulario mínimo, y tras crear se navega al
    detalle completo con las 3 tabs.

## Pendientes / deuda conocida al cerrar este módulo

1. Borde de `nz-range-picker` no refleja `--color-border` (ver arriba).
2. Página de override: [`pages/login.md`](pages/login.md) — la pantalla de
   login vive fuera de `Shell` (dos paneles, sin header), documentada ahí.
   Sigue el mismo patrón si un módulo futuro necesita desviarse de este
   MASTER.
3. El header de `Shell` (`shell.html`/`.scss`) no tiene breakpoint móvil — en
   `max-width: ~480px` el título "Conciliación Bancaria" se envuelve y queda
   detrás de los botones de acción del header. Preexistente (se reproduce
   también en `reconciliation-dashboard`, no es algo que haya introducido
   `difference-management`) — pendiente de una pasada de responsive en
   `shell.scss`, fuera del alcance de los módulos hechos hasta ahora.
4. El `Menu` lateral (`core/layout/menu/`) tampoco tiene breakpoint móvil —
   en pantallas angostas el ancho fijo (64px contraído / 220px expandido)
   sigue empujando el contenido igual que en desktop, sin volverse un
   drawer/overlay como sería lo esperado en móvil. Mismo criterio que el
   punto anterior: pendiente de la misma pasada de responsive general,
   fuera del alcance de agregar el Menu en sí.
