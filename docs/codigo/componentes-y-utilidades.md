# Componentes y utilidades compartidas (gráficas, avatar y fechas)

Porqué de los componentes de gráfica de `shared/components` y de las utilidades puras de
`shared/utils` que no pertenecen a un área de negocio. Los tags de estado se documentan en su área
([`ventas.md`](ventas.md#estado-de-conciliacion-de-venta) y
[`conciliacion.md`](conciliacion.md#cruce-de-transacciones)). El catálogo visual está en
[MASTER.md](../../design-system/conciliation/MASTER.md), "Componentes reutilizables". Convención:
[README](README.md).

<a id="sparkline"></a>
## `Sparkline`

Gráfica de área (línea delgada + degradado bajo la curva) que llena su contenedor: el tamaño lo
decide el CSS del padre (p. ej. `.kpi-card__sparkline`). El `viewBox` es fijo (100 × 32) con
`preserveAspectRatio="none"`, así la curva se estira al ancho y alto disponibles. El polígono del
área se cierra hasta el borde inferior real para que el relleno quede anclado al piso.

Cada instancia genera un id de degradado único (`sparkline-fill-N`): el relleno se referencia con
`url(#id)` y dos instancias con el mismo id en la página compartirían el degradado de la primera.
Si todos los valores son iguales, la escala vertical usa un rango de 1 para no dividir entre cero.

Código: `src/app/shared/components/sparkline/sparkline.ts`.

<a id="radial-progress"></a>
## `RadialProgress`

Anillo de progreso que llena su contenedor. El `viewBox` es fijo (36 × 36) con
`preserveAspectRatio="xMidYMid meet"`, así el anillo sigue circular aunque la caja no sea cuadrada.
El avance se dibuja con `stroke-dasharray`/`stroke-dashoffset` sobre la circunferencia, rotado -90°
para empezar arriba; el porcentaje se acota a 0-100 antes de calcular el offset (el texto muestra el
valor recibido). Pista en `--color-muted`; color por defecto `--color-primary`.

Código: `src/app/shared/components/radial-progress/radial-progress.ts`.

<a id="avatar-color"></a>
## Color del avatar de iniciales

`avatarTokensFor` rota entre las tres parejas marca/on-marca (`primary`, `secondary`, `accent`) según
un hash estable del id, así cada usuario conserva su color entre renders sin guardarlo en el modelo
y el avatar sigue la paleta activa (nunca un hex propio). Los consumidores lo aplican con
`[ngStyle]` por instancia; por eso no hay puente global de `.ant-avatar` (MASTER.md, "Puente
ng-zorro-antd ↔ tokens"). El Header usa el `username` como id porque la sesión no trae el id del
registro de usuarios.

`initialsFor` toma la primera letra del primer y del último token del nombre, dos letras si hay un
solo token y `'?'` si está vacío.

Código: `src/app/shared/utils/avatar-color.util.ts`.

<a id="fechas-iso"></a>
## Fechas de calendario en hora local

MASTER.md: "Actualización: fechas de calendario en hora local + pila DEV v2 con catálogos
sembrados". Estas funciones cruzan la frontera entre `nz-date-picker` (`Date | null`) y el modelo,
que guarda fechas de calendario sin hora como `'yyyy-MM-dd'` (`birthDate`, `hireDate`,
`contractEndDate`).

Se trabaja siempre en hora local: `new Date('2025-01-10')` se interpreta como medianoche UTC, que en
México y Colombia (UTC-5/-6) cae en el día anterior, y `toISOString()` sobre la medianoche local que
entrega el selector también puede cambiar de día. Por eso `parseIsoDate` construye la fecha con
`new Date(año, mes, día)` y `toIsoDate` formatea con `getFullYear`/`getMonth`/`getDate`.
`toIsoDateOrNull` es para campos opcionales (p. ej. fin de contrato indefinido).

Código: `src/app/shared/utils/iso-date.util.ts`.
