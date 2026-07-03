// Cliente HTTP para la API de MercadoLibre con:
//  - Autorización automática (inyecta el access token vigente).
//  - Reintento tras 401 forzando una renovación del token.
//  - Reintentos con backoff exponencial para 429 (rate limit) y errores 5xx.
import { obtenerAccessToken } from './tokens.js';

const API = 'https://api.mercadolibre.com';
const MAX_REINTENTOS = 5;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mlGet(ruta, { auth = true } = {}) {
  const url = ruta.startsWith('http') ? ruta : `${API}${ruta}`;
  let renovado401 = false;

  for (let intento = 0; ; intento++) {
    const headers = { accept: 'application/json' };
    if (auth) {
      headers.authorization = `Bearer ${await obtenerAccessToken({
        forzarRenovacion: renovado401,
      })}`;
      renovado401 = false;
    }

    const res = await fetch(url, { headers });

    if (res.ok) return res.json();

    // Token inválido: renovar una sola vez y reintentar.
    if (res.status === 401 && auth && intento < MAX_REINTENTOS) {
      console.warn('Respuesta 401: renovando token y reintentando...');
      renovado401 = true;
      continue;
    }

    // Rate limit o error transitorio del servidor: backoff exponencial.
    if ((res.status === 429 || res.status >= 500) && intento < MAX_REINTENTOS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const espera = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** intento;
      console.warn(`Respuesta ${res.status} en ${ruta}: esperando ${espera} ms...`);
      await esperar(espera);
      continue;
    }

    const cuerpo = await res.text().catch(() => '');
    throw new Error(`Error ${res.status} en GET ${ruta}: ${cuerpo.slice(0, 300)}`);
  }
}
