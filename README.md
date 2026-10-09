# Conciliation

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Datos locales (sin backend)

Esta rama trabaja **solo con data local**: no hace peticiones HTTP. El login, la administración de usuarios,
roles/permisos y la bitácora usan un backend simulado en memoria (`src/app/features/auth/data/auth-mock-backend.ts`)
con el mismo contrato que el auth-service real. Cuentas de demo: ver la pantalla de login.

## País (México / Colombia)

El país se fija al compilar (`src/environments/environment.ts` = México; `environment.co.ts` = Colombia, vía la
configuración `co` de `angular.json`). Define impuestos, vocabulario fiscal (SAT/DIAN, RFC/NIT…), moneda y
formato de números.

```bash
pnpm start:co
```

```bash
pnpm build:co
```

## Despliegue en Vercel

Sitio estático (SPA): `vercel.json` ya reescribe todas las rutas a `index.html`. No requiere variables de entorno
(no hay `API_URL` ni CORS en esta rama). Un proyecto de Vercel por país:

| Ajuste del proyecto | México | Colombia |
| --- | --- | --- |
| Framework Preset | Angular (u "Other") | Angular (u "Other") |
| Install Command | `pnpm install` | `pnpm install` |
| Build Command | `pnpm run build` | `pnpm run build:co` |
| Output Directory | `dist/conciliation/browser` | `dist/conciliation/browser` |
| Production Branch | `feature/ded-pantallas-faltantes` (o `main`) | igual |

Con la CLI (`npm i -g vercel`, `vercel login`), desde la raíz del repo: `vercel link` (crear p. ej. el proyecto
`conciliation-co`), ajustar el Build Command anterior en *Settings → Build & Deployment* y `vercel --prod`.

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
