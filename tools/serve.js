// Servidor estático mínimo para ver el sitio en local: node tools/serve.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PUERTO = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = path.normalize(path.join(SITE, ruta === '/' ? 'index.html' : ruta));
    if (!archivo.startsWith(SITE)) throw new Error('fuera de site/');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'content-type': MIME[path.extname(archivo)] ?? 'application/octet-stream' });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}).listen(PUERTO, () => console.log(`Sitio en http://localhost:${PUERTO}`));
