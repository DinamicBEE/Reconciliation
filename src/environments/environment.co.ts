import { CountryCode } from '../app/core/country/country.model';
import { API_URL } from './api-url';

// Variables de entorno — Colombia. Reemplaza a `environment.ts` con la
// configuración de build `co` (ver angular.json y los comentarios de
// `environment.ts`). Mismo `apiUrl`: el gateway es el mismo, cambia el país.
export const environment: { apiUrl: string; country: CountryCode } = {
  apiUrl: API_URL,
  country: 'CO',
};
