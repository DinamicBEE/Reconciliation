import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { provideCountry } from './core/country/active-country';
import { httpErrorAlertInterceptor } from './core/interceptors/http-error-alert.interceptor';
import { authTokenInterceptor } from './core/interceptors/auth-token.interceptor';
import { mockBackendInterceptor } from './core/mock-backend/mock-backend.interceptor';

// `provideCountry()` fija locale, moneda y perfil fiscal; ng-zorro queda en es_ES.
// Ver docs/codigo/configuracion-y-pais.md#arranque-y-providers

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authTokenInterceptor, httpErrorAlertInterceptor, mockBackendInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideCountry(),
    provideNzI18n(es_ES),
    provideNzDateFnsAdapter(),
  ],
};
