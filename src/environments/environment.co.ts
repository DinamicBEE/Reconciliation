import { CountryCode } from '../app/core/country/country.model';

// Variables de entorno — Colombia. Reemplaza a `environment.ts` con la
// configuración de build `co` (ver angular.json y los comentarios de
// `environment.ts`). Mismo `apiUrl`: el gateway es el mismo, cambia el país.
export const environment: { apiUrl: string; country: CountryCode } = {
  apiUrl: '',
  country: 'CO',
};
