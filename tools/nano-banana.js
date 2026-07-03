// Edición de imagen con "Nano Banana" (Google Gemini 2.5 Flash Image).
//
// Toma la foto de Lorenzo y le pide al modelo que haga el gesto de pulgar
// arriba, conservando su rostro e identidad. Sin dependencias (fetch nativo).
//
// Requisitos:
//   1. Una API key gratuita de Google AI Studio: https://aistudio.google.com/apikey
//   2. Pégala en .env como:  GEMINI_API_KEY=tu_key
//
// Uso:
//   node tools/nano-banana.js                  (usa la foto y prompt por defecto)
//   node tools/nano-banana.js entrada.jpg salida.jpg "tu prompt"
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carga GEMINI_API_KEY desde .env sin tocar el resto.
function leerEnv(clave) {
  if (process.env[clave]) return process.env[clave];
  try {
    for (const linea of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const l = linea.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i !== -1 && l.slice(0, i).trim() === clave) return l.slice(i + 1).trim();
    }
  } catch {}
  return null;
}

const API_KEY = leerEnv('GEMINI_API_KEY');
if (!API_KEY || API_KEY === 'PEGA_AQUI_TU_KEY') {
  console.error('Falta GEMINI_API_KEY en .env. Sácala gratis en https://aistudio.google.com/apikey');
  process.exit(1);
}

const MODELO = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const entrada = process.argv[2] || path.join(ROOT, 'site', 'lorenzo.jpg');
const salida = process.argv[3] || path.join(ROOT, 'site', 'lorenzo-pulgar.jpg');
const prompt =
  process.argv[4] ||
  'Edita esta foto para que el joven esté haciendo claramente el gesto de pulgar ' +
    'arriba (thumbs up) con una mano, mirando a la cámara con una sonrisa amable y ' +
    'segura. Conserva exactamente su rostro, peinado, lentes y ropa para que siga ' +
    'siendo reconocible. Iluminación limpia y profesional, aspecto de foto real de ' +
    'perfil de negocio. No agregues texto ni logos.';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  const bytes = await readFile(entrada);
  const mime = MIME[path.extname(entrada).toLowerCase()] || 'image/jpeg';
  console.log(`Enviando ${path.basename(entrada)} (${(bytes.length / 1024).toFixed(0)} KB) a ${MODELO}...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: bytes.toString('base64') } },
          ],
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Error ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 400)}`);
    process.exit(1);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inline_data?.data || p.inlineData?.data);
  if (!img) {
    const texto = parts.find((p) => p.text)?.text;
    console.error('El modelo no devolvió imagen.' + (texto ? ` Respondió: ${texto.slice(0, 300)}` : ''));
    process.exit(1);
  }

  const b64 = img.inline_data?.data || img.inlineData?.data;
  await writeFile(salida, Buffer.from(b64, 'base64'));
  console.log(`Listo: imagen guardada en ${salida}`);
  console.log('Si te gusta cómo quedó, dime y la conecto en el sitio (reemplaza lorenzo.jpg).');
}

main().catch((err) => {
  console.error(`Falló la edición: ${err.message}`);
  process.exit(1);
});
