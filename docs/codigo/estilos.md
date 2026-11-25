# Estilos globales y partials compartidos

Porqué de `src/styles.scss` (tokens y puente con ng-zorro-antd) y de los partials de
`src/app/shared/styles/`. [MASTER.md](../../design-system/conciliation/MASTER.md) manda en tokens y
patrones: aquí solo va lo que MASTER no cubre (especificidad, orden de carga, `!important`
justificados, límites de un partial). Si MASTER ya lo explica, la sección solo enlaza su título.
Convención: [README](README.md), sección 5.

<a id="tokens"></a>
## Tokens globales y colores de tag

MASTER.md: "Tokens de color", "Colores semánticos" y "Colores de tag".

- **Origen.** La base sale de la skill `ui-ux-pro-max`: paleta "Banking/Traditional Finance",
  tipografía "Dashboard Data" (Fira Sans + Fira Code) y estilo "Data-Dense Dashboard". La skill no
  trae variante oscura para esa combinación: `html.dark` se deriva a mano, conserva la identidad
  navy + dorado, invierte las superficies y usa verde/ámbar para positivo/pendiente.
- **Superficies.** `--color-background` es más oscuro que `--color-card` en claro (y al revés en
  oscuro) para que la card se lea como superficie elevada. Si se ajusta uno de background, card,
  muted o border, hay que revisar los otros tres y las fórmulas de `PaletteService`
  ([layout-y-tema.md](layout-y-tema.md#paleta)).
- **Colores de tag.** Los valores claros de `--color-tag-*` son un calco exacto de los hex que
  ng-zorro trae en `.ant-tag-success|error|warning`, así el puente no cambia el modo claro; los
  oscuros adaptan el esquema dark de Ant Design v5 porque el proyecto no usa el theme algorithm de
  Ant. Igual que los semánticos, no siguen la paleta.

Código: `src/styles.scss`.

<a id="puente-ng-zorro"></a>
## Puente ng-zorro-antd y tokens (cards, tags, dropdown, tabs, modal, collapse)

MASTER.md: "Puente ng-zorro-antd ↔ tokens". Las hojas precompiladas de ng-zorro traen colores fijos
(`.ant-card{background:#fff}`); sin el puente, ni el modo oscuro ni la paleta llegan a cards, tabla,
picker, select, drawer, dropdown, tabs ni modal. Se usa `!important` de forma deliberada: algunos
selectores de Ant (`.ant-table-thead > tr > th`) son más específicos que una clase propia.

- **Pickers.** El borde de `.ant-picker` se refuerza con `html body` porque dentro de
  `nz-table`/`nz-date-picker` compite con reglas internas difíciles de rastrear en el CSS minificado.
  El borde de `nz-range-picker` sigue pendiente (ver MASTER).
- **Radius.** Select, input y picker usan 6px; cards, botones y modal, 8px; `.table-card` y
  `.ant-tabs-nav`, 12px.
- **Tabs.** `.ant-tabs-nav` se dibuja como pill propio (borde, radius 12px, fondo de card). La línea
  inferior de ancho completo que Ant dibuja en `::before` sobresale del borde redondeado, así que se
  oculta en lugar de recolorearse.
- **Modal.** `.ant-modal-content` lleva `overflow: hidden` para que el header y la tabla internos
  queden recortados por la esquina redondeada. El header de un `nz-modal` declarativo no lleva
  divisor: lo da el `border-top` de `.table-bleed`, que la plantilla pone alrededor de la tabla. Una
  tabla dentro de un modal recibe el mismo header que `.table-card` (sin fondo ni línea vertical),
  porque un modal no es una `nz-card`.
- **Componente nuevo de ng-zorro.** Se puentea solo si su fondo o texto fijo queda ilegible en oscuro
  (criterio de MASTER); se confirma en `node_modules/ng-zorro-antd/ng-zorro-antd.min.css`.

Código: `src/styles.scss`.

<a id="nz-collapse"></a>
## `nz-collapse` estándar

MASTER.md: "Patrón: creación de roles (`/gestion-de-roles/nuevo`) + `nz-collapse` estándar". El
collapse vive dentro de una card: sin borde exterior ni radius, con divisor entre paneles (salvo el
último) y entre el header de cada panel y su contenido (la variante `nzBordered=false` de Ant lo
quita). `ng-zorro-antd.min.css` incluye una regla suelta
`.ant-collapse .ant-collapse-header { padding: 0 !important }` que pega el header a los bordes; el
prefijo `html body` sube la especificidad para que el `!important` propio gane. El proyecto no
registra iconos de ng-zorro: cada panel pasa su SVG por `[nzExpandedIcon]` y la regla lo gira 90° en
`.ant-collapse-item-active`.

Código: `src/styles.scss`.

<a id="encabezado-de-pagina"></a>
## `nz-page-header` global

MASTER.md: "Patrón: encabezado de página". El `nz-page-header` solo lo renderiza `app-header`
([`layout-y-tema.md`](layout-y-tema.md#encabezado-de-pantalla)); estas reglas fijan su aspecto. No lleva
padding ni fondo propios (también se anula el `padding-top` de `.has-breadcrumb`) y el breadcrumb queda a
2px del título, para que el conjunto quepa en los 72px del header. Todas las reglas llevan el prefijo
`html body` para ganar a la hoja de ng-zorro sin depender del orden de carga, que cambia entre dev y build
(ver [especificidad](#especificidad)).

Código: `src/styles.scss`.

<a id="botones"></a>
## Botones (radius, paleta, icono + label)

MASTER.md: "Patrón: botones" (incluye el orden de reglas, el "semáforo" de `nzDanger` y la regla
"icono + label"). Lo que importa al editar el bloque:

- Todas las reglas tienen la misma especificidad (una clase) y `!important`, así que decide el orden
  de declaración: base → primary → dangerous → dangerous + primary → link → dangerous + link → text →
  disabled. Disabled va siempre al final.
- Los botones leen `--color-primary`/`--color-on-primary`, que `PaletteService` escribe en `<html>`;
  no hace falta tocar el servicio para que sigan la paleta.
- `display: inline-flex` lleva `!important` porque Ant declara `inline-block` con la misma
  especificidad; `justify-content: center` mantiene centrado el icono de los botones solo icono
  (`.row-actions`).

Código: `src/styles.scss`.

<a id="partial-data-table"></a>
## `_data-table.scss` (card de tabla y bleed)

MASTER.md: "Patrón: card de tabla" y "Regla general: tablas".

- `.table-card` hereda borde y sombra del puente de `.ant-card` y solo pisa el radius (12px). Necesita
  `!important` porque el puente también lo usa.
- El header de la tabla va sin fondo ni línea vertical entre columnas. El fondo compite con el puente
  global (misma especificidad e importancia) y la línea vertical, con un selector de Ant más
  específico sin `!important`: ambos necesitan el `!important` propio.
- `.table-bleed` es para cards con `.toolbar` dentro (`nzBodyStyle` con padding de 24px): el margin
  negativo y el ancho extendido cancelan el padding a nivel de caja, para que el `border-top` llegue a
  los bordes como divisor entre filtros y tabla; su padding devuelve el inset al contenido. En cards
  sin toolbar (padding 0) no hace falta.
- Ninguna columna de texto libre crece según su contenido: `.col-truncate` la topa con
  `--col-max-width` (160px por defecto) y el `<td>` conserva el texto completo en `[attr.title]`.

Código: `src/app/shared/styles/_data-table.scss`.

<a id="partial-info-fields"></a>
## `_info-fields.scss`

MASTER.md: "Patrón \"icono + etiqueta arriba, valor abajo\" (`.info-fields`)". Se usa cuando el
layout es un grid de varias columnas por sección (detalle de usuario, resumen del drawer de venta).
Para una sola columna angosta con el valor en la misma fila se usa `_summary-columns.scss`.

- `.info-field` es un flex en columna: un tag hijo directo se estira al ancho de la columna
  (`align-items: stretch`). Envolverlo en `.info-field__value-row` hace que vuelva a medirse por su
  contenido; la misma fila sirve para un valor con acción rápida al lado.
- `.info-field__input` y `.info-field__error` son para modo edición; un consumidor de solo lectura no
  los usa.

Código: `src/app/shared/styles/_info-fields.scss`.

<a id="partial-summary"></a>
## `_summary-columns.scss` y `_summary-strip.scss`

- `_summary-columns.scss`: MASTER.md "Patrón \"icono + etiqueta + valor\" (2 columnas opcional)". El
  divisor de `.summary-col` usa `--color-primary` a propósito (la única línea divisoria que no usa
  `--color-border`) y depende de ser `:first-child` del grid, por eso `.summary-fields` no se anida
  dentro de `.summary-columns`. `__control` y `__error` existen para la variante editable;
  `flex-wrap` deja bajar el error sin romper la fila.
- `_summary-strip.scss`: MASTER.md "Patrón de layout: resumen global (tira de métricas en una sola
  card)". Son sumas relacionadas en una card, no KPIs independientes; el número de columnas se fija
  con `--summary-strip-cols` (5 por defecto).

Código: `src/app/shared/styles/_summary-columns.scss`, `_summary-strip.scss`.

<a id="partial-kpi-y-estado"></a>
## `_kpi-card.scss`, `_status-card.scss`, `_status-legend.scss` y `_status-dot.scss`

- `_kpi-card.scss`: MASTER.md "Patrón de layout: card de KPI (con o sin gráfica)". La fila de KPIs
  nunca supera ~1/3 del alto de la ventana (`.kpi-grid` la topa a 22vh). En la variante con dona no
  hay `gap`: se sumaría solo a un lado del `margin: auto` que centra la dona. La dona crece al alto
  del card con tope de 96px de ancho; el SVG conserva su proporción (`preserveAspectRatio="meet"`) y
  el espacio contra los bordes lo da el `nzBodyStyle` del card.
- `_status-card.scss`: MASTER.md "Patrón: card de indicador con semáforo (`.status-card`)". Fondo y
  borde llevan `!important` porque el puente de `.ant-card` también lo usa. Uso:
  `<nz-card class="status-card status-card-success">`.
- `_status-legend.scss`: MASTER.md "Patrón: leyenda de resultado \"icono + texto\"
  (`.status-legend`)". Existe porque ng-zorro no tiene un tag con icono y el resultado de una revisión
  no es el estado de una fila. Uso: `<span class="status-legend status-legend-success"><svg …/>
  Archivo válido</span>`.
- `_status-dot.scss`: punto de 8px con `--color-success`/`--color-destructive` (relleno sólido, no
  colores de tag).

Código: los cuatro partials en `src/app/shared/styles/`.

<a id="partial-tabla-acciones"></a>
## `_row-actions.scss`, `_toolbar.scss`, `_chip.scss` y `_bank-badge.scss`

- `_row-actions.scss`: columna "Acciones" con botones solo icono, cada uno con `nz-tooltip` y
  `aria-label`. Son circulares (radius 50%, no los 8px de `.ant-btn`) y de 34px, un poco más que
  `nzSize="small"`, para que el hover se lea como un círculo completo. Usan `--color-primary` en vez
  del `--color-foreground` de `.ant-btn-text`, salvo `nzDanger`, que queda en `--color-destructive`.
  Los colores llevan `!important` para ganar al bloque de botones de `styles.scss`.
- `_toolbar.scss`: barra de filtros sobre una tabla. `.toolbar__filter--search` es más ancho por su
  placeholder largo; `.toolbar__spacer` empuja lo siguiente al extremo derecho y, con `flex-wrap`, se
  colapsa para que el botón baje de línea.
- `_chip.scss`: indicador de solo lectura con las métricas de `StatusChip` (pastilla, 12px/600), sin
  menú, chevron ni cursor de acción. Si el chip debe cambiar algo, es un `StatusChip` o similar con
  `nz-dropdown`. MASTER.md "Regla general: tablas".
- `_bank-badge.scss`: icono de banco sobre `--color-secondary` con trazo `--color-on-secondary`, que se
  lee en claro y en oscuro.

Código: los cuatro partials en `src/app/shared/styles/`.

<a id="partial-import-dropzone"></a>
## `_import-dropzone.scss`

MASTER.md: "Patrón: importar movimientos bancarios (carga masiva, no por orden)". `.import-dropzone-row`
centra el botón en su contenedor; `.import-dropzone` es el botón: caja punteada con icono y label
centrados como una unidad. Variantes:

- `:disabled` para cuando falta un requisito previo (p. ej. elegir medio de pago y cuenta); anula el
  realce de hover/focus.
- `.import-dropzone--over` repite el realce de hover mientras se arrastra un archivo encima.
- `.import-dropzone__label` pone el texto en dos filas; la segunda (`__hint`) va en `--color-primary`.

Código: `src/app/shared/styles/_import-dropzone.scss`.

<a id="especificidad"></a>
## Especificidad y uso de `!important`

MASTER.md: "Gotcha de CSS: una utilidad compartida puede perder contra un selector local con más
especificidad" y el gotcha de `.table-card` en "Patrón: card base".

- El orden de carga de las hojas de ng-zorro y de `styles.scss` cambia entre dev y build, así que no
  se confía en él. Para ganar a una regla de ng-zorro de igual especificidad se sube la propia con el
  prefijo `html body` (o `html.dark body` para el reset de `body`).
- Una declaración con `!important` gana a cualquiera sin `!important`, sea cual sea la especificidad;
  la especificidad solo desempata entre reglas de la misma importancia. Toda excepción local a un
  bloque del puente (card base, botones) necesita su propio `!important` y se confirma visualmente.

Código: `src/styles.scss`, `src/app/shared/styles/**`.
