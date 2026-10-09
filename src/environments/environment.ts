import { CountryCode } from '../app/core/country/country.model';

// Variables de entorno del frontend.
//
// `country`: país en el que trabaja la aplicación. Define los campos de
// impuestos, el vocabulario fiscal (SAT / DIAN, CFDI / factura electrónica,
// RFC / NIT…), el vocabulario general, la moneda y el formato de números.
// Se lee y se valida una sola vez al arrancar la app (ver
// `core/country/active-country.ts`). Valores soportados: 'MX' | 'CO'.
//
// Este archivo es el de México (default). Para Colombia, la configuración de
// build `co` lo reemplaza por `environment.co.ts` (ver angular.json):
//   pnpm start:co   /   pnpm build:co
export const environment: { country: CountryCode } = {
  country: 'MX',
};
