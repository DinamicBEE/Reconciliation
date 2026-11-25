# Administración de usuarios: pantallas

Porqué de las pantallas de lista, detalle, perfil propio e historial. El modelo, el servicio y la
API se documentan en [`usuarios.md`](usuarios.md) (aquí se enlazan, no se repiten). El layout de
tabs, secciones y modo edición está en [MASTER.md](../../design-system/conciliation/MASTER.md),
"Patrón: tab con card general + secciones + modo edición (`user-detail`)". Los formularios siguen
[ADR-0003](../architecture/decisions/0003-formularios.md) y los efectos,
[ADR-0002](../architecture/decisions/0002-estado-signals-en-servicios.md). Convención: [README](README.md).

<a id="lista-de-usuarios"></a>
## Lista de usuarios

- **Sincronización.** Al entrar se llama `UserManagementService.syncFromBackend()` (`GET /users`),
  best-effort: si falla, la lista se queda con lo que ya tenía (ver
  [`usuarios.md#sincronizacion-con-backend`](usuarios.md#sincronizacion-con-backend)).
- **Rol en la fila.** El selector sin bordes cambia el rol al instante, sin confirmación, y manda
  `PATCH /users/{id}/roles` con los permisos por defecto de los nuevos roles: la regla de reinicio
  la aplica el front y el backend guarda el resultado. Exige `manage_roles` (sin él, 403
  `ROLE_ASSIGNMENT_FORBIDDEN`; `canChangeRoles` deshabilita el selector). Si falla, `user.roleIds`
  no cambió y el selector vuelve a mostrar los roles guardados. Se exige al menos un rol.
- **Estado, reset y baja.** Mismos contratos y confirmaciones que el detalle
  ([#detalle-seguridad-y-acceso](#detalle-seguridad-y-acceso)). `isSelf` deshabilita la baja de la
  propia cuenta (409 `CANNOT_DELETE_SELF`).
- **Errores.** Como en el detalle ([#detalle-errores](#detalle-errores)): el componente solo avisa la
  caída de red y los errores locales del servicio.

Código: `src/app/features/user-management/user-list/**`.

<a id="detalle-carga"></a>
## Detalle: carga del usuario y detalle del backend

La pantalla atiende `/usuarios/:userId`; el alta no es una ruta sino un modal
([#alta-de-usuario](#alta-de-usuario)). `notFound()` indica un id inexistente o eliminado.

- **Detalle del backend.** `GET /users/{id}` se pide con `rxResource` keyed en el
  `backendUserId` de la cuenta, no en `user()`: `user()` se arma a partir de ese detalle y
  depender de él crearía un ciclo (ADR-0002, punto 3). Sin `backendUserId`, o si la petición falla,
  `user()` usa solo el registro local.
- **Fusión.** `mergeBackendDetail` superpone el `UserDetailDto` al registro local: gana todo lo
  que el backend modela (roles, permisos, estado, organización, teléfono, dirección, contraseña
  temporal); avatar, 2FA, última actividad y el id local `uXXXX` quedan del registro local.
  `manager.id` es un id del backend y se traduce al id local con
  `UserManagementService.findByBackendUserId` (`null` si no hay puente).
- **Cambio de cuenta.** Tras navegar, el detalle cargado puede seguir siendo de la cuenta anterior;
  si `detail.id !== base.backendUserId` no se fusiona.
- **Nombres de organización.** `orgNames` toma el nombre del catálogo y, si el id no está (catálogo
  cargando o elemento dado de baja, porque el catálogo solo trae habilitados), el que trae el
  detalle. `orgOptions` añade a las opciones lo asignado que falta en el catálogo completo (no en
  la lista filtrada) para que el select muestre el nombre y no el id.

Código: `src/app/features/user-management/user-detail/user-detail.ts`.

<a id="detalle-formularios"></a>
## Detalle: formularios y sincronización con el usuario mostrado

- **Mezcla de APIs.** Nombre, correo y teléfono tienen validación (requerido, formato) y van en
  Reactive Forms (`infoForm`); roles, permisos y estado son controles sin reglas propias y usan
  `ngModel` ([ADR-0003](../architecture/decisions/0003-formularios.md)). Fecha de nacimiento, SSN,
  género y dirección son datos de referencia sin validadores y no se piden al crear.
- **`orgForm`.** "Organización" se edita solo en un usuario existente y es enteramente opcional.
- **Ubicaciones por subsidiaria.** Se ofrecen solo las de las subsidiarias elegidas (todas si no hay
  ninguna); al quitar una subsidiaria se podan sus ubicaciones, solo por acción del usuario y nunca
  al precargar el detalle.
- **Sincronización.** Un único `effect` (ADR-0002, punto 6) reinicia `infoForm` y `orgForm` desde
  `user()`. Lee `user()` con tracking a propósito: así el formulario se actualiza cuando llega el
  detalle del backend para la misma cuenta; sin ese segundo disparo se quedaría con los datos
  incompletos del registro local. Reaccionar a un guardado propio es inofensivo (mismos valores).
- **Estado por visita.** `resetOnAccountChange` lee `userId()` para que los `linkedSignal`
  (`isEditing`) vuelva a su valor inicial al cambiar de cuenta. Los borradores
  de roles y permisos son `linkedSignal` de `user()`.

Código: `user-detail.ts` (`infoForm`, `orgForm`, el `effect` de sincronización).

<a id="alta-de-usuario"></a>
## Alta de usuario (modal)

"Nuevo usuario" en la lista abre `UserCreateModal` (`[(open)]` sobre `createModalOpen` de `UserList`):
formulario a la izquierda y card de presentación a la derecha, como el modal "Nueva conciliación".

- **Formulario.** Un `FormGroup` tipado (`form`). `Validators.required` sobre `roleIds` exige al menos
  un rol. Subsidiarias y ubicaciones sí se piden al crear y admiten varias
  (`CreateUserRequest.subsidiariaIds`/`ubicacionIds`, N:M). `managerId` es un solo responsable;
  `null` significa sin asignar y se envía como `supervisorId`
  (ver [`usuarios.md#alta-de-usuario`](usuarios.md#alta-de-usuario)). La app es zoneless: las
  lecturas de plantilla usan `toSignal` porque `control.value` no dispara detección de cambios.
- **Ubicaciones por subsidiaria.** Igual que en el detalle: solo las de las subsidiarias elegidas, y
  quitar una subsidiaria poda sus ubicaciones.
- **Envío.** Rechaza un correo ya presente en la lista; con `POST /users` en vuelo el botón y el cierre
  quedan deshabilitados. Si falla, el interceptor avisa y el modal queda abierto con lo escrito. Si
  funciona, cierra el modal y navega a `/usuarios/:id`, donde se ve la contraseña temporal.
- **Apertura y cierre.** Un `effect` pide los combos al abrir (`ensureLoaded`) y reinicia el formulario al
  cerrar.

Código: `src/app/features/user-management/user-create-modal/**`.

<a id="detalle-edicion-y-guardado"></a>
## Detalle: modo edición y guardado único de "Información general"

"Información general" (datos personales y organización) es de solo lectura hasta pulsar "Editar",
que activa ambas sub-cards a la vez; `isEditing` solo cambia el nodo del valor, no el layout. Un solo
botón guarda las dos: `onSaveProfile` combina `infoForm` y `orgForm` en una llamada a
`UserManagementService.updateUserProfile` (`PATCH /users/{id}`); basta validar `infoForm`, porque
`orgForm` no tiene validadores. "Cancelar" reinicia ambos formularios a lo guardado para no dejar
valores a medio escribir. "Seguridad y acceso" no participa: tiene su propio guardado de roles y
permisos. La barra de guardado es hermana de `.tab-card__sections` para no heredar su padding.

Código: `user-detail.ts`, `user-detail.html`, `user-detail.scss`.

<a id="detalle-seguridad-y-acceso"></a>
## Detalle: seguridad y acceso (estado, desbloqueo, correo, contraseña temporal)

- **Roles y permisos.** `PATCH /users/{id}/roles` completo exige `manage_roles`: probado en DEV, con
  solo `manage_users` incluso un cambio solo de permisos responde 403 `ROLE_ASSIGNMENT_FORBIDDEN`.
  Sin el permiso la sección es de solo lectura (`canEditAccess`). Cambiar los roles reinicia el
  borrador de permisos a la unión de los defaults de esos roles. Se envía solo lo que cambió; la
  respuesta es autoritativa y el borrador se alinea con ella. Si falla, vuelve a lo guardado.
- **Estado.** `StatusChip` emite la intención y la pantalla confirma; `PATCH /users/{id}/status`.
  En todas las confirmaciones `nzOnOk` devuelve una `Promise`, así el modal gira hasta la respuesta.
- **Correo.** `POST /users/{id}/verify-email` sin confirmación: es de bajo riesgo y el botón solo se
  ve mientras el correo no está verificado.
- **Sesiones.** `POST /users/{id}/close-sessions`: la persona puede volver a entrar y el access token
  ya emitido sigue vivo hasta 15 min.
- **Contraseña.** `POST /users/{id}/reset-password` genera una temporal, obliga a cambiarla al entrar
  y cierra todas las sesiones. La temporal se muestra en el toast y en "Organización" mientras siga
  pendiente; es de solo lectura (el front nunca la define) y se copia para entregarla por el medio
  acordado con el cliente (DED, CU3 paso 2).
- **Desbloqueo (CU3 paso 5).** `PATCH /users/{id}/unlock` también reinicia los intentos fallidos y
  `lockedUntil`. No hay endpoint para consultar el bloqueo, así que el botón está disponible para toda
  cuenta con `backendUserId`, no solo cuando se ve bloqueada. El 403 (falta `manage_users`) y el 404
  los avisa el interceptor.
- **Baja.** `DELETE /users/{id}` es lógica: la cuenta deja de entrar y sale de la lista, su historial
  se conserva y su correo queda libre. Nadie puede darse de baja a sí mismo (409
  `CANNOT_DELETE_SELF`, `isSelf`). Ver [`usuarios.md#acciones-administrativas`](usuarios.md#acciones-administrativas).

Código: `user-detail.ts`, `user-detail.html`.

<a id="detalle-errores"></a>
## Detalle: refresco tras mutaciones y avisos de error

- **Refresco.** Tras una mutación exitosa, `refreshBackendDetail` recarga `GET /users/{id}`: si no,
  `user()` seguiría fusionando el detalle viejo sobre el registro recién actualizado y pisaría lo
  guardado. Es best-effort: si falla, se queda el detalle anterior. También vuelve a la primera
  página del historial, porque el backend registra cada acción en su bitácora.
- **Avisos.** Todo error con respuesta del backend (códigos de negocio y el 403 sin código) lo avisa
  `httpErrorAlertInterceptor`. `showMutationError` solo cubre la caída de red (status 0) y los
  errores locales del servicio (p. ej. usuario sin `backendUserId`). En el alta (409
  `EMAIL_ALREADY_REGISTERED`, 400 `INVALID_ROLE`/`INVALID_USER_STATUS`, 403
  `ROLE_ASSIGNMENT_FORBIDDEN`) el componente solo reactiva el formulario para corregir y reintentar.

Código: `user-detail.ts` (`refreshBackendDetail`, `showMutationError`).

<a id="perfil-propio"></a>
## Perfil propio

`/perfil` muestra el mismo `AppUser` que el detalle, resuelto por el correo de la sesión
(`UserManagementService.currentAppUser`); la pantalla no guarda datos propios. "Información general"
y "Dirección" comparten un único `infoForm` y un único "Guardar cambios", con la misma edición
inline que el detalle. Guarda con `updateInfo`, no con `updateUserProfile`: la persona edita solo
su información personal, nunca su organización.

- **Sesión.** `sessionEmail` es un `computed`: cambia con la persona, no con cada refresh de token
  (que reemplaza el objeto `AuthUser`). `isEditing` es un `linkedSignal` que se reinicia al
  cambiar la persona.
- **Sincronización.** Un único `effect` reinicia el formulario al cambiar la persona; lee el servicio
  con `untracked` para no dispararse con cualquier cambio del registro de usuarios.

Código: `src/app/features/user-management/profile/**`.

<a id="historial-y-auditoria"></a>
## Historial y auditoría

- **Pantalla global.** `GET /audit-log` (`AuditLogService`): búsqueda, filtro de acción y paginación
  son del servidor. La ruta exige `view_audit_log` (`permissionGuard`). Cada cambio de filtro o
  página es una petición; `switchMap` descarta respuestas viejas y `debounceTime` evita una
  petición por tecla. La página es 1-based en la tabla y 0-based en el backend.
- **Pestaña del detalle.** `GET /users/{id}/audit-log`, paginada en el servidor. Sin
  `view_audit_log` la pestaña se deshabilita y no se pide (daría 403); sin `backendUserId` tampoco.
  Funciona aunque la cuenta esté dada de baja. `rxResource` cancela la consulta anterior al cambiar
  de página o al recargar tras una mutación; la página vuelve a 1 al cambiar de cuenta.
- **Errores.** Los avisa `httpErrorAlertInterceptor` (403, 404, 5xx).

Ver [`usuarios.md#bitacora`](usuarios.md#bitacora). Código:
`src/app/features/user-management/user-audit/**`, `user-detail.ts` (`auditResource`).
