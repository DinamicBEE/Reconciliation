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

### Colores de tag — **mismo criterio, fijos, distintos de los de arriba**

| Token | Claro | Oscuro | Significado |
|---|---|---|---|
| `--color-tag-success-bg` / `-fg` / `-border` | `#f6ffed` / `#52c41a` / `#b7eb8f` | `#162312` / `#49aa19` / `#274916` | Cruzado / exitoso |
| `--color-tag-error-bg` / `-fg` / `-border` | `#fff2f0` / `#ff4d4f` / `#ffccc7` | `#2a1215` / `#ff7875` / `#58181c` | Discrepancia / error |
| `--color-tag-warning-bg` / `-fg` / `-border` | `#fffbe6` / `#faad14` / `#ffe58f` | `#2b2111` / `#d89614` / `#594214` | Pendiente / advertencia |

Misma semántica que `--color-success`/`-warning`/`-destructive`, pero para el
look "tag" (fondo tenue + texto/borde de color) en vez de relleno sólido —
úsalos cuando el componente es una `nz-tag` o algo con su mismo lenguaje
visual (p. ej. `StatusChip`); usa los de arriba cuando es relleno sólido
(botones, `status-dot`). Los valores claros son un calco 1:1 de lo que
`ng-zorro-antd` trae hardcodeado dentro de `.ant-tag-success/-error/-warning`
(ver `tag/style/index.css` del paquete) — nunca respetaban modo oscuro porque
nadie los puenteaba; los oscuros son el esquema dark que usa Ant Design v5
para sus tags de estado, adaptados a mano (este proyecto no corre el theme
algorithm de Ant). El puente vive en `styles.scss` junto a los demás
(`.ant-tag-success`/`-error`/`-warning { background/color/border-color: var(--color-tag-*) !important; }`)
y retiña de un jalón **todo** `nz-tag` que use `[nzColor]="'success'|'error'|'warning'"`
en la app (`MatchStatusTag`, `SaleStatusTag`, los `nz-tag` sueltos de
"Seguridad y acceso" en `user-detail`) sin tocar esos componentes — mismo
patrón que el resto del puente ng-zorro↔tokens. Fijos, no siguen la paleta.

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
DESVIARTE (como `.table-card`, ver "Patrón: card de tabla" más abajo — hoy la
única desviación de radius que sigue en pie: 12px en vez de 8px, todo lo
demás se hereda igual). Verificar que esto siga cumpliéndose es tan simple
como: ¿la card nueva se ve con borde + esquinas redondeadas + sombra sin que
su propio `.scss` declare nada de eso? Si no, algo con más especificidad la
está pisando (mismo gotcha de siempre, ver "Gotcha de CSS" en
`sales-dashboard`).

**Gotcha histórico con `.table-card`** (la lección sigue vigente aunque la
regla concreta que la disparó ya no exista): en una versión anterior,
`.table-card` fijaba `border-radius: 0` (las tablas de la app eran
deliberadamente planas, sin borde ni sombra — ver más abajo por qué se
abandonó ese criterio) y dejó de funcionar al agregar el bloque de card base
de arriba — las tablas aparecieron con esquinas redondeadas Y una sombra que
no debían tener. La causa NO fue especificidad (`.table-card` con su
atributo `[_ngcontent-*]` de encapsulación YA es más específico que
`.ant-card` sola) sino **`!important`**: el bloque de card base usa
`!important`, y una declaración con `!important` le gana a CUALQUIER
declaración sin `!important` sin importar cuánto más específico sea su
selector — la especificidad solo desempata entre reglas de la MISMA
importancia. **Regla general**: cualquier excepción puntual a `.ant-card`
(o a cualquier bridge con `!important` en `styles.scss`) necesita su propio
`!important` para poder ganar — confirmar visualmente después de escribirla,
nunca asumir que "más específico" alcanza cuando el otro lado ya usa
`!important`. Por eso `.table-card` sigue usando `border-radius: 12px
!important` hoy, aunque ya no anule border/box-shadow (ver "Patrón: card de
tabla").

### Patrón: card centrada (formulario de una sola columna)

`.card-centered` (`user-detail.scss`) — `max-width: 560px; margin: 0 auto;`
sobre el `<nz-card>`, para cuando una pantalla es UN SOLO formulario sin
nada al lado. Hoy su único consumidor es la creación de usuario
(`/usuarios/nuevo`, `isCreate()`) — "Organización" tenía este mismo look
como tab propia, pero se fusionó dentro de "Información general" y ya no lo
usa (ver "Patrón: tab con card general…"). No debe estirarse de borde a
borde como sí hace `.tab-card` (detalle de un usuario existente, ver abajo)
o una tabla. Dentro de `.card-centered`, el botón de guardar
(`.user-form__submit`) se centra
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
- Tablas: SIEMPRE dentro de `.table-card` (12px de radius, con o sin
  `.toolbar` de filtros dentro — ver "Patrón: card de tabla"). Ya no aplica
  la regla vieja de "bordes rectos, sin sombra" — eso se abandonó a favor del
  look de card completo. Columnas de texto libre (descripción, categoría,
  referencia, orden) llevan la clase genérica `.col-truncate`
  (`shared/styles/_data-table.scss`) con el ancho vía variable CSS inline —
  `<th class="col-truncate" style="--col-max-width: 220px">` — más
  `[attr.title]` en el `<td>` con el texto completo. Nunca una clase
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

## Retirado: KPIs + toggle de periodo (día/mes) en sales-dashboard

`sales-dashboard` tuvo, en una iteración anterior, 3 `kpi-card` (Total
vendido con sparkline, Ticket promedio, Transacciones) y un `nz-radio-group`
día/mes arriba de la tabla — se retiraron por completo (no solo se
ocultaron): `SalesDashboardService` ya no tiene `period`/`summary`/
`dailyTrend`/`scopedSales`/`monthSales`, y el `.scss` ya no `@use`a
`kpi-card`. La tabla dejó de estar fija a "hoy" (`todaySales`) — ahora es
`filteredSales`, el catálogo completo de ventas acotado por los 3 filtros de
abajo. Si un futuro pedido resucita un resumen numérico arriba de esta
tabla, revisar primero si encaja mejor como el patrón "resumen global" (una
sola card, `_summary-strip.scss`) que como KPI cards independientes — ver
MASTER.md más abajo.

## Patrón: filtros de tabla (fecha, texto libre, select) — mismo criterio en toda la app

Los 3 filtros de `sales-dashboard` (fecha, cliente, medio de pago) no
inventan nada nuevo — replican exactamente lo que ya usaban
`reconciliation-dashboard` (fecha + medio de pago) y `user-management`
(texto libre + selects), dentro del mismo `.table-card` (ver "Patrón: card
de tabla" abajo):

- **Texto libre** (`cliente`, aquí; `nombre o correo` en `user-list`):
  `<input nz-input class="toolbar__filter toolbar__filter--search">` +
  `signal('')` en el service + `.trim().toLowerCase().includes(term)` sobre
  el campo relevante. `.toolbar__filter--search` vive en
  `shared/styles/_toolbar.scss` (promovida desde `user-list.scss` al
  aparecer `sales-dashboard` como segundo consumidor — mismo criterio de
  siempre).
- **Select de un enum fijo** (`medio de pago`): `signal<X | 'all'>('all')` +
  array `{ value, label }[]` en el componente + `nz-select`/`nz-option`. El
  array de opciones de medio de pago (`tenderMediaOptions`) se repite
  IDÉNTICO en `reconciliation-dashboard.ts` y `sales-dashboard.ts` — no vale
  la pena una constante compartida por 4 líneas de literal hasta que aparezca
  un tercer consumidor con la MISMA lista exacta.
- **Rango de fecha**: `nz-range-picker` + `signal<[Date, Date] | null>(null)`
  + `startOfDay`/`endOfDay` locales al service (ver
  `reconciliation.service.ts`) para comparar contra el rango inclusive del
  día completo, no solo la medianoche.
- Los 3 combinados en un solo `computed` (`filteredSales`) que los aplica en
  cascada con `return false` temprano — no 3 computeds encadenados.

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
- **Secciones fijas, en este orden**: Resumen de la venta (estructura
  `.info-fields`/`.info-field`, ver abajo — incluye una sub-sección
  "Cliente" con datos de contacto + fiscales básicos) → Productos (tabla de
  `items`, con fila `TOTAL` = suma de subtotales únicamente, sin
  impuestos/propina) → Métodos de pago (tabla de `payments[]` — TODA venta
  del mock trae ≥2 métodos, ver invariantes de `sales-mock.data.ts` más
  abajo; fila `TOTAL PAGADO` solo se muestra si hay más de un pago) →
  Descuentos y propinas + Impuestos **en la misma fila** (`.sale-drawer__row`,
  ver abajo) → Desglose financiero (el recap final: subtotal, descuento, IVA,
  propina, total). Los montos de impuesto y total son SIEMPRE derivados
  (`saleTaxAmount`/`saleTotal` en `sale.util.ts`), nunca un campo guardado
  aparte que se pueda desincronizar. Excepción deliberada: cuando una venta
  trae `payments` explícito (pago mixto con reparto propio, ver `V-2007`),
  esos montos NO se derivan de `saleTotal()` — el reparto entre métodos es un
  dato propio de esa venta que debe sumar el total, no algo calculable a
  partir de él (ver `withPayment()` en `sales-mock.data.ts`: respeta
  `payments` si ya viene, si no separa el total en un método principal +
  uno secundario — ver invariantes abajo).
- **Productos y Métodos de pago envueltos en `.table-bleed`**
  (`shared/styles/_data-table.scss`): mismo mecanismo que usa `.table-card`
  para que el borde superior de su tabla toque los bordes izquierdo/derecho
  de la card (ver "Patrón: card de tabla" más abajo) — aquí, en vez de
  cancelar el padding de una `nz-card`, cancela el padding de 24px que trae
  `.ant-drawer-body` de fábrica (mismo valor exacto, así que el mismo
  partial sirve sin necesitar una variante propia). Ambas tablas siguen
  siendo `<table>` HTML plana con su propio `.sale-drawer__items` (no
  `nz-table`) — mismo criterio que `.audit-table` en `user-detail`: una
  tabla plana con la MISMA convención visual (header sin fondo, mayúsculas,
  `.col-truncate` en la columna de texto libre — "Producto" y "Referencia"
  de pagos) en vez de montar `nz-table` para un caso que no necesita sus
  demás features (paginación, sort, etc.).

### Patrón "icono + etiqueta arriba, valor abajo" (`.info-fields`)

`shared/styles/_info-fields.scss` (`.info-fields`/`.info-field`/
`.info-field__*`) — nació en `user-detail.scss` ("Información
personal"/"Organización"/"Seguridad y acceso") y se promovió aquí al
aparecer un segundo consumidor: "Resumen de la venta" en el Drawer de
`sales-dashboard` la reutiliza tal cual (de solo lectura ahí, así que no usa
`.info-field__input`/`.info-field__error`). Antes de esta iteración
`sales-dashboard` usaba `.summary-columns`/`.summary-field`
(`_summary-columns.scss`, icono+etiqueta+valor en una sola fila horizontal)
para este mismo bloque — se cambió a `.info-fields` a pedido explícito, para
que "Resumen de la venta" se presente con la MISMA estructura que
Administración de usuarios. `_summary-columns.scss` sigue viva (no quedó
huérfana): la usa el formulario de creación de usuario (`user-detail` en
modo `isCreate()`), de una sola columna angosta con campos editables — ver
"Patrón 'icono + etiqueta + valor' (2 columnas opcional)" más abajo para esa
estructura horizontal, que es DISTINTA y sigue vigente para ese caso.

- Grid de 3 columnas fijas por defecto (`.info-fields`, colapsa a 2 en
  `max-width: 900px` y a 1 en `max-width: 560px`); `.info-fields--cols-4`
  es la variante de 4 columnas que usa `user-detail` junto al avatar — sin
  consumidor todavía en `sales-dashboard`.
- Cada campo: `.info-field__head` (icono + `.info-field__label`, SIN "`:`"
  al final — a diferencia de `.summary-field__label`) encima de
  `.info-field__value` (o el control en modo edición, ver `user-detail`). Un
  valor que es un `*StatusTag`/`nz-tag` suelto va envuelto en
  `.info-field__value-row` (si no, hereda `align-items: stretch` del
  `.info-field` flex-column y se estira al ancho completo de su celda del
  grid — mismo gotcha ya documentado en `user-detail`, "Patrón: tab con card
  general…").
- **Sub-secciones dentro de un mismo `.info-fields`**: un `<h4
  class="info-fields__subsection-title">` seguido de OTRO `.info-fields`
  independiente (no un `grid-column: 1 / -1` dentro del mismo grid) — mismo
  patrón que "Dirección" en `user-detail`. "Resumen de la venta" lo usa DOS
  veces: separa los campos de la venta (Folio/Fecha/Medio de pago/
  Referencia/Estado de venta/Estado de conciliación) de los del "Cliente"
  (identidad + fiscales) y de los de "Documento electrónico" (la factura),
  ver ambos abajo.
- **Identificación fiscal del cliente (normativa colombiana, DIAN)**:
  `SaleCustomer.personType`/`.taxRegime` (`shared/models/sale.model.ts`),
  ambos opcionales — un cliente de mostrador sin registro no trae ninguno de
  los dos y el campo cae al fallback `.text-muted` ("Sin tipo de persona/
  régimen registrado"), mismo criterio que "Sin asignar" en `user-detail`.
  `PersonType` (`natural`/`juridica`) y `TaxRegime`
  (`responsable_iva`/`no_responsable` — terminología vigente de la DIAN tras
  la Ley 2010 de 2019, reemplazó "Régimen común"/"simplificado") son enums
  cerrados con su propio `Record<..., string>` de labels
  (`PERSON_TYPE_LABEL`/`TAX_REGIME_LABEL`), mismo patrón que `TENDER_MEDIA_LABEL`/
  `STORE_LABEL`. Reemplazó un primer intento con `rfc`/`businessName` (campos
  mexicanos, CFDI) que no aplicaban al negocio real.
- **"Documento electrónico" — la factura electrónica de la venta (DIAN)**:
  sub-sección propia, DISTINTA de "Cliente" — no es un dato del cliente sino
  del documento fiscal de la venta, obligatorio sin importar quién compre
  (a diferencia de `personType`/`taxRegime`, que sí son opcionales). Modelo
  `ElectronicInvoice` (`shared/models/sale.model.ts`, campo `Sale.invoice`,
  NO opcional): `prefix` + `number` (consecutivo autorizado por la
  resolución de facturación — distinto de `Sale.folio`, el folio interno del
  POS sin validez ante la DIAN), `cufe` (Código Único de Facturación
  Electrónica, el mismo que trae codificado el QR de una factura real) e
  `issuedAt` (fecha/hora de expedición). Campos e icono:
  - Prefijo: icono de tag/etiqueta (mismo path que "Código Postal" en
    `user-detail`).
  - Folio de factura: icono de recibo/ticket, DISTINTO del icono de
    documento que ya usa "Folio" (el interno) arriba — mismo bloque
    "Resumen de la venta", dos folios con significado distinto, no deben
    compartir icono.
  - CUFE: icono tipo "marco de escaneo" (evoca un código óptico/QR) — el
    valor es un hex de 96 caracteres, se trunca con el mismo mecanismo de
    `.info-field__value` (`overflow`/`ellipsis`) + `[attr.title]` con el
    valor completo, sin necesitar `.col-truncate` (esa clase es para celdas
    de tabla).
  - Fecha de facturación: mismo icono de calendario que "Fecha" arriba
    (cualquier campo de fecha reusa ese icono, ver "Patrón 'icono +
    etiqueta + valor'" — mismo criterio ya establecido con las fechas de
    `user-detail`). **Timezone fijo `-0500`** en el pipe
    (`date: 'dd/MM/yyyy HH:mm' : '-0500'`) — Colombia no observa horario de
    verano; sin el tercer argumento, Angular renderiza en la zona horaria
    del NAVEGADOR y la hora mostrada aquí puede desalinearse de la hora
    plana de `sale.time` que muestra "Fecha" arriba (mismo dato, sin
    conversión) según dónde se abra la demo — bug real encontrado al
    verificar en un entorno con otro huso horario.
  - Consulta DIAN: icono de link externo, `.info-field__value-row` con un
    `<a target="_blank" rel="noopener">` armado por `dianQueryUrl()`
    (`sale.util.ts`) — el mismo enlace que trae codificado el QR de una
    factura electrónica real
    (`https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=<CUFE>`).

### `.sale-drawer__row`: 2 secciones en la misma fila

`sales-dashboard.scss` — "Descuentos y propinas" e "Impuestos" se muestran
como si fueran 2 columnas de un mismo bloque, a pedido explícito. Grid de
2 columnas (`1fr 1fr`, gap 24px, colapsa a 1 en `max-width: 560px`) que
envuelve 2 `.sale-drawer__section` completos (cada uno con su propio
heading) — a diferencia de `.summary-columns`, NO lleva separador vertical:
son 2 secciones independientes compartiendo fila, no una sola lista de
campos partida en 2.

### Patrón "icono + etiqueta + valor" (2 columnas opcional)

`shared/styles/_summary-columns.scss` (`.summary-columns`/`.summary-col`/
`.summary-field*`) — nació en `sales-dashboard.scss` ("Resumen de la venta"
en el drawer, ver arriba: ya NO es su consumidor, migró a `.info-fields`) y
sigue viva porque `user-detail` la reutiliza para su `<form>` de creación de
usuario (`isCreate()`, una sola columna angosta) con campos EDITABLES
(nz-input/nz-select dentro de `.summary-field__control`, con
`.summary-field__error` para el mensaje de validación). `.summary-fields` es
la variante SIN el divisor de 2 columnas, para una sola card con pocos
campos que no necesita partirse.

Para cuando un grupo de datos relacionados sí debe verse como dos bloques de
igual jerarquía en vez de una sola lista larga (`.summary-columns`):

- Grid de 2 columnas fijas (el layout no asume ningún número concreto de
  campos por columna — el reparto es decisión de quien lo usa). Colapsa a 1
  columna en `max-width: 640px` (divisor pasa de `border-right` a
  `border-bottom`).
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

### Invariantes del mock de ventas (`sales-mock.data.ts`)

Pedidas explícitamente para que la demo del Drawer siempre se vea "rica",
aplican a TODA venta del mock — las 7 de `TODAY_SALES` a mano y cualquiera
generada por `buildDay()`:

1. **Total > $1,000 MXN**: `buildDay()` no confía en que la mezcla de
   productos del catálogo dé un subtotal alto por casualidad — calcula un
   `qtyMultiplier` a partir de la suma a cantidad 1 de los productos
   elegidos (`MIN_SEED_SUBTOTAL = 1150`, con margen para el descuento máximo
   del 10% y el 16% de IVA) y lo aplica a la cantidad de cada línea, así que
   el subtotal queda garantizado por arriba del piso sin importar qué tan
   baratos hayan tocado esos productos en ese índice. 3 productos de ticket
   alto (`Plato del día`, `Copa de vino`, `Postre de la casa`) se agregaron
   al catálogo para que las ventas a mano no necesitaran cantidades poco
   realistas.
2. **≥5 productos**: `itemCount = 5 + (idx % 2)` en `buildDay()` (5 o 6);
   las 7 de `TODAY_SALES` se expandieron a mano a 5-6 líneas cada una.
3. **≥2 métodos de pago**: `withPayment()` ya NO deriva un solo pago del
   total — separa el total en un método PRINCIPAL (`sale.tenderMedia`) y uno
   SECUNDARIO (`SECONDARY_TENDER`, efectivo para los 3 medios electrónicos y
   BBVA para efectivo), 80/20, salvo que la venta traiga `payments` explícito
   (reparto propio, ver `V-2007`). Antes de esta iteración, un pago mixto
   real (2+ métodos) era un caso especial que solo tenía `V-2007` — ahora es
   la norma para cualquier venta del mock.
4. **TODA venta trae una `ElectronicInvoice`**: `withInvoice()` la arma para
   las 7 de `TODAY_SALES` y para cualquiera de `buildDay()` por igual — a
   diferencia de `payments`, nunca se declara a mano en el mock (no hay
   ningún caso especial tipo `V-2007` aquí). Un solo prefijo global
   (`INVOICE_PREFIX = 'SETP'`) porque una sola resolución DIAN cubre las 4
   sucursales; el consecutivo (`INVOICE_NUMBER_SEED + índice en
   `RAW_SALES``) es único por venta. El CUFE se genera con `buildCufe()`
   (FNV-1a + LCG sobre `sale.id`) para obtener un hex determinístico de 96
   caracteres — MISMA longitud que un CUFE real (SHA-384) pero sin ser un
   hash real, no hay backend que lo calcule; mismo criterio de "índice, no
   `Math.random()`" que el resto del generador, para que el CUFE de una
   venta no cambie entre builds.

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
campos en su primera tab, junto con una sub-card de "Organización"
(departamento, área, puesto, administrador responsable — `managerId`
referencia a otro `AppUser` con rol admin/supervisor, ver
`MANAGER_ROLE_IDS`; "Organización" fue su propia tab en una iteración
anterior, ver "Patrón: tab con card general…") y una de "Cuenta". La segunda
tab, "Seguridad y acceso", cubre roles asignados (**array `roleIds:
RoleId[]`, no un rol único**), permisos efectivos, estado de la cuenta,
email verificado, último inicio de sesión/última actividad, intentos
fallidos, 2FA, sesiones activas. "Historial" (auditoría) se conservó como
tercera tab aunque no forma parte de las 3 secciones pedidas originalmente —
información valiosa ya construida, ninguna razón para retirarla. Un
rol/permiso NUNCA se re-deriva
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
    Información general (incluye Organización, ver "Patrón: tab con card
    general…" abajo) / Seguridad y acceso / Historial cuando un solo
    formulario sería demasiado largo. Modo creación NO muestra tabs (un
    usuario que no existe aún no tiene roles que ajustar en detalle ni
    historial) — un solo formulario mínimo, y tras crear se navega al
    detalle completo con las 3 tabs.

## Patrón: tab con card general + secciones + modo edición (`user-detail`)

Cuarta iteración de la pantalla de detalle — evolucionó de "3 tabs, cada una
con 1-2 `nz-card` lado a lado en un grid" a esta estructura, más consistente
entre tabs y más legible de un vistazo (solo lectura por defecto, en vez de
formularios completos siempre abiertos), y de "editar reemplaza toda la
sección por un formulario" a "editar cambia solo el VALOR de cada campo,
in-place, sin mover nada alrededor".

1. **`Organización` dejó de ser su propia tab**: sus campos ahora son una
   sección más DENTRO de "Información general" — seguían siendo,
   conceptualmente, información del mismo usuario; no había razón fuerte
   para una tab aparte una vez que "Información general" pasó a aceptar
   varias secciones apiladas. `orgForm` (el `FormGroup` en `user-detail.ts`)
   no cambió de forma — solo su ubicación en el `.html`.
2. **`.tab-card` (`user-detail.scss`) — la card general de cada tab**: toma
   todo el ancho de la pantalla, `[nzBodyStyle]="{ padding: '24px' }"`,
   `border-radius: 12px !important` (mismo radius que `.table-card`, ver
   "Patrón: card de tabla" — incluso sin tabla, es el mismo criterio de
   "contenedor general" de una sección). Las 3 tabs (Información general,
   Seguridad y acceso, Historial) la usan por igual.
3. **Las secciones DENTRO de `.tab-card` son `<div class="tab-card__section">`,
   NO `<nz-card>`**: antes cada una era su propia card anidada (8px radius,
   borde + sombra propios) DENTRO de la card general de 12px — dos cards
   una dentro de otra. Ahora son `<div>`s simples apiladas
   (`.tab-card__sections`, reemplaza a `.tab-columns` retirada — el grid de
   2 columnas lado a lado de la segunda iteración), separadas por un
   hairline (`border-bottom: 1px solid var(--color-border)` en
   `.tab-card__section:not(:last-child)`) en vez del borde de una card —
   una sola superficie de card por tab, no cards anidadas. Cada sección
   conserva su `.tab-card__section-title` (encabezado pequeño, mayúsculas,
   mismo estilo que `.sale-drawer__heading` en `sales-dashboard.scss` pero
   feature-local aquí — un segundo consumidor lo promovería a `shared/`).
4. **`.info-field` — estructura "icono + etiqueta" arriba, "valor" (negritas)
   O el control del formulario abajo**: la forma de mostrar/editar
   CUALQUIER dato en esta pantalla (datos personales, organización, cuenta,
   seguridad de la cuenta) — a propósito DISTINTA de `.summary-field`
   (`_summary-columns.scss`, icono+etiqueta+valor en una sola fila
   horizontal), que en su momento seguía siendo el patrón del drawer de
   venta de `sales-dashboard`. Esa distinción ya no aplica: `sales-dashboard`
   migró su "Resumen de la venta" a esta MISMA estructura vertical a pedido
   explícito (ver "Patrón: Drawer de detalle…" más arriba), así que
   `.info-field`/`.info-fields` se promovieron a
   `shared/styles/_info-fields.scss` al aparecer ese segundo consumidor (ver
   "Estructura de carpetas") — ya no viven local a `user-detail.scss`.
   `.info-fields` las acomoda en grid — **3 columnas fijas por defecto**
   (`repeat(3, 1fr)`, ancho completo del `.tab-card__section` contenedor),
   **4 con `.info-fields--cols-4`** (solo "Información personal", para hacer lugar
   al avatar — ver punto 6). `.info-field__value--link` para valores que
   navegan (Administrador responsable → perfil del manager);
   `.info-field__value-row` para cuando el valor lleva una acción a un lado
   (Email verificado → "Marcar como verificado", Sesiones activas →
   "Cerrar sesiones") **o es un `nz-tag` solo** (ver punto 8 — sin este
   wrapper, el tag se estira al ancho de la columna).
5. **Modo edición: el MISMO `.info-field` cambia de valor, no de
   estructura**: "Editar" vive en el header de la pantalla (junto a
   "Eliminar usuario", ver `.user-detail__title-actions`) y activa
   `isEditing` (signal en `user-detail.ts`) para AMBAS secciones de
   "Información general" (datos personales + organización) a la vez. A
   diferencia de la iteración anterior (que reemplazaba TODA la sección por
   un `<form>` con otra estructura), ahora cada `.info-field` individual
   tiene un solo `@if (isEditing()) { <input>/<nz-select>/<nz-date-picker> }
   @else { <span class="info-field__value">... }` — el `<div
   class="info-field">`, su icono y su etiqueta NUNCA cambian, solo el nodo
   de abajo. El `<form>` (`infoForm`/`orgForm`, sin cambios de fondo) envuelve
   TODO el `.info-fields` de su sección + el botón "Guardar cambios" (visible
   solo si `isEditing()`) — sigue siendo un formulario real para
   validación/submit, solo que ya no impone su propio layout visual. Cada
   sección conserva su propio botón "Guardar cambios" (2 forms
   independientes, 2 llamadas de servicio distintas) — `onSaveInfo()`/
   `onSaveOrganization()` ponen `isEditing.set(false)` al terminar, así que
   guardar cualquiera de las 2 cierra el modo edición completo (no hay un
   tercer estado "una sección guardada, la otra no"). El botón del header
   cambia a "Cancelar edición" mientras `isEditing()` es true —
   `onCancelEditClick()` restaura ambos forms a los valores actuales del
   usuario (descarta cambios sin guardar) antes de salir del modo.
   `isEditing` se resetea a `false` en el mismo `effect()` que reinicia los
   forms al cambiar de usuario — nunca debe sobrevivir a la navegación.
   **No aplica** a "Roles y permisos" (Seguridad y acceso): ese formulario
   sigue siempre visible con su propio botón "Guardar permisos" — es una
   lista de checkboxes/multi-select, no datos con una representación de
   "solo lectura" natural, y no se pidió el mismo tratamiento ahí.
6. **Avatar FUERA del grid, a la izquierda de "Información personal"**:
   segunda iteración — el avatar empezó como la 1ª columna del grid
   (`grid-column: 1; grid-row: span 2`, 1 columna × 2 filas), pero eso
   ataba su alto al alto de 2 filas de campos (variable, y grande). Ahora
   `.info-personal` (flex row) pone el avatar (`<nz-avatar nzShape="square"
   class="user-detail__avatar">`, tamaño FIJO propio — 72×88px, ya no
   `width/height: 100%` de una celda) y el grid de 7 campos
   (`.info-fields--cols-4`, `flex: 1`) lado a lado — el avatar ya no
   participa del grid en absoluto, así que su tamaño es independiente del
   alto de fila de los campos. Mismo `[nzSrc]`/`[nzText]`/`[ngStyle]` que
   `user-list` (ver `AppUser.avatarUrl` — foto real con fallback a
   iniciales+color); `border-radius: 8px` en vez del círculo que usa
   `user-list` — "rectangular", no un avatar de fila de tabla.
   **"Dirección" ya NO comparte grid con estos 7 campos**: es un `<h4>`
   normal (`.info-fields__subsection-title`, sin `grid-column`) seguido de
   su PROPIO `.info-fields` (3 columnas, el default — no
   `--cols-4`) — dos grids independientes, hermanos dentro del mismo
   `<form>`, en vez de uno solo con un hueco de avatar que acomodar.
   `.info-fields--cols-4` (4 columnas, gap más chico que el default — filas
   más bajas ahora que ya no comparte alto con el avatar) es EXCLUSIVA de
   los 7 campos personales; Dirección/Organización/Cuenta/Seguridad de la
   cuenta siguen en 3 columnas.
7. **Campos nuevos de "Información personal" (fecha de nacimiento, SSN,
   género, dirección) y "Organización" (ID empleado, fecha de contratación,
   fecha fin de contrato)**: agregados a `AppUser` — ver `AppUserAddress`
   (sub-objeto propio, no 5 campos sueltos: la dirección siempre se
   edita/muestra como una unidad) y `GENDER_OPTIONS` (lista cerrada, mismo
   criterio que `STATUS_OPTIONS`) en el model. `contractEndDate` es
   `string | null` (contrato indefinido = `null`, muestra "Indefinido" en
   vez de "Sin asignar" — semántica distinta a un campo vacío). Las 25
   entradas de `MOCK_USERS` NO se editaron a mano una por una para estos
   campos nuevos — `extraProfileFields()` en `user-management-mock.data.ts`
   los deriva del ÍNDICE del usuario (determinístico, no `Math.random`,
   mismo criterio que `avatarTokensFor` para el color de avatar por hash de
   id) sobre una semilla (`MOCK_USERS_SEED`, tipada `Omit<AppUser, ...>`)
   que sí conserva los 25 usuarios originales completos a mano.
   `nz-date-picker` trabaja con `Date | null`, no ISO string — `parseIsoDate`/
   `toIsoDate`/`toIsoDateOrNull` (funciones locales en `user-detail.ts`) son
   las únicas que cruzan esa frontera, en los 2 sentidos (reset de forms al
   entrar/cancelar, y al armar el payload de `updateInfo`/`updateOrganization`
   antes de guardar).
8. **Tags "sueltos" (`nz-tag` sin acción al lado) también van en
   `.info-field__value-row`**: "Estado de la cuenta" y "Autenticación de dos
   factores (2FA)" en "Seguridad de la cuenta" se estiraban al ancho
   completo de su columna del grid — un `nz-tag` es hijo directo de
   `.info-field` (flex-column), y por default hereda `align-items: stretch`
   del padre. "Email verificado" nunca tuvo este problema porque su tag YA
   vivía envuelto en `.info-field__value-row` (necesario ahí por el botón
   "Marcar como verificado" al lado) — un `.info-field__value-row` (flex,
   eje horizontal) mide a sus hijos por contenido, no por estiramiento.
   Aplicar el MISMO wrapper a los tags sueltos, aunque no tengan nada al
   lado, es la solución — no un CSS especial para "tags sin acción".
9. **Permisos en grid de 4 columnas**: `.permission-groups` pasó de
   `flex-direction: column` (grupos apilados, cada uno con sus checkboxes
   debajo) a `display: grid; grid-template-columns: repeat(4, 1fr)` — cada
   grupo (Consulta/Operación/Administración/...) en su propia columna. Fijo
   en 4 aunque hoy solo existan 3 grupos (`PERMISSIONS` en el model) — las
   columnas sobrantes quedan vacías a propósito, para no tener que tocar
   este grid el día que se agregue un 4° grupo de permisos.
10. **Icono + etiqueta, misma estructura en TODO el módulo**:
    `features/user-management/_buttons.scss` (nuevo, feature-local — 3
    consumidores del MISMO feature, no amerita `shared/styles/` todavía) —
    `.user-list ::ng-deep .ant-btn, .user-detail ::ng-deep .ant-btn,
    .user-audit ::ng-deep .ant-btn { display: inline-flex !important;
    align-items: center; gap: 6px; }`. Envuelto con el contenedor raíz de
    cada pantalla (no `.ant-btn` a secas) — SCOPED a este módulo, nunca se
    pidió (ni se necesitó) en el resto de la app; un `::ng-deep` sin nada
    antes se filtraría global. Con esto, cualquier botón nuevo con icono en
    estas 3 pantallas hereda la alineación automáticamente. Se completaron
    además los botones que tenían label pero NO icono (Eliminar usuario,
    Guardar cambios ×2, Guardar permisos, Restablecer contraseña, Crear
    usuario) reutilizando SVGs ya existentes en el módulo cuando aplicaba
    (el candado de "Restablecer contraseña" es el mismo de la fila de
    acciones en `user-list`; el "+" de "Crear usuario" es el mismo de
    "Nuevo usuario") — un ícono nuevo (disco de guardar) para
    "Guardar cambios"/"Guardar permisos", los 2 únicos casos sin un ícono
    ya establecido en la app para reusar. Los links pequeños dentro de un
    `.info-field__value-row` (Marcar como verificado, Cerrar sesiones, Ver
    perfil de X) quedaron sin icono a propósito — son acciones inline
    secundarias, no botones de la misma jerarquía visual que header/forms.
10. **`.ant-tabs-nav` como "pill" propio**: bridge en `styles.scss` (`border`,
    `padding: 0 16px`, `border-radius: 12px`, `background: var(--color-card)`,
    todos `!important` — mismo gotcha de siempre) en vez del texto suelto de
    Ant. Con esto, la línea inferior de ancho completo que Ant dibuja por
    defecto (`.ant-tabs-nav::before`) sobresale por debajo del borde
    redondeado — se oculta entera (`display: none !important`) en vez de
    solo recolorearla. Único consumidor de `nz-tabs` hoy — si aparece un
    segundo, hereda esto automáticamente por vivir en el puente global, no
    en `user-detail.scss`.

## Patrón: card de tabla (estándar de toda la app)

`.table-card` (`shared/styles/_data-table.scss`) es la card que envuelve
**cualquier tabla nueva** de la app, tenga o no filtros — úsala siempre que
construyas una pantalla con `nz-table` (o incluso una tabla HTML plana, ver
`user-detail` "Historial"). Nació como una desviación puntual de `user-list`
(su "segunda iteración": toolbar de filtros y tabla pasaron de vivir en dos
elementos sueltos — card de tabla + `<section class="toolbar">` encima — a
compartir la MISMA `<nz-card>`) y se promovió a estándar global:
`reconciliation-dashboard`, `user-audit` (historial de auditoría) y
`sales-dashboard` (al agregarle sus 3 filtros — fecha, cliente, medio de
pago — ya se migró al mismo patrón; antes de eso vivía sin filtros); el
"Historial" de `user-detail` no tiene toolbar que mover, así que solo
heredó el look (radius, header sin fondo, sin línea vertical) por usar
`.table-card`.

**Con filtros** (toolbar y tabla son conceptualmente una sola unidad — la
vista es de administración/consulta de una lista): toolbar DENTRO de la
card, `[nzBodyStyle]="{ padding: '24px' }"`, tabla envuelta en
`.table-bleed`. **Sin filtros** (tabla sola, o filtros que alimentan también
KPIs/otro contenido fuera de la tabla — ahí el toolbar se queda afuera):
`[nzBodyStyle]="{ padding: '0' }"`, sin `.table-bleed` (innecesario: la
tabla ya toca los 4 bordes). En ambos casos, `.table-card` solo se aplica
como clase en el `.html` — nada que declarar en el `.scss` del feature.

```html
<!-- Con filtros (user-list, reconciliation-dashboard, user-audit, sales-dashboard) -->
<nz-card class="table-card" [nzBodyStyle]="{ padding: '24px' }">
  <section class="toolbar">...</section>
  <div class="table-bleed">
    <nz-table>...</nz-table>
  </div>
</nz-card>

<!-- Sin filtros (Historial de user-detail) -->
<nz-card class="table-card" [nzBodyStyle]="{ padding: '0' }">
  <nz-table>...</nz-table>
</nz-card>
```

1. **Radius propio de `.table-card`, no el "card base" general**: fuerza
   `border-radius: 12px !important` (el resto de la app usa 8px, ver "Patrón:
   card base") — a diferencia de su versión anterior, ya NO anula
   border/box-shadow: los hereda del bridge de `.ant-card`, así que toda
   tabla de la app ahora se ve como una card completa (borde + sombra), no
   plana. `!important` obligatorio — mismo gotcha de siempre (el bridge de
   `.ant-card` en `styles.scss` también usa `!important` con igual
   especificidad).
2. **Header sin fondo y sin línea vertical, en TODA `nz-table` dentro de
   `.table-card`**: `::ng-deep .ant-table-thead > tr > th { background:
   transparent !important; &::before { display: none !important; } }` vive
   en `.table-card` mismo (no en `.table-bleed`) — así aplica igual con o sin
   toolbar. Los dos `!important` son obligatorios: el fondo compite con el
   bridge global de `styles.scss` (misma especificidad, misma importancia),
   la línea vertical compite con un selector de Ant más específico pero SIN
   `!important` propio (sin el nuestro, ninguno de los dos gana).
3. **`.table-bleed`, solo cuando hay `.toolbar` dentro**: la card tiene 24px
   de padding parejo (filtros Y tabla), pero la tabla necesita que su borde
   superior toque los bordes izquierdo/derecho de la card como divisor —
   `margin: 0 -24px; width: calc(100% + 48px); padding: 0 24px; border-top:
   1px solid var(--color-border);` cancela el padding de la card a nivel de
   caja (por eso el `border-top` sí llega a los bordes) y se lo devuelve al
   CONTENIDO de la tabla con su propio `padding`, para que las celdas no
   queden pegadas al borde.
4. **Selección de filas**: checkbox en la primera columna, tanto por fila
   (`UserManagementService.toggleSelect`) como en el header
   (`toggleSelectAllFiltered` — selecciona/deselecciona los usuarios
   FILTRADOS actualmente visibles, no todos los del sistema). Vive en el
   service (`selectedIds`, `isAllFilteredSelected`,
   `isSomeFilteredSelected` para el estado indeterminado del checkbox de
   header) por el mismo motivo que `search`/`roleFilter`/`statusFilter`: es
   estado de ESA pantalla. `deleteUser` purga el id eliminado de la
   selección — evita seleccionar un id que ya no existe.
5. **`StatusChip` (`features/user-management/status-chip/`)**: componente
   compartido entre `user-list` (columna Estado) y `user-detail`
   ("Información general") — el chip cambia de fondo/texto/borde según el
   estado (`STATUS_META` en el model: activo=verde, inactivo=rojo,
   bloqueado=naranja, usando `--color-tag-success/-error/-warning-*` — ver
   "Colores de tag" arriba, mismo look que una `nz-tag`, no relleno sólido) y
   abre un menú con los 3 estados al hacer click. `STATUS_META` también trae
   `tagPreset` (`'success'|'error'|'warning'`) para el `nz-tag` plano de
   "Estado de la cuenta" en "Seguridad y acceso" — así ese `nz-tag` usa
   `[nzColor]="statusMeta[u.status].tagPreset"` igual de simple que los de
   "Email verificado"/"2FA", sin repetir bg/fg a mano ahí. **No aplica el
   cambio por sí solo** — emite `statusChange` y el consumidor decide (hoy:
   ambos muestran `NzModalService.confirm()` antes de llamar a
   `UserManagementService.setStatus`). Vive en el feature, no en
   `shared/components/`, porque sus dos consumidores son de ESTE feature
   (ver "Estructura de carpetas" — la regla de promoción a `shared/` es para
   cuando un SEGUNDO FEATURE lo necesita, no un segundo componente del
   mismo feature).
6. **`UserStatus` pasó de 2 a 3 valores** (`'active' | 'inactive' |
   'blocked'`) — cualquier switch/tag binario que asumiera solo
   activo/inactivo tuvo que revisarse (el switch de "Información general"
   se reemplazó por `StatusChip`; el `nz-tag` de "Estado de la cuenta" en
   "Seguridad y acceso" pasó de un ternario a leer `STATUS_META` directo).
   `AuditAction` ganó su propio valor `'blocked'` — un estado nuevo con
   semántica propia amerita su propia acción de auditoría, no reusar
   `'deactivated'` para dos cosas distintas.
7. **Rol: selector "sin bordes" directo en la fila** — mismo `nz-select
   [nzMode]="multiple"` que `user-detail`, pero con
   `background/border-color: transparent` (clase local `.role-select`) para
   que se lea como parte de la fila, no como un input más. El chevron de
   apertura ya lo trae `nz-select` de fábrica — no hace falta un icono
   propio (a diferencia de `StatusChip`, que si necesita el suyo porque no
   es un `nz-select`). Cambiar el rol aquí llama a
   `UserManagementService.changeRoles` igual que en el detalle — MISMO
   efecto secundario (resetea permisos a la unión de defaults), sin
   confirmación (acción rápida, igual que el resto de ediciones inline de
   la lista).
8. **Columna Acciones: iconos + tooltip, no dropdown**: la iteración
   anterior agrupaba "Ver detalle"/"Restablecer contraseña"/"Eliminar" en un
   `nz-dropdown-menu` (menú "⋮"). Se reemplazó por 3 botones-icono en línea
   (`nz-button nzType="text"`, cada uno con `nz-tooltip`/`nzTooltipTitle`)
   — más click directo (sin abrir un menú primero) a costa de más ancho de
   columna; preferible cuando son pocas acciones (2-3) y todas caben sin
   apretar la fila. Con más de ~4 acciones, volver al dropdown. Header de
   esta columna centrado (`.text-center`, nueva utilidad en
   `_data-table.scss` junto a `.text-right`).
9. **Radius global de selects/inputs (6px)**: bridge en `styles.scss`
   (`.ant-select-selector`, `.ant-input`, `.ant-input-affix-wrapper`,
   `.ant-picker`) — distinto del radius de cards (8-12px) y botones (8px).
   Un input/select/date-picker nuevo lo hereda automáticamente.
10. **Avatar con foto real (`AppUser.avatarUrl`)**: `nz-avatar` recibe
   `[nzSrc]` (URL o `null`→`undefined`) Y `[nzText]`/`[ngStyle]` (iniciales +
   color, ver `avatar-color.util.ts`) al mismo tiempo — no hay que elegir uno
   u otro a mano: `nz-avatar` ya resuelve el fallback solo (muestra la imagen
   si `nzSrc` tiene valor Y carga bien; si no, cae a `nzText`), tanto para
   `avatarUrl: null` como para una URL que falle en runtime. El mock mezcla
   usuarios con y sin foto a propósito (caso real: no todos han subido una).
11. **IDs de usuario, mínimo 4 dígitos**: `u0001`, `u0010`, etc. — el padding
    es cosmético (`String(n).padStart(4, '0')` en
    `UserManagementService.createUser`), `maxSeq` sigue leyendo el número con
    `Number(...)` así que no depende de cuántos ceros traiga. El mock de
    `MOCK_USERS`/`MOCK_AUDIT_LOG` se repobló completo con IDs de 4 dígitos —
    si se agrega un usuario suelto a mano ahí, debe seguir el mismo formato.
12. **Botones de Acciones: circulares y en el color de marca**: `.row-actions`
    fuerza `width/height: 34px` (más grande que `nzSize="small"`, ~24px) y
    `border-radius: 50% !important` sobre `.ant-btn` — así el fondo de
    `:hover` (`.ant-btn-text:hover`, bridge global) se ve como un círculo
    completo, no un cuadrado redondeado. `color: var(--color-primary)
    !important` los ata a la paleta activa (antes heredaban
    `--color-foreground` del bridge de `.ant-btn-text`); Eliminar
    (`.ant-btn-dangerous`) se excluye explícitamente y se queda en
    `--color-destructive` — mismo "semáforo" de siempre. `.row-actions` se
    promovió a `shared/styles/_row-actions.scss` al aparecer un segundo
    consumidor (`reconciliation-dashboard`, ver "Patrón: columna Acciones
    en tablas de cruce" más abajo) — mismo criterio de siempre, ver
    "Estructura de carpetas".
13. **Rol: ancho de la caja vs. ancho del panel de opciones son cosas
    distintas**: `.role-select` pasó de `width: 100%; max-width: 200px` a
    `width: auto` para que el label y la flecha de apertura queden pegados
    (la flecha de Ant se ancla al borde derecho de la CAJA, no al texto — si
    la caja es angosta, quedan juntos gratis). Sin
    `[nzDropdownMatchSelectWidth]="false"` en el `.html`, el panel de
    opciones heredaría ese mismo ancho angosto — con `false` mantiene su
    ancho natural (por contenido), igual que antes del cambio. La "×" de
    quitar un rol individual (que `nz-select[nzMode=multiple]` muestra por
    defecto en el tag visible) se oculta
    (`.ant-select-selection-item-remove { display: none !important; }`):
    cambiar de rol aquí es reabrir el panel y (des)marcar, no remover el tag
    a mano — un solo punto de interacción, igual que `StatusChip`.
14. **Mock de paginación**: `MOCK_USERS` creció de 8 a 25 usuarios (`u0010`
    en adelante, saltando `u0009` — reservado para el usuario eliminado, ver
    comentario en `user-management-mock.data.ts`) para poder probar
    `nzPageSize=10` con 3 páginas reales (10/10/5, la última parcial). Cada
    usuario nuevo mantiene su propia entrada `'created'` en
    `MOCK_AUDIT_LOG` — igual que los 8 originales — para que su pestaña
    "Historial" no se vea vacía solo por ser relleno.

## Patrón: conciliación por tender media y fecha (base POS)

`reconciliation-dashboard` ("Conciliación") dejó de mostrar UNA fila por
orden — ahora muestra TOTALES agrupados por `tender media + fecha` (un
banco liquida por lote diario, no orden por orden; comparar sumas de un día
es lo que de verdad se concilia contra el estado de cuenta). Motivo del
cambio: la tabla también dejó de tener su propio dataset desconectado — la
base de TODA conciliación es ahora el mismo mock de ventas que ya usa
`sales-dashboard` ("Resumen de venta"), es decir, el sistema POS.

### Fuente única: `sales-settlements.mock-data.ts` deriva de `sales-dashboard`

Antes, `MOCK_SALES`/`MOCK_SETTLEMENTS` (`shared/mock-data/
sales-settlements.mock-data.ts`) traían su propio dataset de `ORD-*`
inventado, sin relación real con las ventas que se ven en `/dashboard` —
fechas, folios y montos que no cuadraban entre pantallas, justo lo que este
cambio corrige:

- **`MOCK_SALES` (lado venta)** se arma mapeando el mock de POS completo
  (`features/sales-dashboard/data/sales-mock.data.ts`, mismo array que pinta
  la tabla de `sales-dashboard`) a `SaleTransaction`: `orderId =
  sale.reference` (la MISMA referencia que ya se ve en su columna
  "Referencia" — usar un id distinto rompía la trazabilidad entre las dos
  pantallas), `amount = saleTotal(sale)` (nunca un monto recalculado a
  mano). Ninguna venta se excluye por estar `cancelada` — el cruce usa
  `sale.reconciliationStatus` tal cual, el MISMO campo que ya pinta
  "Estado de conciliación" en `sales-dashboard`, así que una fila "Cruzado"
  ahí SIEMPRE trae su liquidación aquí y una "Por liquidar" ahí NUNCA la
  trae (excluir canceladas habría dejado el estado "Monto distinto" sin un
  solo caso real de demostración — hoy V-2005, cancelada, es la única venta
  `amount_mismatch` de todo el mock).
- **`MOCK_SETTLEMENTS` (lado banco)** se DERIVA de ese mismo
  `reconciliationStatus`, no se hand-authorea aparte: `matched` → una
  liquidación por el monto exacto; `amount_mismatch` → una liquidación al
  88% del monto (`MISMATCH_RATIO`, determinístico — nunca un delta
  hardcodeado por venta, así sigue siendo válido si el total de la venta
  cambia); `sale_only` → ninguna. Se completa con 4 liquidaciones huérfanas
  (`ORPHAN_SETTLEMENTS`) fechadas el 16 y 23 de agosto — los DOS únicos días
  del rango sin ninguna venta generada (`buildDay` los salta) — para que la
  anomalía "Sin venta" quede limpia, sin mezclarse con una venta `sale_only`
  real de ese mismo día+medio en una sola fila "Monto distinto" confusa.
- **Import cruzado de feature (`sales-dashboard`) hacia `shared/`** —
  única excepción documentada a la regla dura de "shared nunca importa de
  features" (ver "Estructura de carpetas"): mover el mock de ventas
  completo a `shared/` es el cierre correcto (`MOCK_SALES`/`saleTotal` ya
  tienen dos consumidores reales), pero se dejó pendiente porque otra
  sesión tenía esos archivos de `sales-dashboard` en vuelo al escribir esto
  — limpieza futura, no una decisión definitiva.
- **Una orden puede liquidarse en más de un depósito**: `V-2007` (venta de
  "pago mixto", ver `sales-mock.data.ts`) se liquida en 3 abonos parciales
  en vez de 1 — caso real (SPEI puede llegar por abonos) y de paso deja
  ≥3 transacciones bancarias bajo un mismo día+medio para demostrar "Ver
  detalles" con más de una fila. Esto obligó a corregir
  `cross-match.util.ts`: `crossMatchTransactions` ahora SUMA todas las
  liquidaciones de una misma orden para status/`difference` (antes tomaba
  "la última" del `Map`, lo que habría reportado esa orden como
  `amount_mismatch` con solo 1/3 de su monto real) — `TransactionMatch.
  settlement` se queda como una sola fila representativa (compat con lo que
  ya consumía `difference-management`), pero el monto ya no depende de cuál
  fila sea. `DifferenceManagementService.candidatePool` también se corrigió
  para excluir del pool por `orderId` (no por el id de esa fila
  representativa) — si no, las otras liquidaciones de una orden ya
  "cuadrada" quedaban sueltas, disponibles para robárselas a otra orden.

### `group-by-tender-day.util.ts` — agregación para la tabla de página

Función pura nueva (`reconciliation-dashboard/data/`, mismo criterio que
`cross-match.util.ts`: sin estado, testeable aislada) que agrupa
`SaleTransaction[]`/`SettlementTransaction[]` (ya separados por tender
media, mismo shape que el mock) por `date + tenderMedia`, sumando montos.
`ReconciliationService.filteredItems` filtra sobre este resultado
(`TenderDaySummary[]`), no sobre `TransactionMatch[]` — el cruce por orden
(`crossMatchTransactions`) se sigue calculando ahí (`orderMatches`,
privado) pero SOLO como insumo para encontrar la orden puntual de
"Gestionar" dentro de un grupo, nunca para pintar los totales.

- **Status del grupo, misma regla que antes pero a nivel de suma**:
  `soldAmount`/`settledAmount` en 0-y-0 no ocurre (el grupo no existiría);
  vendido>0 y banco=0 → `sale_only`; banco>0 y vendido=0 → `settlement_only`;
  iguales → `matched`; distintos → `amount_mismatch`. Exactamente la misma
  fórmula que usaba `crossMatchTransactions` por orden, solo que ahora
  compara sumas de un día en vez de un solo par venta/liquidación.
- **"Gestionar" sigue siendo por ORDEN**, aunque la fila que lo dispara sea
  un total agrupado: `TenderDaySummary.actionableOrder` guarda la primera
  orden `sale_only`/`amount_mismatch` de `orderMatches` que cae en ese
  `date + tenderMedia` (`null` si el grupo ya está "Cruzado" o es
  `settlement_only` — esos dos no tienen nada que gestionar a mano, mismo
  criterio de siempre). `isActionable(group)` exige AMBOS: el status del
  grupo Y que exista `actionableOrder` — un grupo con errores que se
  cancelan entre sí (una venta sin liquidar + una liquidación huérfana que
  compensan el total) podría verse "Cruzado" en la suma sin que ninguna
  orden individual esté realmente resuelta; ese edge case queda sin botón
  antes que mostrar un "Gestionar" que aterrice en la orden equivocada.
- **Columna "Transacciones"** (`group.soldCount`): cuántas ventas POS entran
  en `soldAmount` ese día — la señal visual de que la fila es un total
  agrupado, no una orden suelta (antes existía una columna "Orden", ya no
  aplica al agruparse).

### Modal "Ver detalles" — título por medio de pago + fecha, tabla `.table-bleed`

El modal ya no se abre "por orden" (no tiene una sola orden que nombrar en
el título) — `modalTitle` (computed en `reconciliation-dashboard.ts`) arma
`"Transacciones bancarias — {medio} · {fecha}"` con formateo manual de la
fecha ISO (evita depender de un pipe dentro de un binding `[nzTitle]`). El
contenido sigue siendo SIEMPRE una tabla (`group.settlements`, ya no
necesita una función `bankTransactionsFor` — el grupo ya trae la lista).

- **Primer `nz-modal` declarativo con header propio** (antes solo se usaba
  `NzModalService.confirm()`, que ya tenía su bridge — ver "Puente
  ng-zorro-antd ↔ tokens"): `.ant-modal-header`/`-title`/`-close` traen
  fondo blanco y texto casi negro fijos en el CSS compilado de Ant, mismo
  gotcha de siempre — se agregaron sus propias entradas en `styles.scss`.
- **`border-radius: 8px !important` + `overflow: hidden`** en
  `.ant-modal-content` (Ant trae `2px` fijo, sin recorte) — mismo radius que
  el resto de contenedores flotantes de la app (ver "Patrón: card base");
  `overflow: hidden` para que el header y la tabla de dentro (sin su propio
  radius) queden recortados por la esquina en vez de sobresalir en las 4
  puntas.
- **Header SIN línea divisoria** (`.ant-modal-header { border-bottom: none
  !important }`) — el divisor visual entre título y contenido lo da el
  propio borde superior de la tabla de dentro, no una línea aparte del
  header.
- **Tabla del modal — "estilos globales de tabla", sin color en su header,
  borde superior tocando los bordes del modal**: un `nz-modal` no es una
  `nz-card`, así que no hereda `.table-card` (ver "Patrón: card de tabla")
  solo por vivir dentro de uno. Se puenteó `.ant-modal-body .ant-table-thead
  > tr > th` en `styles.scss` (fondo transparente + sin línea vertical,
  mismo tratamiento que `.table-card`) para que CUALQUIER tabla futura
  dentro de un modal lo herede igual, sin repetir esto por feature. El
  borde superior tocando los bordes del modal lo resuelve el `.html`
  envolviendo la tabla en `.table-bleed` (`shared/styles/_data-table.scss`)
  — el mismo padding de 24px que trae `.ant-modal-body` de fábrica es
  exactamente lo que ese partial ya asume, así que se reutiliza tal cual,
  sin una variante nueva.

### Simplificación a 3 estados + "Desconciliar"

La tabla de "Conciliación" pasó de mostrar los 4 valores de `MatchStatus` a
solo 3, con su propio tipo — `ReconciliationStatus` (`'conciliado' |
'desconciliado' | 'por_conciliar'`, `shared/models/reconciliation-item.model.ts`)
y su propio tag — `ReconciliationStatusTag`
(`shared/components/reconciliation-status-tag/`, mismo patrón que
`MatchStatusTag`/`SaleStatusTag`: un enum de estado nuevo no se resuelve
reutilizando el tag de otro dominio aunque coincidan en color). **`MatchStatus`
no desaparece** — sigue siendo el tipo real a nivel de ORDEN
(`cross-match.util.ts`, `difference-management`, `sale.reconciliationStatus`
en `sales-dashboard`); `ReconciliationStatus` es solo la vista agrupada por
día + medio de pago de *este* feature.

- **`desconciliado` cubre DOS causas de `MatchStatus`**: `amount_mismatch`
  (monto distinto) y `settlement_only` (liquidación bancaria sin venta) — a
  nivel de día+medio ambas son "esto no cuadra, hay que revisarlo", ver
  `statusFor()` en `group-by-tender-day.util.ts` (ya no compara contra 4
  casos, solo 3: vendido>0 y banco=0 → `por_conciliar`; iguales →
  `conciliado`; cualquier otro caso (banco>0 y vendido=0, o montos
  distintos) → `desconciliado`).
- **Acciones por estado** (columna "Acciones", mismo patrón de iconos +
  tooltip de siempre): `conciliado` → "Ver detalles" (ojo, sin cambios) +
  **"Desconciliar"** (icono círculo-tachado, `nzDanger` — mismo "semáforo"
  que Eliminar en `user-list`). `desconciliado`/`por_conciliar` →
  "Gestionar" (lápiz, sin cambios). `isActionable(group)` ahora depende
  SOLO del status (antes también exigía `group.actionableOrder !== null`) —
  un grupo "Desconciliado" a mano no tiene una orden con discrepancia real
  detrás, y aun así debe mostrar "Gestionar" según lo pedido.
- **`ReconciliationOverridesStore`** (`shared/data/reconciliation-overrides.store.ts`,
  `providedIn: 'root'`, mismo motivo que `ResolvedMatchesStore`: sobrevive
  la navegación aunque `ReconciliationService` sea por-ruta) — un Set de
  claves `tenderMedia|date` marcadas "Desconciliar" a mano. Se aplica en
  `ReconciliationService.dayGroups` DESPUÉS de aplicar `ResolvedMatchesStore`
  (dos pasadas de `.map()` encadenadas): primero un match confirmado en
  "Gestión de diferencias" puede volver `conciliado` a un grupo, y solo
  entonces se evalúa si ese grupo (conciliado por mock o por resolución
  manual, da igual) fue desconciliado a mano. No hay "volver a conciliar"
  todavía — no se pidió, y agregar un `resolve()` simétrico es directo si
  hace falta (mismo archivo, mismo patrón).
- **`resolveLink` con fallback, ya no depende de `actionableOrder`**: antes
  el link a "Gestión de diferencias" solo existía si `group.actionableOrder`
  no era null. Ahora, cuando es null (grupo "Desconciliado" a mano, o una
  anomalía `settlement_only` pura sin `sale_only`/`amount_mismatch` real en
  el grupo), cae a `group.settlements[0]?.orderId` — sigue siendo un
  `orderId` válido para la ruta, aunque `difference-management` no tenga
  nada accionable que ofrecerle. **Limitación conocida, deliberada**: en ese
  caso `difference-management` muestra su estado vacío existente ("Esta
  orden no requiere gestión de diferencias, o no existe") en vez de una
  pantalla de resolución funcional — extender `difference-management` para
  soportar "resolver una orden ya matched pero desconciliada a mano" (o una
  anomalía `settlement_only` sin venta) es trabajo pendiente, no se hizo
  aquí para no tocar a fondo ese feature de paso.

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
5. "Gestionar" sobre un grupo "Desconciliado" sin una orden `sale_only`/
   `amount_mismatch` real detrás (desconciliado a mano, o una anomalía
   `settlement_only` pura) aterriza en el estado vacío de
   `difference-management`, no en una pantalla de resolución funcional — ver
   "Simplificación a 3 estados" arriba.
6. **`sales-dashboard` mezcla normativa mexicana y colombiana**: el "Resumen
   de la venta" ahora identifica al cliente y factura ante la DIAN
   (Colombia), pero `SALE_TAX_RATE` (`sale.util.ts`) sigue en 16% ("IVA
   estándar México" en su comentario — el IVA general colombiano es 19%) y
   TODOS los montos de la pantalla siguen formateados con `currency: 'MXN'`
   (4 archivos de la app, no solo `sales-dashboard`). No se tocó al agregar
   la identificación fiscal/factura electrónica porque cambiar la tasa y la
   moneda es un cambio transversal bastante más grande (recalcular los
   montos ya afinados de `sales-mock.data.ts` para seguir cumpliendo las
   invariantes de arriba, revisar los 4 archivos con `'MXN'`) que no se pidió
   explícitamente — pendiente si el negocio real es 100% colombiano.
