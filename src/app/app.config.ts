import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { provideCountry } from './core/country/active-country';

// País de trabajo (`environment.country`): `provideCountry()` fija
// `LOCALE_ID` (es-MX: miles con coma y punto decimal; es-CO: miles con punto
// y coma decimal), la moneda por defecto y el perfil fiscal/vocabulario (ver
// core/country/). ng-zorro no tiene i18n para es-MX ni es-CO, así que sus
// textos internos siguen en es_ES.

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideCountry(),
    provideNzI18n(es_ES),
    provideNzDateFnsAdapter(),
  ],
};
