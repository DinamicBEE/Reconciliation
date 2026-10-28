import { CountryCode } from '../app/core/country/country.model';
import { API_URL } from './api-url';

/**
 * Entorno de Colombia; sustituye a `environment.ts` en la configuración de build `co`.
 *
 * @see docs/codigo/configuracion-y-pais.md#entornos-y-api-url
 */
export const environment: { apiUrl: string; country: CountryCode } = {
  apiUrl: API_URL,
  country: 'CO',
};
