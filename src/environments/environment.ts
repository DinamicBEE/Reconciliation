import { CountryCode } from '../app/core/country/country.model';

// Variables de entorno del frontend.
//
// `apiUrl` — vacío a propósito: las llamadas de AuthService van a rutas relativas
// (`/auth/...`), que `ng serve` reenvía al gateway del backend real
// ("coctel_midd", rama feature/login al momento de escribir esto — antes
// "coctel-del-mar"; ver MASTER.md, "Actualización: login apuntado al
// backend real") vía `proxy.conf.json` — puerto 8082 en este entorno local,
// remapeado desde el 8080 por defecto de ese repo porque ya lo ocupa otro
// proyecto en esta máquina (ver el `docker run` manual del gateway, no un
// cambio al `docker-compose.yml` del backend). Mismo origen para el
// navegador, sin depender de que ese backend tenga CORS configurado (no lo
// tiene hoy). En producción, `apiUrl` pasaría a ser el origen real del
// gateway (o se sigue sirviendo tras un reverse proxy en el mismo origen,
// mismo criterio).
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
  apiUrl: '',
  country: 'MX',
};
