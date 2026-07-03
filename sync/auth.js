// Autorización inicial (se ejecuta UNA sola vez).
//
// Sin argumentos: imprime la URL de autorización para abrir en el navegador.
// Con el code:    node sync/auth.js TG-xxxxxxxx   (o: npm run auth -- TG-xxxxxxxx)
import './env.js';
import { intercambiarCode, leerTokens } from './tokens.js';

const code = process.argv[2];

if (!code) {
  const url =
    'https://auth.mercadolibre.com.mx/authorization' +
    `?response_type=code&client_id=${process.env.ML_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.ML_REDIRECT_URI)}`;
  console.log('1. Abre esta URL en el navegador con la sesión del vendedor:\n');
  console.log(`   ${url}\n`);
  console.log('2. Autoriza la aplicación. ML te redirige a google.com con ?code=TG-... en la URL.');
  console.log('3. Copia ese code (caduca en ~10 minutos) y ejecuta:\n');
  console.log('   npm run auth -- TG-el-code-que-copiaste\n');
  const existentes = await leerTokens();
  if (existentes) {
    console.log(`Nota: ya hay tokens guardados (user_id ${existentes.user_id}).`);
  }
  process.exit(0);
}

try {
  const tokens = await intercambiarCode(code.trim());
  console.log('Autorización exitosa. Tokens guardados en tokens.json');
  console.log(`user_id del vendedor: ${tokens.user_id}`);
  console.log(`El access token expira: ${new Date(tokens.expires_at).toLocaleString()}`);
  console.log('A partir de ahora la renovación es automática. Ya puedes ejecutar: npm run sync');
} catch (err) {
  console.error(`Falló el intercambio del code: ${err.message}`);
  console.error('Si dice invalid_grant, el code probablemente expiró: genera uno nuevo (paso 1).');
  process.exit(1);
}
