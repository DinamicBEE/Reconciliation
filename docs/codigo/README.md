# Documentación de código y convención de comentarios

Este directorio guarda lo que **no cabe en un comentario corto**: el porqué de una decisión,
contratos con el backend, invariantes de datos mock y riesgos conocidos. El código lleva solo
una línea o un bloque TSDoc breve que **enlaza aquí**.

Prioridad entre documentos (de mayor a menor, sin duplicar contenido):

| Tema | Dónde vive | Desde aquí |
|---|---|---|
| Arquitectura, capas, estado, formularios, seguridad | [`docs/architecture/frontend-angular.md`](../architecture/frontend-angular.md) y [ADRs](../architecture/decisions/README.md) | Se enlaza, no se copia |
| Diseño visual, tokens, patrones de pantalla, historial de cambios de UI | [`design-system/conciliation/MASTER.md`](../../design-system/conciliation/MASTER.md) | Se enlaza por título de sección |
| Contrato de endpoints del backend | `docs/api-endpoints.csv` y las guías PDF del backend en `docs/` | Se enlaza; las guías del backend no se editan |
| Porqué del código, contratos tal como los consume el front, invariantes, riesgos | `docs/codigo/<area>.md` (este directorio) | Fuente |
| Historia ("antes era X", "se retiró Y") | `git log` / PR y las secciones "Actualización" de MASTER.md | No va en comentarios |

---

## 1. Cuándo comentar

Comenta solo lo que **un lector competente no puede deducir** del código, el nombre o el tipo:

1. **El porqué no evidente**: una regla de negocio, un orden que importa, una alternativa
   descartada que alguien volvería a intentar.
2. **Un riesgo o una trampa**: un cast sin validar, una condición de carrera, un efecto lateral
   fuera del componente o un selector de CSS que pierde por especificidad.
3. **Un contrato externo**: endpoint, código de error, permiso que exige el backend o formato de
   archivo. Basta una línea con la referencia; el detalle va a `docs/codigo/`.
4. **API pública**: los símbolos exportados de servicios, utils, modelos, guards,
   interceptores y stores llevan TSDoc (sección 3).

## 2. Cuándo NO comentar

- **Lo que hace el código** (`// filtra los activos` sobre un `.filter(u => u.active)`).
- **Lo que ya dicen el nombre o el tipo** (`/** Id del usuario. */ userId: string`).
- **Historia**: "antes era", "ya no", "se movió de", "primer uso de", "retirado". Eso está en git
  y en MASTER.md. Excepción: si la historia explica una restricción **vigente**, se escribe la
  restricción, no la historia.
- **Copias de MASTER.md, del documento de arquitectura o de una ADR**: se deja `@see`.
- **Listas de quién consume un símbolo**: se averiguan con "Find references". Se menciona un
  consumidor solo si el acoplamiento no es visible (p. ej. un guard que lee un signal).
- **Énfasis en mayúsculas** (`YA`, `SOLO`, `REAL`, `TODA`). Si algo es importante, que lo diga
  el tipo, un nombre o un test.
- **Código comentado**: se borra; git lo conserva.

## 3. Límites de longitud (verificables)

| Tipo | Límite | Notas |
|---|---|---|
| `//` en TS o SCSS | **≤ 2 líneas seguidas** | Más largo: TSDoc del símbolo o `docs/codigo/` |
| Bloque `/** */` (TSDoc) | **≤ 4 líneas de descripción**, sin contar `/**`, `*/` ni las líneas de tags | Cada tag en **1 línea** |
| Bloque `/* */` sin TSDoc | Mismo límite; prefiere `//` | |
| HTML `<!-- -->` | **1 línea** | Solo marcas de sección (sección 6) |
| Specs | `//` ≤ 2 líneas, sin TSDoc | El nombre del `it(...)` es la documentación |

Si el contenido no cabe, **muévelo** a `docs/codigo/<area>.md` y deja en el código un resumen de
una línea con `@see` (o `// Ver docs/codigo/...` en SCSS y en código privado).

## 4. TSDoc en TypeScript

Sintaxis estándar [TSDoc](https://tsdoc.org/) (compatible con JSDoc y con el hover de VS Code).

**Qué lo lleva:** toda clase, función, constante, tipo o interfaz **exportada** desde
`*.service.ts`, `*.util.ts`, `*.model.ts`, `*.guard.ts`, `*.interceptor.ts`, `*.store.ts` y
`core/**`. Los miembros públicos de un servicio lo llevan cuando su comportamiento no es obvio por
la firma. Componentes: una línea en la clase si el nombre y la ruta no bastan; `input()`/`output()`
solo si su semántica no es evidente. Lo privado usa `//` breve o nada.

**Forma:**

```ts
/**
 * Resumen en una frase, en presente, que empieza por verbo o sustantivo.
 *
 * @remarks Una o dos líneas con el porqué, el riesgo o el contrato.
 * @param backendUserId - Id `app_user.id` del backend (no el id local `uXXXX`).
 * @returns Observable que emite el usuario actualizado; falla con `HttpErrorResponse` 409 si el correo ya existe.
 * @see docs/codigo/usuarios.md#alta-de-usuario
 */
```

| Tag | Uso en este proyecto |
|---|---|
| `@param nombre - texto` | Solo si el nombre y el tipo no bastan (unidades, origen del id, valores especiales). Lleva guion |
| `@returns` | Valores especiales (`null`, vacío, `'/login'`) y, en `Observable`, **qué emite y con qué falla**: un `Observable` no lanza excepciones; su error se documenta aquí |
| `@throws` | Solo en código **síncrono** que lanza (`throw`). Indica el tipo y la condición |
| `@remarks` | Porqué, riesgo o contrato en ≤ 2 líneas. Lo más largo va a `docs/codigo/` |
| `@see` | Ruta **relativa a la raíz del repo** con ancla: `docs/codigo/<area>.md#<ancla>`. Para MASTER.md, la ruta y el título de la sección entre comillas: `design-system/conciliation/MASTER.md "Patrón: botones"`. Para una ADR: `docs/architecture/decisions/0002-estado-signals-en-servicios.md` |
| `@deprecated` | Con el reemplazo: `@deprecated Usa {@link UsersApiService.listUsers}.` |
| `{@link Símbolo}` | Referencias a otros símbolos del código, en lugar de nombres sueltos entre comillas invertidas |

Contratos de backend en el código: endpoint y permiso en una línea
(`` `PATCH /users/{id}/status`, permiso `manage_users`. ``). Los DTOs se documentan campo por campo
solo si el significado difiere del nombre; las reglas del endpoint van a la doc del área.

## 5. SCSS

- `//` cortos (≤ 2 líneas): no salen al CSS generado. No uses `/* */` en SCSS.
- Marca de sección en **una línea**: `// --- Card de usuario ---`.
- Si una regla existe por un patrón de MASTER.md, basta con
  `// MASTER.md "Patrón: card de tabla"`. No copies la explicación.
- `///` de [SassDoc](http://sassdoc.com/annotations/) **solo** para `@mixin`, `@function`,
  `%placeholder` y variables `$` compartidas en `shared/styles/` o `src/styles.scss`, con
  `@param`/`@output`/`@example` cuando apliquen. Hoy no hay ninguno; las clases CSS usan `//`.
- Las explicaciones de un partial compartido (qué resuelve, cuándo usarlo, variantes) van a
  [`estilos.md`](estilos.md) si no están ya en MASTER.md.

## 6. HTML (plantillas)

- Evita `<!-- -->`. Úsalo solo como **marca de sección de una línea** en plantillas largas
  (más de unas 150 líneas): `<!-- Toolbar de filtros -->`.
- La lógica no se explica en la plantilla: si un `@if` necesita explicación, crea un `computed`
  con nombre claro y documenta ese computed en el `.ts`.

## 7. Qué se mueve a `docs/codigo/` y cómo se enlaza

1. **Se mueve:** el porqué, los contratos tal como los consume el front (campos que se ignoran,
   códigos de error con UI propia, paginación), las invariantes de mocks, los riesgos y las
   decisiones locales que no merecen ADR.
2. **Se borra:** la historia, lo que repite el código y lo que ya está en MASTER.md o en
   `docs/architecture/` (se sustituye por `@see`).
3. **Se promueve a ADR:** una decisión duradera o discutible (criterio del §14.3 del documento
   de arquitectura).
4. **Anclas estables:** cada sección de un archivo de área empieza con `<a id="kebab-ascii"></a>`.
   El código enlaza esa ancla, nunca el slug generado por el título. Una ancla no se renombra; si
   una sección desaparece, deja la ancla con una línea "Reemplazado por #otra".
5. **Formato de sección:** título, 1 a 3 párrafos o una lista y la línea `Código:` con los
   archivos que la enlazan. Sin historia ni fechas (eso va al PR).

## 8. Idioma y tono

Español, igual que el código actual. Los identificadores, nombres de tags y términos del backend
(`permitAll`, `UserSummaryDto`) se mantienen como están. Frases en presente, sin primera persona y
sin mayúsculas de énfasis.

## 9. Ejemplo antes/después (real: `src/app/core/auth/access-control.service.ts`)

**Antes** (19 + 5 + 8 + 4 + 5 + 3 líneas de comentario en un archivo de 77):

```ts
/**
 * Resuelve QUÉ puede ver/hacer el usuario logeado — separado de `AuthService`
 * a propósito: `AuthService` es (y debe seguir siendo) "tonto", solo sabe
 * quién inició sesión (`AuthUser`). Todo se resuelve con datos del backend
 * (`AuthUser`): este servicio ya NO depende de `UserManagementService` ni del
 * registro mock de `user-management`, lo que rompe el ciclo
 * auth ↔ user-management (ADR-0001, punto 5). [...]
 * `permissions` viene de `AuthUser.permissions` [...] Antes
 * de esta actualización se ignoraba el arreglo real del backend y siempre
 * se recalculaba desde `roles` [...]
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  // "Reprocesar" (Resumen de venta) = `POST /sales/capture`, que el backend
  // protege con el permiso `capture_sales` (Guia_Integracion_Frontend §6.3). Antes
  // era una regla por rol (ADMIN/CONTABILIDAD): con el endpoint conectado, mostrar
  // el botón a quien no tiene el permiso solo produciría un 403, y en un DEV sin
  // roles predefinidos nadie lo vería. Se decide por permiso, como el resto.
  readonly canReprocessSales = computed(() => this.permissions().has('capture_sales'));

  // Primera pantalla accesible para el usuario logeado — usada tanto para
  // aterrizar justo después de login como para el guard de rutas [...]
  // Orden fijo, no alfabético: es el mismo orden en
  // el que aparecen los módulos en el menú lateral.
  homeRoute(): string {
```

**Después:**

```ts
/**
 * Permisos y pantallas accesibles del usuario en sesión, derivados de {@link AuthService}.
 *
 * @remarks La única fuente es `AuthUser.permissions` del backend; no se recalcula por rol.
 * @see docs/codigo/sesion-y-acceso.md#permisos-efectivos
 */
@Injectable({ providedIn: 'root' })
export class AccessControlService {
  /** Muestra "Reprocesar": `POST /sales/capture` exige `capture_sales`. */
  readonly canReprocessSales = computed(() => this.permissions().has('capture_sales'));

  /**
   * Primera pantalla accesible, en el orden del menú lateral.
   *
   * @returns `'/login'` si la sesión no tiene ningún permiso reconocido (evita bucles de redirección).
   */
  homeRoute(): string {
```

**Y en `docs/codigo/sesion-y-acceso.md#permisos-efectivos`** queda lo que no es historia: por qué
el servicio está separado de `AuthService` (rompe el ciclo auth/user-management, ADR-0001 punto 5),
que un arreglo vacío significa "sin permisos" y que solo `PATCH /users/{id}/roles` lo cambia. Lo de
"antes se recalculaba desde `roles`" se borra: está en git y en MASTER.md.

## 10. Cómo revisar

Desde la raíz del repo (cualquier shell): `pnpm lint:comments` (o `pnpm lint:comments src/app/core`
para una carpeta). Lo implementa `scripts/check-comments.mjs`, equivalente al comando de abajo, y
sale con código 1 si hay hallazgos.

El mismo detector en Git Bash, sin Node:

```bash
find src \( -name '*.ts' -o -name '*.scss' -o -name '*.html' \) -print0 | xargs -0 awk '
  function cut() { if (n > 2) print FILENAME ":" s ": " n " líneas seguidas de //"; n = 0 }
  FNR == 1 { cut(); b = 0 }
  b { if (!/^[ \t]*\*[ \t]*@/) d++
      if (/\*\/|-->/) { b = 0; if (d > lim) print FILENAME ":" bs ": bloque con " d " líneas sin tag (máx. " lim ")" }
      next }
  /^[ \t]*\/\// { if (!n) s = FNR; n++; next }
  { cut() }
  /^[ \t]*\/\*/ && !/\*\// { b = 1; bs = FNR; d = 1; lim = 6; next }
  /^[ \t]*<!--/ && !/-->/ { b = 1; bs = FNR; d = 1; lim = 1 }
  END { cut() }'
```

- `lim = 6` equivale a `/**` + 4 líneas de descripción + `*/`. Las líneas que empiezan con `@`
  no cuentan.
- Para revisar solo lo que cambia un PR, reemplaza el `find ... -print0` por
  `git diff --name-only --diff-filter=AM main... -- 'src/*.ts' 'src/*.scss' 'src/*.html' | tr '\n' '\0'`.
- Línea base (27/10/2026, antes de la limpieza): **513 hallazgos** en `src/`. El objetivo es 0,
  y ningún PR debe sumar hallazgos.
- El detector no reconoce un `/*` dentro de una cadena ni comentarios al final de una línea de
  código. La revisión humana completa esos casos con la sección 2.

Checklist del PR (además del comando): no hay historia en los comentarios, cada `@see` apunta a una
ancla existente y lo que se movió no repite MASTER.md.

---

## Índice de áreas

| Archivo | Cubre (código fuente) |
|---|---|
| [`sesion-y-acceso.md`](sesion-y-acceso.md) | `core/auth/**`, `features/auth/**`, `app.ts` |
| [`interceptores-y-errores.md`](interceptores-y-errores.md) | `core/interceptors/**`, `core/auth/auth-errors.ts` |
| [`configuracion-y-pais.md`](configuracion-y-pais.md) | `core/country/**`, `src/environments/**`, `app.config.ts`, `app.routes.ts`, `main.ts`, `index.html` |
| [`usuarios.md`](usuarios.md) | `features/user-management/data/**` (salvo roles), `status-chip/**` |
| [`usuarios-pantallas.md`](usuarios-pantallas.md) | `user-list/**`, `user-detail/**`, `profile/**`, `user-audit/**` |
| [`roles-y-permisos.md`](roles-y-permisos.md) | `roles-permissions/**`, `roles-api.service.ts`, `role-code.util.ts`, `shared/models/access.model.ts` |
| [`ventas.md`](ventas.md) | `features/sales-dashboard/**`, `shared/models/sale.model.ts`, `shared/mock-data/**`, `sale-status-tag` |
| [`catalogos.md`](catalogos.md) | `features/catalogs/**`, `core/services/catalog.service.ts`, `organization-catalog.service.ts`, `catalog-entry.model.ts` |
| [`conciliacion.md`](conciliacion.md) | `features/reconciliation-dashboard/**`, `shared/data/**`, `cross-match.util.ts`, `reconciliation-item.model.ts`, tags de estado de cruce |
| [`diferencias.md`](diferencias.md) | `features/difference-management/**` |
| [`layout-y-tema.md`](layout-y-tema.md) | `core/layout/**`, `core/services/{menu,theme,palette}.service.ts`, `color-utils.ts` |
| [`estilos.md`](estilos.md) | `src/styles.scss`, `shared/styles/**` |
| [`componentes-y-utilidades.md`](componentes-y-utilidades.md) | `shared/components/{sparkline,radial-progress}`, `shared/utils/{avatar-color,iso-date}.util.ts` |

Los `.scss` y `.html` de una feature documentan en el archivo de su área; si la nota es sobre un
partial compartido, enlazan [`estilos.md`](estilos.md).
