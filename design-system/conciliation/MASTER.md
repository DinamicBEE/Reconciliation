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
| Ruteo | `provideRouter(routes, withComponentInputBinding())` — un param de ruta (`:tenderMedia`) o de **query** (`?date=`) se recibe como `input<string>()` en el componente, sin `ActivatedRoute`/`paramMap` manual. Un query param ausente en la URL simplemente llega como `undefined` al input — el componente decide el default (ver `tender-detail.ts`, `date` + `APP_TODAY_ISO`). |

## Estructura de carpetas (por feature)

```
src/app/
├── core/              # singletons, se instancian una sola vez
│   ├── layout/shell/    # header + <router-outlet>, toggle de tema, selector de paleta
│   └── services/        # ThemeService, PaletteService, color-utils
├── shared/            # reutilizable entre features — NUNCA depende de features/
│   ├── components/      # status-tag, match-status-tag, sparkline, radial-progress
│   ├── models/           # tipos de dominio compartidos (ReconciliationItem, etc.)
│   └── styles/           # partials SCSS (@use) — ver "Patrón de layout" abajo
└── features/
    └── <feature>/
        ├── data/           # <Feature>Service (signals) + mock data + utils puros
        └── <feature>.{ts,html,scss}
```

Regla dura: `shared` no importa de `features`. Si un modelo/componente empieza
siendo específico de un feature pero podría reutilizarse en otro, sube a
`shared/models` o `shared/components` (así se hizo con `ReconciliationItem`).

Una función de derivación pura y testeable (sin estado, sin DI) que un
`<Feature>Service` consume va en su propio archivo dentro de `data/`, junto al
service — no inline en el service ni en el componente (así se hizo con
`cross-match.util.ts` en `tender-detail`).

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
| `--color-background` | `#f8fafc` | `#020617` | Fondo de página (`body`, `.shell`) |
| `--color-foreground` | `#020617` | `#f8fafc` | Texto principal |
| `--color-card` | `#ffffff` | `#0e1223` | Fondo de tarjetas/tabla |
| `--color-card-foreground` | `#020617` | `#f8fafc` | Texto sobre card |
| `--color-muted` | `#e8ecf1` | `#1a1e2f` | Fondos tenues (hover de fila, header de tabla) |
| `--color-muted-foreground` | `#475569` | `#94a3b8` | Texto secundario/etiquetas |
| `--color-border` | `#e2e8f0` | `#334155` | Bordes |
| `--color-ring` | `#0f172a` | `#f8fafc` | Focus ring |
| `--color-chart-donut` | `#2563eb` | `#eab308` | Acento de gráficas (dona KPI) |

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
`nz-picker` a `--color-*`. **Cualquier componente nuevo de ng-zorro que uses
por primera vez, revisa si necesita su propia entrada aquí** (patrón: buscar
el selector real en `node_modules/ng-zorro-antd/ng-zorro-antd.min.css`,
confirmar que trae un color hardcodeado, y puentearlo).

Pendiente conocido: el borde de `nz-range-picker` no toma `--color-border`
pese a varios overrides reforzados — cosmético, no bloqueante, sin causa raíz
confirmada aún (posible tooling del entorno de verificación, no descartado
del todo). Investigar con captura de pantalla real antes de insistir más con CSS.

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
| `StatusTag` | `<app-status-tag [status]="...">` | Traduce un estado de dominio (`ReconciliationStatus`) a `nz-tag` con color+label. Patrón: cualquier enum de estado nuevo debería tener su propio "X-tag" así, no un `[ngSwitch]` inline repetido. |
| `MatchStatusTag` | `<app-match-status-tag [status]="...">` | Igual que `StatusTag` pero para `MatchStatus` (cruce venta/liquidación). Ejemplo del patrón "un enum de estado nuevo = un tag nuevo", no una condición extra en `StatusTag`. |
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
  visual. (Disponible pero sin consumidor actual — `tender-detail` usó esta
  variante en una iteración anterior y luego se reemplazó por completo con
  el patrón de "resumen global" de abajo, que es un caso distinto: una sola
  card con varias métricas, no varias cards independientes.)

Deltas ("+5 pts vs. ayer", o simplemente una segunda línea con `.text-muted`):
triángulo SVG inline (no icon font, no emoji) + color success/destructive
según signo cuando el delta es una comparación; texto plano `.text-muted`
cuando es solo contexto (p. ej. "3 de 6 transacciones").

## Patrón de layout: resumen global (tira de métricas en una sola card)

Distinto del patrón de KPI cards de arriba — aquí NO son indicadores
independientes, es **una sola card** con varias sumas relacionadas en fila
(usado en `tender-detail.html` para "Monto vendido / Monto liquidado /
Diferencia / Por liquidar / Requieren atención" del día). Página-específico
por ahora (`tender-detail.scss`, clases `.summary-card`/`.summary-strip*`) —
promover a `shared/styles/` si un segundo módulo lo necesita, mismo criterio
que ya se aplicó con `_kpi-card.scss`.

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

Reglas: `grid-template-columns: repeat(N, 1fr)` (colapsa a 2 columnas en
`max-width: 900px`), separador `border-left` entre items (no gap solo), y el
valor NUNCA lleva color por defecto — solo se colorea (`.text-warning`,
`.text-destructive`) cuando el número representa algo que requiere atención,
igual que en las tablas.

## Convención: "hoy" sin backend

No hay reloj real que usar — el `new Date()` del navegador correría
desalineado de los datos mock (fijos en agosto de 2026) y "hoy" mostraría
siempre una tabla vacía. Cada feature que necesite "hoy" define su propia
constante `APP_TODAY_ISO` en su `data/*.service.ts` (ver
`tender-detail.service.ts`) — **no** una global compartida todavía (son solo
2 usos: dashboard y tender-detail, cada uno con su propia fecha "actual" del
relato). Si aparece un tercer consumidor, ese es el momento de subirla a
`shared`.

## Patrón: doble entrada a una misma pantalla de detalle con distinto alcance

`tender-detail` se abre desde dos lugares con semántica distinta:

1. Lista "Medios de pago" (KPI 1 del dashboard) → sin `?date=` en la URL →
   default a `APP_TODAY_ISO` ("hoy").
2. Una fila de la tabla inferior del dashboard → `[queryParams]="{ date: item.date }"`
   → esa fecha específica, no "hoy".

El componente no distingue el origen explícitamente — solo lee `date` como
input opcional y decide el default. Esto es deliberado: más simple que
propagar de dónde vino el click, y el resultado es el mismo (la pantalla
siempre sabe qué fecha mostrar). El título muestra "Hoy" o la fecha formateada
según corresponda (`isToday()` comparando contra `APP_TODAY_ISO`).

## Iconografía

**Nunca emoji.** SVG inline, `stroke="currentColor"`, `viewBox="0 0 24 24"`,
tamaño `18px` para botones de header. Patrón `.icon-button` en
`shell.scss` — cualquier botón de icono nuevo en el header reutiliza esa
clase, no la reinventa.

## Servicios de tema (`core/services`)

- **`ThemeService`**: signal `mode: 'light'|'dark'`, persiste en
  `localStorage`, alterna la clase `.dark` en `<html>` Y el `href` del
  `<link id="nz-theme-link">` (ng-zorro no tiene toggle de dark mode vía CSS
  vars — solo dos hojas precompiladas alternas, hay que intercambiar el
  `<link>`).
- **`PaletteService`**: ver arriba. Depende de `ThemeService` (recalcula al
  cambiar de modo).

## Patrón: cruce transacción a transacción entre dos fuentes

Usado en `features/tender-detail` ("Detalle por tender media", ruta
`/detalle/:tenderMedia`) para cruzar ventas vs. liquidaciones por
orden/referencia. Reutilizar si un módulo futuro necesita comparar dos listas
independientes por un ID común (p. ej. facturas vs. pagos, inventario vs.
conteo físico):

1. Modelo en `shared/models`: dos entidades "lado A"/"lado B" con un campo de
   cruce común (`orderId`), + un tipo unión de resultado (`MatchStatus`) que
   cubre los 4 casos posibles: coincide, existe en ambos pero difiere, solo en
   A, solo en B. + un tipo `*Match` que trae ambos lados (nullable) y el
   resultado.
2. Función pura de cruce en `data/cross-match.util.ts` (no en el service):
   `Map` por ID del lado B, recorre A marcando coincidencias, luego agrega lo
   de B que quedó sin marcar. Sin estado — se puede probar aislada.
3. El `<Feature>Service` solo orquesta: guarda las dos listas fuente, expone
   `computed` con el resultado del cruce, un `computed` intermedio acotado por
   fecha/alcance si aplica (p. ej. `dateScopedMatches`), y un `computed` de
   resumen que parte de ESE intermedio — no de la lista de filtro de la
   tabla (`statusFilter`), que solo debe afectar qué filas se ven, nunca lo
   que se suma en el resumen.
4. Cada uno de los 4 estados tiene su propio color en el `*StatusTag`, pero
   ninguno reutiliza literalmente los 3 estados de `ReconciliationStatus` —
   son conceptos relacionados pero no iguales ("por liquidar" ≠ "pendiente"
   aunque visualmente ambos son ámbar).

## Pendientes / deuda conocida al cerrar este módulo

1. Borde de `nz-range-picker` no refleja `--color-border` (ver arriba).
2. Página de override: [`pages/login.md`](pages/login.md) — la pantalla de
   login vive fuera de `Shell` (dos paneles, sin header), documentada ahí.
   Sigue el mismo patrón si un módulo futuro necesita desviarse de este
   MASTER.
