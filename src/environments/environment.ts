import { CountryCode } from '../app/core/country/country.model';
import { API_URL } from './api-url';

// Variables de entorno del frontend.
//
// `apiUrl` — origen del Gateway del backend ("coctel_midd", rama DEV; ver `api-url.ts`).
// Vacío en desarrollo a propósito: las llamadas de AuthService van a rutas relativas
// (`/auth/...`, `/users/...`), que `ng serve` reenvía al Gateway (puerto 8080 por defecto,
// configurable con GATEWAY_URL) vía `proxy.conf.js` — mismo origen para el navegador, sin
// depender del CORS del Gateway. En producción (Vercel) es la URL absoluta del Gateway, que
// `scripts/set-api-url.mjs` escribe desde la variable API_URL antes de compilar; ese dominio
// debe estar en CORS_ALLOWED_ORIGINS del Gateway.
//
// `country` — país en el que trabaja la aplicación. Define los campos de
// impuestos, el vocabulario fiscal (SAT / DIAN, CFDI / factura electrónica,
// RFC / NIT…), el vocabulario general, la moneda y el formato de números.
// Se lee y se valida una sola vez al arrancar la app (ver
// `core/country/active-country.ts`). Valores soportados: 'MX' | 'CO'.
// Este archivo es el de México (default). Para Colombia, la configuración de
// build `co` lo reemplaza por `environment.co.ts` (ver angular.json):
//   pnpm start:co   /   pnpm build:co
export const environment: { apiUrl: string; country: CountryCode } = {
  apiUrl: API_URL,
  country: 'MX',
};
