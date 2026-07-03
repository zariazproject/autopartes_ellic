# Autopartes El Lic — Catálogo web sincronizado con MercadoLibre

Vitrina web del inventario (~1,400 autopartes usadas). Las ventas ocurren en
MercadoLibre; cada pieza enlaza a su publicación.

## Estructura

```
.env             Credenciales de la app de ML (NO se sube a git)
tokens.json      Tokens OAuth, se renuevan solos (NO se sube a git)
products.json    Catálogo generado por la sincronización
sync/
  env.js         Carga el .env (sin dependencias)
  tokens.js      Tokens: intercambio, renovación automática, escritura atómica
  ml-api.js      Cliente HTTP con reintentos y backoff (429/5xx) y re-auth en 401
  auth.js        Autorización inicial (una sola vez)
  sync.js        Sincronización completa → site/products.json
site/            El sitio (sin frameworks): blanco cálido / negro / azul
  index.html     Landing: hero, vitrina corta, sección de Lorenzo + Facebook
  catalogo.html  Catálogo completo con búsqueda y filtros (lee ?q= y ?cat=)
  app.js         Lógica de ambas páginas (detecta body[data-page])
  styles.css     Estilos y animaciones
  products.json  Catálogo generado por la sincronización
  logo-camaro.png, lorenzo.jpg
tools/
  serve.js       Servidor estático local: node tools/serve.js (puerto 8080)
  nano-banana.js Edita la foto de Lorenzo (pulgar arriba) con Gemini 2.5 Flash Image
```

## Ver el sitio en local

`node tools/serve.js` y abre http://localhost:8080

## Requisitos

- Node.js 18 o superior (sin dependencias de npm).

## Uso

1. **Configurar credenciales**: pega el Secret Key en `.env` (`ML_CLIENT_SECRET=`).
2. **Autorizar (una sola vez)**:
   - `npm run auth` imprime la URL de autorización.
   - Ábrela con la sesión del vendedor, autoriza, y copia el `?code=TG-...`
     de la URL de google.com a la que te redirige (caduca en ~10 min).
   - `npm run auth -- TG-el-code`
3. **Sincronizar**: `npm run sync` — genera/actualiza `products.json`.

Los access tokens duran 6 h y se renuevan solos. Los refresh tokens son de un
solo uso: `tokens.js` persiste el nuevo de inmediato con escritura atómica.
Si pasan ~6 meses sin sincronizar, el refresh token caduca y hay que repetir
el paso 2.
