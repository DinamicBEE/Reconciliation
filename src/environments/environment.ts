import { CountryCode } from '../app/core/country/country.model';
import { API_URL } from './api-url';

/**
 * Entorno por defecto (México): origen del Gateway y país de trabajo.
 *
 * @remarks `country` se valida una vez al arrancar; Colombia usa `environment.co.ts` (`pnpm start:co`).
 * @see docs/codigo/configuracion-y-pais.md#entornos-y-api-url
 */
export const environment: { apiUrl: string; country: CountryCode } = {
  apiUrl: API_URL,
  country: 'MX',
};
