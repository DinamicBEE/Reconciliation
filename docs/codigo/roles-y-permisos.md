# Roles y permisos

Porqué de los códigos de rol y permiso, del cliente del CRUD de roles y de las pantallas "Roles y
permisos" y "Nuevo rol". Los permisos efectivos del usuario en sesión están en
[`sesion-y-acceso.md#permisos-efectivos`](sesion-y-acceso.md#permisos-efectivos). Lo visual está
en [MASTER.md](../../design-system/conciliation/MASTER.md), "Patrón: \"Roles y permisos\"" y
"Patrón: creación de roles". La matriz oficial está en `docs/Matriz_Roles_Permisos_Frontend.xlsx`.
Convención: [README](README.md).

<a id="codigos-de-rol-y-permiso"></a>
## Códigos de rol y permiso

- `RoleId` y `PermissionKey` son los códigos tal como los siembra el backend (`app_role.code` en
  `V1__init_schema.sql` de coctel-del-mar/coctel_midd; `UserSummaryDto.roles` en `/auth/login`).
  El backend es la fuente de qué roles existen, sus nombres y sus permisos por defecto
  (`GET /roles`, `GET /permissions`, vía `AccessCatalogService`, ver
  [`sesion-y-acceso.md#catalogos-de-acceso`](sesion-y-acceso.md#catalogos-de-acceso)).
- `RoleId` solo nombra los códigos que el front compara en código (p. ej. `MANAGER_ROLE_IDS`); no
  hay lista de roles propia del front. El acceso a cada pantalla lo decide el permiso
  (`permissionGuard` y `data` de las rutas en `app.routes.ts`), no el rol.
- Mapeo de DTOs: `GET /permissions` → `PermissionDef` (`code` → `key`, `description` → `label`,
  `module` → `group`, título del bloque en el grid de "Seguridad y acceso"); `GET /roles` →
  `RoleDef` (`code` → `id`, `name` → `label`).
- `RoleDef.defaultPermissions` es lo que recibe una persona al asignarle el rol; el admin puede
  ajustarlo después por usuario. Cambiar los roles asignados reinicia los permisos a la unión de
  los sets por defecto (`AccessCatalogService.defaultPermissionsForRoles`).
- Los tipos viven en `shared/models` porque los usan la sesión, el layout y varias features
  (ADR-0001, punto 3).

Código: `src/app/shared/models/access.model.ts`.

<a id="crud-de-roles"></a>
## Cliente del CRUD de roles (`/roles`)

Todos los endpoints exigen `manage_roles`. Los catálogos de lectura (`GET /roles`,
`GET /permissions`) no van aquí sino en `AccessCatalogService`, porque los consumen el layout y
varias features (ADR-0001, punto 4).

| Endpoint | Respuesta | Errores con significado propio |
|---|---|---|
| `POST /roles` | 201 con el rol creado | 409 `ROLE_ALREADY_EXISTS` |
| `GET /roles/{code}` | El rol | 404 `ROLE_NOT_FOUND` (no existe o está dado de baja) |
| `PATCH /roles/{code}` | El rol actualizado | — |
| `DELETE /roles/{code}` | 204, baja lógica | 409 `ROLE_IN_USE` si alguna persona habilitada lo tiene |

- `POST`: el backend deriva el `code` del nombre ("Contabilidad Sur" → `CONTABILIDAD_SUR`) y no lo
  cambia después; `permissions` puede ir vacío.
- `PATCH`: un campo `undefined` no se modifica. `permissions` reemplaza la lista del rol y el
  cambio se propaga a las personas que lo tienen: lo agregado se suma y lo quitado se quita, salvo
  que otro rol de la persona lo otorgue o sea un permiso especial suyo.
- Los avisos de error los da `httpErrorAlertInterceptor`; los componentes solo capturan para no
  romper el flujo.

Código: `src/app/features/user-management/data/roles-api.service.ts`.

<a id="codigo-de-rol"></a>
## Generación del código de rol

`toRoleCode` replica `RoleAdminService.toCode` del backend (auth-service): quita acentos, pasa a
mayúsculas, sustituye todo lo no alfanumérico por `_`, recorta a 40 caracteres y devuelve `ROL` si
no queda nada. Sirve para mostrar el código que tendrá el rol antes de enviarlo. Es orientativo:
si el código ya está ocupado, el backend le agrega `_2`, `_3`…, y el definitivo llega en la
respuesta de `POST /roles`.

Código: `src/app/features/user-management/data/role-code.util.ts`.

<a id="pantalla-roles-y-permisos"></a>
## Pantalla "Roles y permisos"

- Un rol por fila (`GET /roles` vía `AccessCatalogService`) con sus permisos por defecto (descripción
  de `GET /permissions`) y las personas que lo tienen. Las personas salen de
  `UserManagementService.allUsers`, la misma colección de "Administración de usuarios"; al entrar
  se sincroniza con `GET /users` para ver roles y altas hechos fuera de la sesión.
- Exclusiva del rol ADMIN (`permissionGuard` con `data.role`).
- Desde aquí se crea un rol, se abre su edición (`/gestion-de-roles/:code`) y se da de baja
  (`DELETE /roles/{code}`, con confirmación). La baja se deshabilita mientras el rol tenga usuarios,
  porque el backend respondería 409 `ROLE_IN_USE`. El tooltip va en un `<span>` envolvente porque un
  botón `disabled` no dispara hover.

Código: `src/app/features/user-management/roles-permissions/roles-permissions.*`.

<a id="alta-y-edicion-de-rol"></a>
## Alta y edición de un rol

- Nombre + permisos agrupados por módulo (`GET /permissions`); nunca una lista propia del front.
  Exclusiva de ADMIN.
- **Alta** (`/gestion-de-roles/nuevo` → `POST /roles`): el nombre se valida como el backend
  (`existsByNameIgnoreCaseAndEnabledTrue`): no puede repetir el de otro rol activo, sin espacios
  sobrantes ni distinción de mayúsculas; los acentos sí cuentan. Los roles dados de baja no
  reservan su nombre (`GET /roles` solo trae activos). Límite de 80 caracteres, igual que
  `@Size(max = 80)` del backend.
- **Edición** (`/gestion-de-roles/:code`): precarga con `GET /roles/{code}` (`rxResource`,
  ADR-0002 punto 3), guarda con `PATCH /roles/{code}` solo lo que cambió y da de baja con
  `DELETE /roles/{code}` (deshabilitada mientras alguien tenga el rol). El único `effect`
  sincroniza el `FormControl` del nombre con el rol cargado (ADR-0002, punto 6).
- Editar los permisos se propaga a quienes tienen el rol (lo explica el modal de confirmación).
  Tras guardar se recargan el catálogo y la lista de usuarios y, si la sesión propia tiene el
  rol, se renueva la sesión para que los permisos se vean de inmediato.
- `nzOnOk` devuelve una Promise: el botón queda en carga hasta que responde el backend; si falla,
  el modal se cierra y el aviso lo da el interceptor.

Código: `src/app/features/user-management/roles-permissions/role-create/**`.
