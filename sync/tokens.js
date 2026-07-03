// Gestión de tokens de MercadoLibre.
//
// Puntos críticos que este módulo resuelve:
//  - Los access tokens duran 6 horas: se renuevan solos antes de expirar.
//  - Los refresh tokens son de UN SOLO USO: cada renovación devuelve uno
//    nuevo que se persiste INMEDIATAMENTE con escritura atómica
//    (se escribe a un .tmp y luego se renombra; así un corte a media
//    escritura nunca deja un tokens.json corrupto).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './env.js';

const TOKENS_FILE = path.join(ROOT, 'tokens.json');
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
// Margen de seguridad: renovar si quedan menos de 30 min de vida.
const MARGEN_MS = 30 * 60 * 1000;

async function peticionToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // ML devuelve "error" y "message" útiles (p. ej. invalid_grant si el
    // code expiró — duran ~10 minutos — o si el refresh token ya se usó).
    throw new Error(
      `Error ${res.status} al pedir token: ${data.error ?? ''} ${data.message ?? ''}`.trim()
    );
  }
  return data;
}

async function guardarTokens(data) {
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user_id: data.user_id,
    // Momento absoluto de expiración (ms epoch), calculado al recibirlo.
    expires_at: Date.now() + data.expires_in * 1000,
    saved_at: new Date().toISOString(),
  };
  const tmp = `${TOKENS_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(tokens, null, 2), 'utf8');
  await rename(tmp, TOKENS_FILE); // rename es atómico en el mismo volumen
  return tokens;
}

export async function leerTokens() {
  try {
    return JSON.parse(await readFile(TOKENS_FILE, 'utf8'));
  } catch {
    // En la nube (GitHub Actions) no hay tokens.json: arrancamos desde el
    // refresh token guardado como secreto/variable de entorno. expires_at=0
    // fuerza una renovación inmediata, que persiste los tokens nuevos.
    if (process.env.ML_REFRESH_TOKEN) {
      return { refresh_token: process.env.ML_REFRESH_TOKEN, access_token: null, expires_at: 0 };
    }
    return null;
  }
}

// Paso único de autorización: intercambia el code del navegador por tokens.
export async function intercambiarCode(code) {
  const data = await peticionToken({
    grant_type: 'authorization_code',
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    code,
    redirect_uri: process.env.ML_REDIRECT_URI,
  });
  return guardarTokens(data);
}

export async function renovarTokens() {
  const actuales = await leerTokens();
  if (!actuales?.refresh_token) {
    throw new Error(
      'No hay tokens guardados. Ejecuta primero la autorización: npm run auth -- <CODE>'
    );
  }
  const data = await peticionToken({
    grant_type: 'refresh_token',
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: actuales.refresh_token,
  });
  console.log('Token renovado correctamente.');
  return guardarTokens(data);
}

// Devuelve un access token válido, renovando si está por expirar.
export async function obtenerAccessToken({ forzarRenovacion = false } = {}) {
  let tokens = await leerTokens();
  if (!tokens) {
    throw new Error(
      'No hay tokens guardados. Ejecuta primero la autorización: npm run auth -- <CODE>'
    );
  }
  if (forzarRenovacion || Date.now() > tokens.expires_at - MARGEN_MS) {
    tokens = await renovarTokens();
  }
  return tokens.access_token;
}
