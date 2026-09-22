// Vacío a propósito: las llamadas de AuthService van a rutas relativas
// (`/auth/...`), que `ng serve` reenvía al gateway de "coctel-del-mar"
// (puerto 8082 en este entorno local — remapeado desde el 8080 por defecto
// de ese repo, ya ocupado por otro proyecto en esta máquina; ver
// `proxy.conf.json` y el `docker-compose.yml` de coctel-del-mar) — mismo
// origen para el navegador, sin depender de que ese backend tenga CORS
// configurado (no lo tiene hoy). En
// producción, `apiUrl` pasaría a ser el origen real del gateway (o se sigue
// sirviendo tras un reverse proxy en el mismo origen, mismo criterio).
export const environment = {
  apiUrl: '',
};
