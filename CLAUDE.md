# Conciliation

Angular 22 + ng-zorro-antd + pnpm. App de conciliación bancaria (multi-tender:
BBVA, Rappi, DiDi Food, Efectivo).

## Antes de construir cualquier pantalla o componente nuevo

Lee **[`design-system/conciliation/MASTER.md`](design-system/conciliation/MASTER.md)**.
Es el sistema de diseño real (tokens de color, tipografía, densidad,
componentes reutilizables, convenciones de estructura) derivado del dashboard
de conciliación ya construido — no una recomendación genérica. Todo módulo
nuevo debe seguir esas convenciones salvo desviación deliberada y documentada.

## Skill de diseño

`.claude/skills/ui-ux-pro-max` (y las skills hermanas `design-system`,
`ui-styling`, etc.) están instaladas para consultas puntuales de estilos,
paletas o patrones — pero para ESTE proyecto, `design-system/conciliation/MASTER.md`
manda sobre cualquier sugerencia genérica de la skill.

## Regla: actualizar documentos (docs/)

Cada vez que se **actualice un documento** de `docs/` (PDF, Excel, etc.):

1. **Respaldo primero.** Copiar la versión vigente a una carpeta de respaldo,
   agregando la versión al nombre (`<nombre>_v<versión>.<ext>`, p. ej.
   `analisis-front-vs-back-dev_v2.0.pdf`). La carpeta por defecto es
   **`docs/avances/`**, salvo que quien pide el cambio indique otra (p. ej.
   `docs/implementaciones/`). Nunca sobrescribir un respaldo existente.
2. **Nueva versión después.** Hacer los cambios y publicar la **nueva versión**
   (versión mayor +1 si cambia el contenido de fondo, menor si es una
   corrección) en la raíz de **`docs/`**, con la nueva versión en el nombre
   (`<nombre>_v<nueva>.<ext>`). En la raíz queda solo la última versión: la
   anterior ya vive en la carpeta de respaldo.
3. **Fuente y control de versiones.** Si el documento se genera desde un
   fuente (`docs/fuentes/*.html` → `docs/fuentes/generar-pdf.ps1`), subir
   `<meta name="doc-version">`, la portada y el "Historial de versiones" del
   fuente, y regenerar con `-Output docs/<nombre>_v<nueva>.pdf`.
4. **No tocar** los documentos que vienen del backend (p. ej. la guía de
   endpoints del equipo de back): se respaldan como están, no se editan.

## Regla: títulos de pantalla (`nz-page-header`)

Todo título de pantalla va en **`nz-page-header`** (no `<h1>` propios ni título en el header
global). Una pantalla **hija** lleva flecha de volver + título y un
`nz-breadcrumb nz-page-header-breadcrumb` con el recorrido hasta ella. Detalle y ejemplos en
`design-system/conciliation/MASTER.md`, "Patrón: encabezado de página".

## Regla: botones "icono + label"

Todo botón nuevo (`nz-button`) lleva **icono (SVG en línea) + label** y se alinea con
`display: inline-flex; align-items: center; gap: 6px;`. La regla ya vive global sobre
`.ant-btn` en `src/styles.scss` — no repetirla en el `.scss` de cada pantalla. Detalle en
`design-system/conciliation/MASTER.md`, "Patrón: botones" (punto 5).

## Regla: tablas

Toda tabla nueva va en `<nz-card class="table-card" [nzBodyStyle]="{ padding: '24px' }">` —
**nunca pegada a la card** — y sigue la tabla de "Roles y permisos" como referencia:
`nzSize="middle"`, celda principal título + subtítulo, listas en columna (dos columnas si
crecen), indicadores en su propia celda centrada como `.chip` de solo lectura. Detalle en
`design-system/conciliation/MASTER.md`, "Regla general: tablas".
