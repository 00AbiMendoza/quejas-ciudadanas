/**
 * Punto de entrada: verifica la conexión con Firebase e inicia el servidor HTTP.
 */
import { config } from './config/env.js';

let modulos;
try {
  const [{ crearApp }, firebase] = await Promise.all([import('./app.js'), import('./config/firebase.js')]);
  modulos = { crearApp, ...firebase };
} catch (error) {
  console.error(`\n❌ No se pudo iniciar el servidor:\n   ${error.message}\n`);
  process.exit(1);
}

const { crearApp, verificarConexionFirestore, proyectoFirebase, usandoEmulador } = modulos;

if (!config.admin.password) {
  console.warn('⚠️  ADMIN_PASSWORD no está definido en .env: el Panel de Administración no permitirá iniciar sesión.');
}

const app = crearApp();
const servidor = app.listen(config.puerto, async () => {
  const url = `http://localhost:${config.puerto}`;
  console.log('\n🏛️  Sistema de Atención de Quejas Ciudadanas');
  console.log(`   Portal ciudadano ......... ${url}/`);
  console.log(`   Panel de administración .. ${url}/admin`);
  console.log(`   API REST ................. ${url}/api`);
  console.log(`   Firebase ................. ${proyectoFirebase}${usandoEmulador ? ' (emulador local)' : ''}`);

  try {
    await verificarConexionFirestore();
    console.log('   Firestore ................ ✅ conectado\n');
  } catch (error) {
    console.error('   Firestore ................ ❌ sin conexión');
    console.error(`   → ${error.message.split('\n')[0]}\n`);
  }
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ El puerto ${config.puerto} ya está en uso. Cierra la otra aplicación o cambia PORT en .env.\n`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

const cerrar = () => servidor.close(() => process.exit(0));
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
