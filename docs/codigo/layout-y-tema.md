# Layout y tema

Porqué del código de `Shell`, Header, menú lateral, modo claro/oscuro y paleta en tiempo de
ejecución. Lo visual está en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón de
layout: Header", "Patrón: navegación entre módulos (Menu lateral)", "Selector de paleta" y
"Servicios de tema". Convención: [README](README.md).

<a id="shell"></a>
## Shell (grid principal)

MASTER.md: "Menu lateral: layout, expandido/contraído y tokens". `.shell` es un grid de 2 columnas ×
2 filas (`auto 1fr` × `72px 1fr`). `.shell__menu` ocupa la columna izquierda y abarca ambas filas, por
eso el menú mide el alto total y queda "por arriba" del header; el ancho de esa columna lo decide el
propio `.app-menu`, así que expandir o contraer empuja el contenido en vez de superponerse.

El alto es fijo (`height: 100vh`, no `min-height`) con `overflow: hidden`: el scroll de una tabla
larga queda dentro de `.shell__content` y el menú y el header nunca salen de vista. `.shell__header`
solo reserva su celda; el estilo del header vive en `app-header`.

Código: `src/app/core/layout/shell/**`.

<a id="header"></a>
## Header y búsqueda de pantallas

MASTER.md: "Patrón de layout: Header (extraído de Shell) y card de usuario logeado" y "Acciones del
Header: búsqueda de pantallas y notificaciones".

- **Sin fondo ni divisor.** El Header flota sobre `--color-background`; el único elemento con fondo
  propio es la card del avatar, que con una sombra interna (card) y otra externa (avatar) hace que el
  avatar parezca flotar sobre ella.
- **Búsqueda.** `SEARCHABLE_PAGES` (`header-search.util.ts`) es el catálogo completo y solo incluye
  rutas sin parámetros. Cada entrada declara el permiso (y, si aplica, el rol exclusivo) que exige la
  ruta; sin `permission`, la ve cualquier usuario autenticado. `Header.results` filtra por permiso y rol
  **antes** de llamar a `searchPages`, porque un resultado que el usuario no puede abrir es peor que
  no mostrarlo (mismo criterio que el menú lateral). `searchPages` es pura y no devuelve nada con la
  consulta vacía. La lupa y el input no conviven: comparten `.app-header__search`, que ancla el
  dropdown de resultados.
- **Foco.** Un `effect()` enfoca el input cuando `searchOpen()` pasa a `true`; no se puede hacer en
  `openSearch()` porque el `@if` aún no renderizó el `<input>`.
- **Usuario en sesión.** Nombre, roles e iniciales salen solo de `AuthUser`: `core` no lee el registro
  mock de `user-management` (ADR-0001, puntos 2 y 5). El color del avatar se calcula con el
  `username`, porque la sesión no trae foto ni id del registro de usuarios.
- **Menú del avatar.** Agrupa Perfil, paleta, tema y cerrar sesión. Se cierra con un click fuera de
  `#avatarMenuRoot` o con `Escape`. El grid de acentos se despliega dentro del mismo panel en vez de
  en un popover anidado, para no tener conflictos de cierre entre dos overlays. Un click sobre el
  acento activo lo quita (vuelve a la paleta por defecto).

Código: `src/app/core/layout/header/**` (incluye `header-search.util.ts`).

<a id="encabezado-de-pantalla"></a>
## Encabezado de pantalla en el header

- `app-header` pinta el `nz-page-header` de la pantalla activa a la izquierda de sus iconos. No hay título
  si la ruta no declara `data.title`.
- `PageHeaderService` (root) lee `title` y `parent` de la `data` de la ruta hoja en cada `NavigationEnd`.
  `bind()` agrega lo que el componente conoce: lo suyo sustituye a lo de la ruta y se quita al destruirlo
  (cada `bind` lleva su dueño, así el cierre de una pantalla vieja no borra el de la nueva).
- Los botones llegan como `TemplateRef` declarado en la pantalla: conservan sus estilos encapsulados y sus
  handlers, aunque el header los inserte en otro punto del árbol.
- `.shell` usa `grid-template-rows: auto 1fr` y el header `min-height: 72px`: un subtítulo largo hace crecer
  la fila en lugar de cortarse.

Código: `core/layout/header/page-header.service.ts`, `header.html`, `header.ts`, `app.routes.ts`.

<a id="menu-lateral"></a>
## Menú lateral y estado expandido/contraído

MASTER.md: "Patrón: navegación entre módulos (Menu lateral)" y "Menu lateral: layout,
expandido/contraído y tokens".

- **Estado.** `MenuService.expanded` es un signal persistido en `localStorage`
  (`conciliation-menu-expanded`); contraído por defecto. Contraído solo se ven los iconos (cada link
  lleva `nz-tooltip` a la derecha y `aria-label`; expandido el tooltip se desactiva con título `null`) y el icono activo va en `--color-primary` para que se note la pantalla actual
  sin etiqueta.
- **Superficie flotante.** `.app-menu` comparte fondo (`--color-on-primary`) y borde con `.user-card`
  del Header. Se despega 8px de los bordes con `margin` y su alto descuenta esos márgenes
  (`calc(100% - 16px)`): con `100%`, la caja excede el alto de `.shell` y su `overflow: hidden`
  recorta el margen inferior.
- **Pie.** `.app-menu__items` con `flex: 1 1 auto` empuja el separador y "Cerrar sesión" al fondo sin
  `position: absolute`. El botón del pie reutiliza `.app-menu__link`, por eso esa clase resetea los
  estilos nativos de `<button>`.

Código: `src/app/core/layout/menu/**`, `src/app/core/services/menu.service.ts`.

<a id="tema"></a>
## Modo claro/oscuro

MASTER.md: "Servicios de tema (`core/services`)". `ThemeService` alterna la clase `dark` en `<html>`
(tokens propios de `styles.scss`) y el `href` del `<link id="nz-theme-link">`. ng-zorro no expone
variables CSS para fondo, texto ni borde, solo para colores de marca, así que el modo oscuro de sus
componentes requiere intercambiar entre sus dos hojas precompiladas (`ng-zorro-antd.min.css` y
`ng-zorro-antd.dark.min.css`), que `angular.json` copia a `/ng-zorro`. La preferencia se guarda en
`localStorage` (`conciliation-theme`); sin preferencia guardada se sigue `prefers-color-scheme`.

Código: `src/app/core/services/theme.service.ts`.

<a id="paleta"></a>
## Paleta derivada de una semilla

MASTER.md: "Selector de paleta (personalización en runtime)".

- **Semilla.** Cada acento de `PALETTE_OPTIONS` aporta solo su matiz (`hexToHue`); `buildPalette`
  deriva con fórmulas HSL distintas para claro y oscuro todos los tokens de `TOKEN_NAMES` (marca,
  superficies y sus `on-*`), en lugar de mantener 6 paletas × 2 modos a mano. Los acentos evitan
  verde, ámbar y rojo para no confundirse con los estados.
- **Fuera de la paleta.** `--color-success`, `--color-warning`, `--color-destructive` y
  `--color-tag-*` no están en `TOKEN_NAMES`: su significado es el estado de un movimiento.
- **Superficies.** En claro el fondo queda más oscuro que la card; en oscuro, la card más clara que el
  fondo. Muted y border se escalonan a partir de esos dos para seguir distinguiéndose; si se ajusta
  uno, hay que revisar los cuatro (ver [estilos.md](estilos.md#tokens)).
- **Aplicación.** Los tokens se escriben como estilo en línea de `<html>`, así ganan a `:root` y a
  `html.dark` sin tocar `styles.scss`. Con `null` se quitan y vuelven los valores por defecto. El
  `effect()` depende también de `ThemeService.mode`, así que la paleta se recalcula al cambiar de modo.
  La semilla se guarda en `localStorage` (`conciliation-palette`).

Código: `src/app/core/services/palette.service.ts`, `color-utils.ts`.
