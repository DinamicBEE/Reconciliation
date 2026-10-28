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

// Un país no soportado detiene el arranque en vez de dejar la app a medias.
function resolveActiveCountry(code: string): CountryProfile {
  const profile = COUNTRY_PROFILES[code as keyof typeof COUNTRY_PROFILES];
  if (!profile) {
    const supported = Object.keys(COUNTRY_PROFILES).join(', ');
    throw new Error(`environment.country = "${code}" no es un país soportado. Valores válidos: ${supported}.`);
  }
  return profile;
}

/**
 * Perfil del país activo, resuelto una vez al cargar, para código sin DI (funciones puras, mocks).
 *
 * @throws Error si `environment.country` no es un país soportado.
 * @see docs/codigo/configuracion-y-pais.md#perfil-de-pais
 */
export const ACTIVE_COUNTRY: CountryProfile = resolveActiveCountry(environment.country);

/** Perfil del país activo para inyectar en componentes y servicios (mismo objeto que {@link ACTIVE_COUNTRY}). */
export const COUNTRY_PROFILE = new InjectionToken<CountryProfile>('COUNTRY_PROFILE');

const LOCALE_DATA = { 'es-MX': localeEsMx, 'es-CO': localeEsCo } as const;

/**
 * Providers de país: {@link COUNTRY_PROFILE}, `LOCALE_ID`, `DEFAULT_CURRENCY_CODE` y `<html lang>`.
 *
 * @see docs/codigo/configuracion-y-pais.md#perfil-de-pais
 */
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
