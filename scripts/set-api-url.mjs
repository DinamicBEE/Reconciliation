// Escribe src/environments/api-url.ts con la URL del Gateway tomada de API_URL.
//   Vercel → Build Command:  node scripts/set-api-url.mjs && pnpm build        (o build:co para Colombia)
// Sin API_URL no hace nada (se queda el '' de desarrollo, rutas relativas). Falla si la URL no es
// http(s) absoluta, para no publicar un portal que llame a la nada.
import { writeFileSync } from 'node:fs';

const raw = process.env.API_URL?.trim();
if (!raw) {
  console.log('[set-api-url] API_URL no definida: se conserva apiUrl vacío (rutas relativas).');
  process.exit(0);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error(`[set-api-url] API_URL no es una URL válida: "${raw}"`);
  process.exit(1);
}
if (!/^https?:$/.test(url.protocol)) {
  console.error(`[set-api-url] API_URL debe empezar con http:// o https:// (recibido: "${raw}")`);
  process.exit(1);
}

const origin = url.origin + url.pathname.replace(/\/+$/, '');
writeFileSync(
  new URL('../src/environments/api-url.ts', import.meta.url),
  `// GENERADO por scripts/set-api-url.mjs a partir de API_URL — no editar ni versionar este valor.\nexport const API_URL = '${origin}';\n`,
);
console.log(`[set-api-url] apiUrl = ${origin}`);
