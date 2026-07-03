// Catálogo Autopartes El Lic.
// Un solo archivo para dos páginas: la landing (index.html, data-page="landing")
// muestra una vitrina corta; el catálogo (catalogo.html, data-page="catalogo")
// muestra todo con búsqueda y filtros. Ambas comparten la ficha de producto.
'use strict';

const POR_PAGINA = 24;
const PAGINA = document.body.dataset.page;

const $ = (id) => document.getElementById(id);
const fmtMXN = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

// Normaliza para buscar sin acentos ni mayúsculas.
const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// La galería guarda fotos -F (máxima resolución); para miniaturas usamos -O.
const aThumb = (url) => url.replace(/-F\.(jpg|jpeg|png|webp)$/i, '-O.$1');

let productos = [];
const estado = { q: '', cat: '', marca: '', lado: '', orden: 'relevancia', visibles: POR_PAGINA };
let fotoActual = 0;
let productoAbierto = null;

init();

async function init() {
  const res = await fetch('products.json');
  const data = await res.json();
  productos = data.products.map((p) => ({
    ...p,
    _busqueda: norm([p.title, p.brand, p.part_number, p.oem, p.category, p.id].join(' ')),
    _lado: norm(p.position || ''),
  }));

  if ($('hero-total')) animarConteo($('hero-total'), 1399);
  if ($('footer-actualizado')) {
    $('footer-actualizado').textContent =
      'Inventario actualizado: ' +
      new Date(data.generated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  conectarFicha();

  if (PAGINA === 'landing') initLanding();
  else initCatalogo();
}

/* ====================== LANDING ====================== */

function initLanding() {
  // Vitrina corta: piezas destacadas con buena foto, repartidas por categoría.
  const destacados = seleccionarDestacados(12);
  $('destacados').innerHTML = destacados.map(tarjetaHTML).join('');
  activarTarjetas();

  // Chips de categorías más grandes → llevan al catálogo completo filtrado.
  const conteo = {};
  for (const p of productos) conteo[p.category] = (conteo[p.category] || 0) + 1;
  const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('chips').innerHTML = top
    .map(([c, n]) => `<a class="chip" href="catalogo.html?cat=${encodeURIComponent(c)}">${esc(c)} · ${n}</a>`)
    .join('');

  // El buscador de la landing manda al catálogo con la búsqueda ya aplicada.
  $('buscador').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $('busqueda').value.trim();
    location.href = 'catalogo.html' + (q ? `?q=${encodeURIComponent(q)}` : '');
  });

  activarReveal();
}

function seleccionarDestacados(n) {
  // Categorías cuyas piezas se fotografían más limpias/estéticas, en orden.
  const fotogenicas = ['Faros Delanteros', 'Calavera', 'Espejo', 'Parrilla', 'Facia', 'Cajuela', 'Faros Auxiliares'];
  const rank = (c) => {
    for (let i = 0; i < fotogenicas.length; i++) if ((c || '').includes(fotogenicas[i])) return i;
    return 99;
  };
  // Año-mes de la foto (sufijo _MMYYYY en la URL): preferimos las más recientes.
  const recencia = (p) => {
    const m = /_(\d{2})(\d{4})-[A-Z]\./.exec(p.thumb || '');
    return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
  };

  const candidatos = productos
    .filter((p) => p.pictures && p.pictures.length >= 4 && p.thumb)
    .sort(
      (a, b) =>
        rank(a.category) - rank(b.category) ||
        recencia(b) - recencia(a) ||
        b.pictures.length - a.pictures.length
    );

  // Máximo 2 por categoría para que haya variedad en la vitrina.
  const porCat = {};
  const elegidos = [];
  for (const p of candidatos) {
    if ((porCat[p.category] || 0) >= 2) continue;
    porCat[p.category] = (porCat[p.category] || 0) + 1;
    elegidos.push(p);
    if (elegidos.length >= n) break;
  }
  return elegidos.slice(0, n);
}

// Cuenta animada de 0 al total (toque dinámico en el hero).
function animarConteo(el, fin) {
  el.textContent = fmtMXN.format(fin); // respaldo: si rAF no corre, queda el final
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dur = 1100;
  const t0 = performance.now();
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtMXN.format(Math.round(fin * eased));
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Aparición suave de secciones al hacer scroll.
function activarReveal() {
  const obs = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  for (const el of document.querySelectorAll('.reveal')) obs.observe(el);
}

/* ====================== CATÁLOGO ====================== */

function initCatalogo() {
  const params = new URLSearchParams(location.search);
  estado.q = params.get('q') || '';
  estado.cat = params.get('cat') || '';
  if ($('busqueda')) $('busqueda').value = estado.q;

  pintarChips();
  pintarMarcas();
  conectarEventosCatalogo();
  aplicar();
  abrirDesdeHash();
}

function filtrar() {
  const tokens = norm(estado.q).split(/\s+/).filter(Boolean);
  let lista = productos.filter((p) => {
    if (estado.cat && p.category !== estado.cat) return false;
    if (estado.marca && p.brand !== estado.marca) return false;
    if (estado.lado && !p._lado.includes(estado.lado)) return false;
    return tokens.every((t) => p._busqueda.includes(t));
  });
  if (estado.orden === 'precio-asc') lista = lista.slice().sort((a, b) => a.price - b.price);
  if (estado.orden === 'precio-desc') lista = lista.slice().sort((a, b) => b.price - a.price);
  return lista;
}

function aplicar() {
  const lista = filtrar();
  const visibles = lista.slice(0, estado.visibles);

  $('grid').innerHTML = visibles.map(tarjetaHTML).join('');
  $('conteo').textContent = `${fmtMXN.format(lista.length)} resultado${lista.length === 1 ? '' : 's'}`;
  $('sin-resultados').hidden = lista.length > 0;
  $('mostrar-mas').hidden = lista.length <= estado.visibles;
  activarTarjetas();
}

function pintarChips() {
  const conteo = {};
  for (const p of productos) conteo[p.category] = (conteo[p.category] || 0) + 1;
  const cats = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

  $('chips').innerHTML =
    `<button class="chip${estado.cat ? '' : ' activa'}" data-cat="">Todas</button>` +
    cats
      .map(
        ([c, n]) =>
          `<button class="chip${estado.cat === c ? ' activa' : ''}" data-cat="${esc(c)}">${esc(c)} · ${n}</button>`
      )
      .join('');

  $('chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    estado.cat = chip.dataset.cat;
    estado.visibles = POR_PAGINA;
    for (const c of document.querySelectorAll('.chip')) c.classList.toggle('activa', c === chip);
    aplicar();
  });
}

function pintarMarcas() {
  const marcas = [...new Set(productos.map((p) => p.brand).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
  $('filtro-marca').innerHTML =
    `<option value="">Marca: todas</option>` +
    marcas.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
}

function conectarEventosCatalogo() {
  $('buscador').addEventListener('submit', (ev) => ev.preventDefault());
  $('busqueda').addEventListener('input', () => {
    estado.q = $('busqueda').value;
    estado.visibles = POR_PAGINA;
    aplicar();
  });
  $('filtro-marca').addEventListener('change', (ev) => {
    estado.marca = ev.target.value;
    estado.visibles = POR_PAGINA;
    aplicar();
  });
  $('filtro-lado').addEventListener('change', (ev) => {
    estado.lado = ev.target.value;
    estado.visibles = POR_PAGINA;
    aplicar();
  });
  $('orden').addEventListener('change', (ev) => {
    estado.orden = ev.target.value;
    aplicar();
  });
  $('mostrar-mas').addEventListener('click', () => {
    estado.visibles += POR_PAGINA;
    aplicar();
  });
}

/* ====================== TARJETAS Y FICHA (compartido) ====================== */

function tarjetaHTML(p) {
  const lado = p.position ? `<span class="tarjeta-lado">${esc(p.position)}</span>` : '';
  return `
  <article class="tarjeta" data-id="${p.id}">
    <div class="tarjeta-foto">
      <img src="${esc(p.thumb || '')}" alt="${esc(p.title)}" loading="lazy" decoding="async">
      <span class="tarjeta-badge">Usado · ${p.stock} disponible${p.stock === 1 ? '' : 's'}</span>
    </div>
    <div class="tarjeta-cuerpo">
      <p class="tarjeta-cat">${esc(p.category || '')}</p>
      <p class="tarjeta-titulo">${esc(p.title)}</p>
      ${lado}
      <p class="tarjeta-precio">$${fmtMXN.format(p.price)} <small>MXN</small></p>
      <a class="btn-ml" href="${esc(p.link)}" target="_blank" rel="noopener">Ver en MercadoLibre ↗</a>
    </div>
  </article>`;
}

function activarTarjetas() {
  for (const el of document.querySelectorAll('.tarjeta')) {
    if (el.dataset.listo) continue;
    el.dataset.listo = '1';
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('a')) return; // el botón de ML navega normal
      abrirFicha(el.dataset.id);
    });
  }
}

function conectarFicha() {
  $('modal-cerrar').addEventListener('click', cerrarFicha);
  $('modal-fondo').addEventListener('click', cerrarFicha);
  $('foto-prev').addEventListener('click', () => moverFoto(-1));
  $('foto-next').addEventListener('click', () => moverFoto(1));
  document.addEventListener('keydown', (ev) => {
    if ($('modal').hidden) return;
    if (ev.key === 'Escape') cerrarFicha();
    if (ev.key === 'ArrowLeft') moverFoto(-1);
    if (ev.key === 'ArrowRight') moverFoto(1);
  });
}

function abrirFicha(id) {
  const p = productos.find((x) => x.id === id);
  if (!p) return;
  productoAbierto = p;
  fotoActual = 0;

  $('modal-cat').textContent = p.category || '';
  $('modal-titulo').textContent = p.title;
  $('modal-precio').innerHTML = `$${fmtMXN.format(p.price)} <small>MXN</small>`;
  $('modal-link').href = p.link;

  const badges = ['Usado', p.position, p.brand].filter(Boolean);
  $('modal-badges').innerHTML = badges.map((b) => `<span>${esc(b)}</span>`).join('');
  $('modal-parte').textContent = p.part_number ? `No. de parte: ${p.part_number}` : '';

  $('galeria-thumbs').innerHTML = p.pictures
    .map((u, i) => `<img src="${esc(aThumb(u))}" alt="" data-i="${i}" loading="lazy">`)
    .join('');
  for (const t of document.querySelectorAll('.galeria-thumbs img')) {
    t.addEventListener('click', () => mostrarFoto(Number(t.dataset.i)));
  }
  mostrarFoto(0);

  $('modal').hidden = false;
  document.body.style.overflow = 'hidden';
  history.replaceState(null, '', `#${p.id}`);
}

function mostrarFoto(i) {
  const fotos = productoAbierto.pictures;
  fotoActual = (i + fotos.length) % fotos.length;
  $('galeria-foto').src = fotos[fotoActual];
  $('galeria-foto').alt = productoAbierto.title;
  document.querySelectorAll('.galeria-thumbs img').forEach((t, j) => {
    t.classList.toggle('activa', j === fotoActual);
  });
  const unaSola = fotos.length <= 1;
  $('foto-prev').hidden = unaSola;
  $('foto-next').hidden = unaSola;
}

const moverFoto = (d) => mostrarFoto(fotoActual + d);

function cerrarFicha() {
  $('modal').hidden = true;
  document.body.style.overflow = '';
  productoAbierto = null;
  history.replaceState(null, '', location.pathname + location.search);
}

// Links directos a una pieza: catalogo.html#MLM123456
function abrirDesdeHash() {
  const id = location.hash.slice(1);
  if (id) abrirFicha(id);
}

/* ====================== Utilidades ====================== */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
