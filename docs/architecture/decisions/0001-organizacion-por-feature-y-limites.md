# ADR-0001: Organización por feature y límites entre `core`, `shared` y `features`

- **Estado:** Aceptada — puntos 1 a 5 implementados (2026-10-15, rama `feature/agents`)
- **Fecha:** 2026-10-15

## Contexto

El código ya está organizado en `core/`, `shared/` y `features/<feature>/{data,<pantalla>}`, y
MASTER.md fija una regla dura: `shared` no depende de `features`. Lo observado (2026-10-15):

- `core/` importa de `features/auth/data` (interceptores, header, menú, `CatalogService`,
  `OrganizationCatalogService`) y de `features/user-management/data` (modelos y
  `AccessCatalogService` en el header).
- `auth` y `user-management` se importan mutuamente: `AccessControlService` →
  `UserManagementService` → `AuthService`; y `AuthService` es además el cliente HTTP de usuarios,
  roles, permisos y auditoría.
- `profile`, `roles-permissions`, `sales-dashboard`, `reconciliation-dashboard` y
  `difference-management` importan `features/auth/data/*`; `profile` y `roles-permissions`
  importan `user-management/data/*`.
- `shared/mock-data/sales-settlements.mock-data.ts` importa de `features/sales-dashboard` (excepción
  deliberada documentada en MASTER).

La sesión y el control de acceso son, en la práctica, plataforma: los usa casi todo.

## Decisión

1. Se mantiene la organización por feature (no por tipo técnico ni por capas formales).
2. Reglas de dependencia: `features → (core, shared)`, `core → shared`, `shared → nada de la app`.
   Entre features, solo se permite importar la **API de plataforma** de sesión/acceso.
3. **Objetivo:** mover sesión, guards y control de acceso a `core/auth/` (`auth.service.ts`,
   `access-control.service.ts`, `auth-errors.ts`, `*.guard.ts`), y dejar en `features/auth/` solo
   las pantallas (login, cambio de contraseña). Los tipos transversales (`PermissionKey`, `RoleId`)
   pasan a `shared/models/` o `core/auth/`.
4. Los clientes HTTP de `/users`, `/roles`, `/permissions` y `/audit-log` salen de `AuthService` a
   api-services propios (en `user-management/data` y `roles-permissions/data`, o `shared` si los
   consumen varias features).
5. `AccessControlService` deja de depender de `UserManagementService`: la sesión se resuelve solo
   con datos del backend (`AuthUser`), lo que rompe el ciclo.
6. Mientras no se haga el movimiento, `features/auth/data/{auth.service,access-control.service,
   auth-errors,*.guard}.ts` cuenta como API de plataforma y es la única excepción permitida.

## Implementación (2026-10-15)

1. Se mantiene la organización por feature.
2. `grep -rn "features/" src/app/core src/app/shared` solo devuelve comentarios y la excepción del
   mock en `shared/mock-data` (ver Consecuencias).
3. Movidos a `core/auth/`: `auth.service.ts`, `access-control.service.ts`, `auth-errors.ts`,
   `auth.guard.ts`, `must-change-password.guard.ts`, `permission.guard.ts` (con sus specs) y
   `access-catalog.service.ts` (el header de `core` lo necesita). `features/auth/` conserva solo
   `login/` y `change-password/`. `RoleId`, `PermissionKey`, `RoleDef` y `PermissionDef` pasan a
   `shared/models/access.model.ts` (`user-management.model.ts` los re-exporta).
4. `AuthService` queda solo con sesión (`/auth/**`). Clientes nuevos:
   `features/user-management/data/users-api.service.ts` (`/users/**`),
   `features/user-management/data/audit-log.service.ts` (`/audit-log`, `/users/{id}/audit-log`),
   `features/user-management/data/roles-api.service.ts` (CRUD de `/roles`) y
   `core/auth/access-catalog.service.ts` (`GET /roles`, `GET /permissions`, compartidos).
5. `AuthUser.appUserId` se eliminó y `completeLogin(result)` ya no recibe el vínculo al mock.
   `AccessControlService` no inyecta `UserManagementService`; `mustChangePassword` sale solo de
   `AuthUser.mustChangePasswordHint`. El `AppUser` de la sesión lo resuelve
   `UserManagementService.currentAppUser` (por email); el header usa solo `AuthUser` (nombre e
   iniciales; sin foto del mock).
6. La excepción ya no es necesaria.

Seguimiento (mismo día): `profile` y `roles-permissions` importaban `UserManagementService`/`AppUser`
de `user-management` (perfil editable y personas por rol sobre el registro mock). Como ese estado
depende de `core/auth` no puede subir a `shared/`, así que ambas pantallas se integraron al feature
`user-management` (`profile/`, `roles-permissions/`, `roles-permissions/role-create/`, y
`roles-api.service.ts` + `role-code.util.ts` en `data/`). Rutas y UI no cambian. Desde entonces no
hay imports entre features distintas.

## Alternativas consideradas

- **Dejar todo como está:** cero costo, pero mantiene el ciclo y la dependencia invertida
  `core → features`, que hace más difícil probar y razonar sobre la sesión.
- **Capas formales (domain/application/infrastructure) por feature:** demasiada ceremonia para ~20
  pantallas con un único backend; no resuelve el problema real (ubicación de la sesión).
- **Librería por feature (Nx, `projects/`):** sobredimensionado para una sola app y un solo equipo.

## Consecuencias

- Mover archivos cambia imports en ~21 archivos (los que hoy importan `auth/data` o
  `user-management/data` desde fuera de esas carpetas, sin contar specs); es mecánico pero toca piezas críticas: hacerlo
  después de tener E2E de login/permisos (hoja de ruta, paso 6).
- Las reglas se vuelven verificables con una regla de lint de límites (paso 4).
- La excepción del mock en `shared/` desaparece al conectar `/reconciliation`.

## Cómo verificar

- Búsqueda: ningún `import` desde `core/` o `shared/` hacia `features/`
  (`grep -rn "features/" src/app/core src/app/shared`).
- `pnpm build` y `pnpm test:ci` en verde; E2E de login, cambio de contraseña y acceso por permiso.
