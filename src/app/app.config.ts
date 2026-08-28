import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import esMX from '@angular/common/locales/es-MX';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';

// es-MX: agrupa miles con coma y usa punto decimal (igual que en-US), a
// diferencia de es-ES (Angular no tiene un i18n de ng-zorro para es-MX
// todavía, así que sus textos internos usan es_ES; el formato de moneda y
// fecha de la app sí usa es-MX vía LOCALE_ID).
registerLocaleData(esMX);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'es-MX' },
    provideNzI18n(es_ES),
    provideNzDateFnsAdapter(),
  ],
};
