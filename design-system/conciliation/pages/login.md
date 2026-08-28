# Página: Login

> Deviación deliberada de `MASTER.md`, documentada según su sección final
> ("créala si un módulo futuro necesita desviarse deliberadamente de este
> MASTER — p. ej. una pantalla de login con otro layout").

## Por qué se desvía

`MASTER.md` describe el layout de `Shell` (header fijo + `router-outlet`)
como el contenedor de toda la app. Login **no vive dentro de `Shell`**:

- No tiene sentido mostrar el header de la app (título "Conciliación
  Bancaria", selector de paleta, toggle de tema) *antes* de que la sesión
  exista — el usuario aún no debería ver el marco del dashboard.
- Por eso `app.routes.ts` monta `Shell` como layout route solo para lo que
  requiere sesión (`dashboard`, `detalle/:tenderMedia`, vía `authGuard`), y
  `login` es una ruta hermana, fuera de ese árbol. `app.html` pasó de
  `<app-shell />` fijo a un `<router-outlet />` desnudo por esto.

## Qué SÍ se reutiliza de MASTER

- Tokens de color (`--color-primary`, `--color-background`, `--color-card`,
  etc.), tipografía (`--font-heading`/`--font-body`) y el breakpoint de
  layout de 900px — todo vía `var(--color-*)`, cero hex nuevos.
- Iconografía: SVG inline, `stroke="currentColor"`, `viewBox="0 0 24 24"`,
  18px en botones de acción — mismo criterio que `shell.html`.
- El toggle de tema reutiliza `ThemeService` (`providedIn: 'root'`) con el
  mismo icono sol/luna de `shell.html`, porque el servicio no depende de
  `Shell` — solo se duplicó el HTML del botón (ver siguiente punto).
- `.icon-button`: mismo look que en `shell.scss`, pero **duplicado** en
  `login.scss` — Angular encapsula estilos por componente (`ViewEncapsulation`
  por defecto), así que la clase no se puede compartir entre `Shell` y
  `Login` sin promoverla a `styles.scss` global. Se optó por duplicar el
  bloque pequeño en vez de tocar el global por un solo consumidor nuevo; si
  aparece un tercer consumidor, promover a global.

## Qué es distinto (a propósito)

- **Layout de dos paneles** (marca + formulario) en vez de header+contenido.
  El panel de marca (gradiente `--color-primary` → `--color-secondary`) se
  oculta en `max-width: 900px` y se reemplaza por una marca compacta arriba
  del formulario (`.login-card__mobile-brand`) — nunca desaparece del todo.
- **Formulario con Reactive Forms** (`ReactiveFormsModule` + `nz-form`), a
  diferencia de los filtros del dashboard que usan `ngModel`/`FormsModule.
  Se justifica porque login necesita validación real por campo (`required`,
  `minlength`) con mensajes de error, no solo un valor seleccionado de una
  lista — el patrón estándar de ng-zorro-antd para esto es Reactive Forms
  (`nz-form-control [nzErrorTip]`).
- **`nz-input-password`** (componente nativo de ng-zorro-antd v22) para
  mostrar/ocultar contraseña, con el icono default de Ant reemplazado por
  SVG inline propio vía `nzInputPasswordIcon` (mismo criterio de
  iconografía que el resto de la app — nunca el set de iconos de Ant tal
  cual).

## Autenticación (mock, sin backend)

- `features/auth/data/auth.service.ts` (`providedIn: 'root'`): valida contra
  una lista fija en `auth-mock.data.ts`. `login()` es el único punto que
  cambiaría al conectar un backend real.
- Sesión persiste en `sessionStorage` (no `localStorage`): una sesión mock no
  debe sobrevivir a cerrar el navegador.
- `features/auth/data/auth.guard.ts` protege el layout route de `Shell`
  completo — cualquier ruta nueva que cuelgue de `Shell` queda protegida
  automáticamente, sin tener que agregar el guard módulo por módulo.
- Logout: botón en el header de `Shell` (mismo patrón `.icon-button`),
  visible solo porque `Shell` ya vive detrás del guard.

## Credenciales de demo

| Usuario | Contraseña |
|---|---|
| `admin` | `Conciliacion2026` |
| `analista` | `Analista2026` |
