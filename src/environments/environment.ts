// Vacío a propósito: las llamadas de AuthService van a rutas relativas
// (`/auth/...`), que `ng serve` reenvía al gateway del backend real
// ("coctel_midd", rama feature/login al momento de escribir esto — antes
// "coctel-del-mar"; ver MASTER.md, "Actualización: login apuntado al
// backend real") vía `proxy.conf.json` — puerto 8082 en este entorno local,
// remapeado desde el 8080 por defecto de ese repo porque ya lo ocupa otro
// proyecto en esta máquina (ver el `docker run` manual del gateway, no un
// cambio al `docker-compose.yml` del backend). Mismo origen para el
// navegador, sin depender de que ese backend tenga CORS configurado (no lo
// tiene hoy). En producción, `apiUrl` pasaría a ser el origen real del
// gateway (o se sigue sirviendo tras un reverse proxy en el mismo origen,
// mismo criterio).
export const environment = {
  apiUrl: '',
};
