# ADR-0004: Modelo de sesión y almacenamiento de tokens

- **Estado:** Propuesta
- **Fecha:** 2026-10-16

## Contexto

- El login devuelve access token + refresh token de un solo uso. `AuthService` guarda la sesión
  completa (incluido el refresh token) en `sessionStorage` (`core/auth/auth.service.ts:185,339,373`)
  para sobrevivir a F5, y expone `accessToken` como `computed`. El refresh y el logout envían el
  refresh token en el body, que es el contrato actual del Gateway.
- Cualquier XSS puede leer `sessionStorage` y llevarse el refresh token, que da una sesión más
  larga que la del access token. No hay CSP ni otras cabeceras de seguridad en el despliegue
  (`vercel.json` solo tiene el rewrite), y `src/index.html:10-15` carga fuentes de
  `fonts.googleapis.com`/`fonts.gstatic.com`.
- Es una SPA estática en Vercel; el Gateway es otro origen en producción (`apiUrl` absoluto que
  escribe `scripts/set-api-url.mjs`) y el mismo origen en desarrollo (proxy).
- Que el refresh token pase a cookie `HttpOnly` depende del backend (decisión D3 de la guía).
- §14.3 de la guía pide ADR para "cambiar el modelo de sesión/tokens".

## Decisión

1. **Vigente (provisional):** access y refresh token en `sessionStorage` (nunca `localStorage` ni
   cookies legibles por JS), aceptado **solo** con estas mitigaciones: CSP en el despliegue
   (punto 4), Bearer limitado al origen del Gateway (R1/R2 de la guía), sin `[innerHTML]` ni
   `bypassSecurityTrust*` con datos externos, y sin registrar tokens en consola. `sessionStorage`
   solo se lee/escribe en `core/auth/auth.service.ts`.
2. **Objetivo (requiere backend):** refresh token en cookie `HttpOnly; Secure; SameSite` emitida por
   el Gateway con `Path` limitado a `/auth`; access token **solo en memoria** (signal de
   `AuthService`). Tras F5 la sesión se recupera con `POST /auth/refresh` usando `withCredentials`.
   Condiciones previas a acordar con backend: CORS con credenciales y origen explícito, portal y
   Gateway en el mismo sitio (subdominios) para no depender de `SameSite=None`, y protección CSRF
   en `/auth/refresh` y `/auth/logout`.
3. No se introduce un BFF mientras el punto 2 sea viable.
4. **CSP base** en `vercel.json` (contrastar con la guía oficial de seguridad de Angular antes de
   aplicarla): `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'
   https://fonts.googleapis.com` (Angular y ng-zorro inyectan `<style>` y un hosting estático no
   genera nonces por respuesta); `font-src 'self' https://fonts.gstatic.com`;
   `connect-src 'self' <origen del Gateway>`; `img-src 'self' data:`; `object-src 'none'`;
   `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. Más
   `Referrer-Policy: strict-origin-when-cross-origin` y `X-Content-Type-Options: nosniff`. El
   origen del Gateway en `connect-src` sale de la misma fuente que `API_URL`, para que no se
   desalineen. Una dependencia nueva que exija relajar la CSP necesita justificación en el PR.

## Alternativas consideradas

- **`localStorage`:** persiste entre pestañas y cierres; más exposición con el mismo riesgo de XSS.
- **Todo en memoria sin cookie:** elimina la lectura persistente, pero cada F5 obliga a iniciar
  sesión otra vez; inaceptable sin el punto 2.
- **Sesión completa por cookie (sin Bearer):** cambio mayor en el Gateway y CSRF en todas las rutas.
- **BFF (Vercel Functions u otro servidor):** tokens fuera del navegador, pero añade un componente
  de servidor a una SPA estática.
- **No poner CSP:** cero costo, pero deja sin mitigación el riesgo que acepta el punto 1.

## Consecuencias

- El punto 1 y la CSP se pueden aplicar ya; el punto 2 cambia `AuthService`, el interceptor y el
  arranque de sesión, y necesita E2E de login/F5/refresh antes de tocarse.
- `style-src 'unsafe-inline'` es una concesión conocida; `script-src` queda estricto.
- Las fuentes externas atan la CSP a Google; servirlas desde `public/` la simplifica (opcional).

## Cómo verificar

- `grep -rn "sessionStorage" src/app` solo en `core/auth/auth.service.ts`; ningún token en
  `localStorage`.
- Cabeceras presentes en el preview (`curl -I <url>`) y consola sin violaciones de CSP en login,
  dashboard, cambio de tema (`/ng-zorro/*.css`) y llamadas al Gateway.
- Spec del interceptor: una URL externa no recibe `Authorization`.
- (Punto 2) E2E: login → F5 → la sesión sigue → refresh rotado → logout invalida la cookie.
