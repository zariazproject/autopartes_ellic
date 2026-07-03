// Carga las variables de .env a process.env sin dependencias externas.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envPath = path.join(ROOT, '.env');
let contenido = '';
try {
  contenido = readFileSync(envPath, 'utf8');
} catch {
  // En la nube (GitHub Actions) no hay archivo .env: las variables llegan
  // directo del entorno (los secretos del repo). Seguimos sin él.
}

for (const linea of contenido.split(/\r?\n/)) {
  const limpia = linea.trim();
  if (!limpia || limpia.startsWith('#')) continue;
  const sep = limpia.indexOf('=');
  if (sep === -1) continue;
  const clave = limpia.slice(0, sep).trim();
  const valor = limpia.slice(sep + 1).trim();
  if (!(clave in process.env)) process.env[clave] = valor;
}

for (const requerida of ['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI']) {
  if (!process.env[requerida] || process.env[requerida] === 'PEGA_AQUI_TU_SECRET') {
    console.error(`Falta configurar ${requerida} en el archivo .env`);
    process.exit(1);
  }
}
