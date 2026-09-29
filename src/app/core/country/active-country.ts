import { DOCUMENT, registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import localeEsMx from '@angular/common/locales/es-MX';
import {
  DEFAULT_CURRENCY_CODE,
  EnvironmentProviders,
  InjectionToken,
  LOCALE_ID,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { environment } from '../../../environments/environment';
import { COUNTRY_PROFILES } from './country-profiles';
import { CountryProfile } from './country.model';

// Resuelve `environment.country` UNA sola vez, al cargar la app. Un valor
// no soportado detiene el arranque con un mensaje claro en vez de dejar la
// app a medias con textos o impuestos de otro país.
function resolveActiveCountry(code: string): CountryProfile {
  const profile = COUNTRY_PROFILES[code as keyof typeof COUNTRY_PROFILES];
  if (!profile) {
    const supported = Object.keys(COUNTRY_PROFILES).join(', ');
    throw new Error(`environment.country = "${code}" no es un país soportado. Valores válidos: ${supported}.`);
  }
  return profile;
}

// Para funciones puras y datos mock (sin DI), p. ej. `saleTaxAmount` o el
// armado de comprobantes en `sales-mock.data.ts`. Los componentes usan
// `COUNTRY_PROFILE` (mismo objeto, vía inyección).
export const ACTIVE_COUNTRY: CountryProfile = resolveActiveCountry(environment.country);

export const COUNTRY_PROFILE = new InjectionToken<CountryProfile>('COUNTRY_PROFILE');

const LOCALE_DATA = { 'es-MX': localeEsMx, 'es-CO': localeEsCo } as const;

// Providers de país para `app.config.ts`: perfil, `LOCALE_ID` (formato de
// números y fechas) y moneda por defecto del pipe `currency`. Marca además
// `<html lang>` con el locale activo.
export function provideCountry(profile: CountryProfile = ACTIVE_COUNTRY): EnvironmentProviders {
  registerLocaleData(LOCALE_DATA[profile.locale]);
  return makeEnvironmentProviders([
    { provide: COUNTRY_PROFILE, useValue: profile },
    { provide: LOCALE_ID, useValue: profile.locale },
    { provide: DEFAULT_CURRENCY_CODE, useValue: profile.currency },
    provideAppInitializer(() => {
      inject(DOCUMENT).documentElement.lang = profile.locale;
    }),
  ]);
}
