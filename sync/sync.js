// Sincronización completa del catálogo de MercadoLibre → products.json
//
// Flujo:
//  1. GET /users/me                          → user_id del vendedor
//  2. GET /users/{id}/items/search (scan)    → todos los IDs de publicaciones
//     (search_type=scan es obligatorio para cuentas con >1000 items)
//  3. GET /items?ids=... en lotes de 20      → detalles con fotos y atributos
//  4. Filtra status=active y genera products.json
import './env.js';
import { writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './env.js';
import { mlGet } from './ml-api.js';

const SALIDA = path.join(ROOT, 'site', 'products.json');
const TAMANO_LOTE = 20; // máximo del multiget de /items
const PAUSA_ENTRE_LOTES_MS = 150; // cortesía con el rate limit

const ATRIBUTOS =
  'id,title,price,currency_id,available_quantity,status,permalink,pictures,attributes,category_id,condition';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Busca en el array attributes de ML el primer valor de los IDs candidatos.
function extraerAtributo(attributes, ...ids) {
  for (const id of ids) {
    const attr = attributes?.find((a) => a.id === id);
    if (attr?.value_name) return attr.value_name;
  }
  return null;
}

// Las fotos de ML llegan en variantes por sufijo (-I icono, -O mediana,
// -F máxima resolución). Cambiamos el sufijo para pedir la mejor calidad.
function fotoMaxResolucion(url) {
  return url.replace(/-[A-Z]\.(jpg|jpeg|png|webp)$/i, '-F.$1');
}

async function obtenerTodosLosIds(userId) {
  const ids = [];
  let scrollId = null;
  while (true) {
    let ruta = `/users/${userId}/items/search?search_type=scan&status=active&limit=100`;
    if (scrollId) ruta += `&scroll_id=${encodeURIComponent(scrollId)}`;
    const pagina = await mlGet(ruta);
    if (!pagina.results?.length) break;
    ids.push(...pagina.results);
    scrollId = pagina.scroll_id;
    process.stdout.write(`\r  IDs recolectados: ${ids.length} de ~${pagina.paging?.total ?? '?'}`);
    if (!scrollId) break;
  }
  process.stdout.write('\n');
  return ids;
}

async function obtenerDetalles(ids) {
  const productos = [];
  let descartados = 0;
  let autosExcluidos = 0;

  for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
    const lote = ids.slice(i, i + TAMANO_LOTE);
    const respuesta = await mlGet(`/items?ids=${lote.join(',')}&attributes=${ATRIBUTOS}`);

    for (const entrada of respuesta) {
      if (entrada.code !== 200 || !entrada.body) {
        descartados++;
        continue;
      }
      const item = entrada.body;
      if (item.status !== 'active') {
        descartados++;
        continue;
      }
      // El sitio es solo de autopartes: se excluyen los vehículos completos
      // (categoría Autos y Camionetas, o permalinks de auto.mercadolibre).
      if (item.category_id === 'MLM1744' || item.permalink?.includes('auto.mercadolibre')) {
        autosExcluidos++;
        continue;
      }
      productos.push({
        id: item.id,
        title: item.title,
        price: item.price,
        currency: item.currency_id,
        stock: item.available_quantity,
        condition: item.condition,
        link: item.permalink,
        category_id: item.category_id,
        brand: extraerAtributo(item.attributes, 'BRAND'),
        part_number: extraerAtributo(item.attributes, 'PART_NUMBER', 'MPN'),
        oem: extraerAtributo(item.attributes, 'OEM', 'OEM_PART_NUMBER'),
        // Lado de la pieza (Izquierdo/Conductor, Derecho/Pasajero) — muy útil
        // en autopartes. El vehículo compatible va en el título, no en atributos.
        position: extraerAtributo(item.attributes, 'VEHICLE_PARTS_POSITION', 'SIDE_POSITION'),
        // Primera foto en tamaño medio para las tarjetas del grid...
        thumb: item.pictures?.[0]?.secure_url ?? null,
        // ...y la galería completa en máxima resolución para la ficha.
        pictures: (item.pictures ?? []).map((p) => fotoMaxResolucion(p.secure_url ?? p.url)),
      });
    }

    process.stdout.write(
      `\r  Detalles descargados: ${Math.min(i + TAMANO_LOTE, ids.length)} de ${ids.length}`
    );
    await esperar(PAUSA_ENTRE_LOTES_MS);
  }
  process.stdout.write('\n');
  if (descartados) console.log(`  (${descartados} items descartados por no estar activos)`);
  if (autosExcluidos) console.log(`  (${autosExcluidos} vehículos completos excluidos del catálogo)`);
  return productos;
}

// Resuelve los nombres legibles de las categorías (endpoint público).
async function mapaDeCategorias(productos) {
  const idsUnicos = [...new Set(productos.map((p) => p.category_id))];
  console.log(`Resolviendo nombres de ${idsUnicos.length} categorías...`);
  const mapa = {};
  for (const id of idsUnicos) {
    try {
      const cat = await mlGet(`/categories/${id}`, { auth: false });
      mapa[id] = cat.name;
    } catch {
      mapa[id] = id; // si falla, dejamos el ID como nombre
    }
  }
  return mapa;
}

async function main() {
  console.log('Obteniendo datos del vendedor (/users/me)...');
  const yo = await mlGet('/users/me');
  console.log(`Vendedor: ${yo.nickname} (user_id ${yo.id})`);

  console.log('Recolectando IDs de publicaciones activas (search_type=scan)...');
  const ids = await obtenerTodosLosIds(yo.id);

  console.log('Descargando detalles en lotes de 20 (multiget)...');
  const productos = await obtenerDetalles(ids);

  const categorias = await mapaDeCategorias(productos);
  for (const p of productos) p.category = categorias[p.category_id];

  const salida = {
    generated_at: new Date().toISOString(),
    seller: yo.nickname,
    total: productos.length,
    products: productos,
  };

  // Escritura atómica, igual que tokens.json
  const tmp = `${SALIDA}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(salida, null, 1), 'utf8');
  await rename(tmp, SALIDA);

  console.log(`\nListo: ${productos.length} productos activos guardados en products.json`);
}

main().catch((err) => {
  console.error(`\nLa sincronización falló: ${err.message}`);
  process.exit(1);
});
