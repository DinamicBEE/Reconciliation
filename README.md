# Conciliation

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Backend local (Gateway DEV)

El portal habla con el Gateway del backend (`coctel_midd`, rama `DEV`). `ng serve` reenvía `/auth`, `/users`,
`/roles`, `/permissions`, `/audit-log` y `/sales` a `http://localhost:8080` (`proxy.conf.js`; si ese puerto está
ocupado, pon `GATEWAY_PORT=8082` en `dev-env/.env` —lo usan el script del backend, `ng serve` y las pruebas— o define `GATEWAY_URL`).

Para levantar la pila (sin tocar el repo del backend) y sembrar las 26 cuentas demo:

```bash
powershell -ExecutionPolicy Bypass -File dev-env/levantar-backend.ps1
```

Detalle en `dev-env/` (`.env.example`, `seed-demo-users.sql`). Cuentas de desarrollo: ver la pantalla de login.

## Despliegue en Vercel

En Vercel el portal y el Gateway son orígenes distintos, así que el portal necesita la URL **absoluta** del
Gateway y el Gateway debe autorizar el dominio del portal por CORS:

1. Variable de entorno del proyecto en Vercel: `API_URL=https://<gateway>` (sin `/` final).
2. Build Command: `node scripts/set-api-url.mjs && pnpm build` (Colombia: `... && pnpm build:co`).
3. En el Gateway: `CORS_ALLOWED_ORIGINS=https://<tu-proyecto>.vercel.app` (solo el dominio del portal).

Sin `API_URL` el portal queda con rutas relativas y las llamadas a `/auth/...` caerían en el rewrite a `index.html`
de `vercel.json`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
