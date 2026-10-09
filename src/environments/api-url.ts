// Origen del Gateway del backend para las llamadas HTTP del portal.
//
// '' (por defecto) = rutas relativas (`/auth/...`, `/users/...`): en desarrollo las reenvía el
// proxy de `ng serve` (proxy.conf.js) al Gateway, mismo origen, sin CORS.
//
// En producción (p. ej. Vercel) el portal y el Gateway son orígenes distintos, así que hace falta
// la URL ABSOLUTA del Gateway (sin "/" final). No se escribe a mano: `scripts/set-api-url.mjs` la
// toma de la variable de entorno API_URL justo antes de compilar y reemplaza este archivo en la
// copia del build (ver README, "Despliegue en Vercel"). El dominio del portal debe estar, además,
// en CORS_ALLOWED_ORIGINS del Gateway.
export const API_URL = '';
