/**
 * Prueba de integración del flujo completo exigido por el enunciado:
 *   Ciudadano registra queja → Backend/API → Firebase → Backend/API → Panel de Administración
 *
 * Usa el EMULADOR de Firestore para no tocar la base de datos real.
 *   1) En otra terminal (en la raíz del proyecto):  npx firebase-tools emulators:start --only firestore --project demo-quejas
 *   2) En backend/:                                npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const PROYECTO = 'demo-quejas-pruebas';
Object.assign(process.env, {
  NODE_ENV: 'test',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
  FIREBASE_PROJECT_ID: PROYECTO,
  FIREBASE_SERVICE_ACCOUNT_PATH: '',
  FIREBASE_SERVICE_ACCOUNT_JSON: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  ADMIN_USER: 'admin',
  ADMIN_PASSWORD: 'clave-de-prueba',
  ADMIN_NAME: 'Inspector de pruebas',
  JWT_SECRET: 'secreto-solo-para-pruebas',
});

let servidor;
let base;
let token;
let folio;

const DESCRIPCION = 'Hay un bache de casi un metro frente a la tienda "La Esquina".\nYa hubo dos accidentes de motos esta semana.';

async function limpiarEmulador() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`;
  const r = await fetch(url, { method: 'DELETE' }).catch(() => null);
  if (!r?.ok) throw new Error(`No se pudo conectar al emulador de Firestore en ${process.env.FIRESTORE_EMULATOR_HOST}. ¿Está encendido?`);
}

async function imagenDePrueba(ancho = 3000, alto = 2000) {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: '#7aa0c8' } })
    .composite([{ input: Buffer.from(`<svg width="${ancho}" height="${alto}"><circle cx="50%" cy="50%" r="30%" fill="#a33"/></svg>`) }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

function formularioValido(extra = {}) {
  const f = new FormData();
  const campos = {
    categoria: 'calles',
    asunto: 'Bache enorme en la 6a avenida',
    descripcion: DESCRIPCION,
    direccion: '6a avenida 12-30',
    zona: 'Zona 1',
    referencia: 'Frente a la tienda La Esquina',
    nombre: 'María José López',
    correo: 'Maria.Lopez@Correo.com',
    telefono: '5555-1234',
    latitud: '14.6349',
    longitud: '-90.5069',
    aceptaTerminos: 'true',
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.set(k, v);
  return f;
}

const llamar = async (ruta, opciones = {}) => {
  const r = await fetch(`${base}/api${ruta}`, opciones);
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, tipo, cuerpo: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const conToken = (extra = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } });
const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

before(async () => {
  await limpiarEmulador();
  const { crearApp } = await import('../src/app.js');
  await new Promise((resolver) => {
    servidor = crearApp().listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

test('GET /api/salud confirma conexión con Firestore', async () => {
  const { status, cuerpo } = await llamar('/salud');
  assert.equal(status, 200);
  assert.equal(cuerpo.datos.firestore, 'conectado');
});

test('GET /api/catalogos entrega categorías y estados', async () => {
  const { cuerpo } = await llamar('/catalogos');
  assert.ok(cuerpo.datos.categorias.some((c) => c.id === 'calles'));
  assert.ok(cuerpo.datos.estados.some((e) => e.id === 'recibida'));
});

test('POST /api/quejas rechaza un formulario vacío con errores por campo', async () => {
  const { status, cuerpo } = await llamar('/quejas', { method: 'POST', body: new FormData() });
  assert.equal(status, 400);
  assert.equal(cuerpo.error.codigo, 'VALIDACION');
  const campos = cuerpo.error.detalles.map((d) => d.campo);
  for (const c of ['categoria', 'asunto', 'descripcion', 'direccion', 'nombre', 'aceptaTerminos']) {
    assert.ok(campos.includes(c), `falta el error del campo ${c}`);
  }
});

test('POST /api/quejas valida correo y teléfono', async () => {
  const { status, cuerpo } = await llamar('/quejas', {
    method: 'POST',
    body: formularioValido({ correo: 'no-es-correo', telefono: '12' }),
  });
  assert.equal(status, 400);
  const campos = cuerpo.error.detalles.map((d) => d.campo);
  assert.deepEqual(campos.sort(), ['correo', 'telefono']);
});

test('POST /api/quejas rechaza archivos que no son imágenes aunque digan .jpg', async () => {
  const f = formularioValido();
  f.set('foto', new Blob(['esto no es una imagen'], { type: 'image/jpeg' }), 'falsa.jpg');
  const { status, cuerpo } = await llamar('/quejas', { method: 'POST', body: f });
  assert.equal(status, 400);
  assert.equal(cuerpo.error.detalles[0].campo, 'foto');
});

test('POST /api/quejas rechaza tipos de archivo no permitidos', async () => {
  const f = formularioValido();
  f.set('foto', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'documento.pdf');
  const { status } = await llamar('/quejas', { method: 'POST', body: f });
  assert.equal(status, 400);
});

test('POST /api/quejas registra la queja con foto y devuelve un folio', async () => {
  const f = formularioValido();
  f.set('foto', new Blob([await imagenDePrueba()], { type: 'image/jpeg' }), 'bache.jpg');
  const { status, cuerpo } = await llamar('/quejas', { method: 'POST', body: f });
  assert.equal(status, 201, JSON.stringify(cuerpo));
  assert.match(cuerpo.datos.folio, /^QC-\d{4}-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(cuerpo.datos.estado, 'recibida');
  assert.equal(cuerpo.datos.tieneFoto, true);
  folio = cuerpo.datos.folio;
});

test('POST /api/quejas permite quejas anónimas sin foto', async () => {
  const { status, cuerpo } = await llamar('/quejas', {
    method: 'POST',
    body: formularioValido({
      anonimo: 'on',
      nombre: undefined,
      correo: undefined,
      telefono: undefined,
      categoria: 'alumbrado',
      asunto: 'Lámpara apagada en el parque',
      descripcion: 'La lámpara del parque central lleva una semana apagada.',
    }),
  });
  assert.equal(status, 201);
  assert.equal(cuerpo.datos.tieneFoto, false);
});

test('GET /api/quejas/seguimiento/:folio no expone datos personales', async () => {
  const { status, cuerpo } = await llamar(`/quejas/seguimiento/${folio}`);
  assert.equal(status, 200);
  assert.equal(cuerpo.datos.estado, 'recibida');
  assert.equal(cuerpo.datos.ciudadano, undefined);
  assert.equal(cuerpo.datos.descripcion, undefined);
  assert.equal((await llamar('/quejas/seguimiento/QC-2026-ZZZZZZ')).status, 404);
  assert.equal((await llamar('/quejas/seguimiento/hola')).status, 400);
});

test('El panel exige iniciar sesión', async () => {
  assert.equal((await llamar('/admin/quejas')).status, 401);
  assert.equal((await llamar('/admin/quejas', { headers: { Authorization: 'Bearer token-falso' } })).status, 401);
  assert.equal((await llamar('/auth/login', json('POST', { usuario: 'admin', password: 'mala' }))).status, 401);

  const { status, cuerpo } = await llamar('/auth/login', json('POST', { usuario: 'admin', password: 'clave-de-prueba' }));
  assert.equal(status, 200);
  token = cuerpo.datos.token;
  assert.ok(token);
});

test('GET /api/admin/quejas lista, filtra y busca sin importar tildes', async () => {
  let r = await llamar('/admin/quejas', conToken());
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.paginacion.total, 2);

  r = await llamar('/admin/quejas?q=maria%20bache', conToken());
  assert.equal(r.cuerpo.datos.length, 1);
  assert.equal(r.cuerpo.datos[0].folio, folio);

  r = await llamar('/admin/quejas?categoria=alumbrado', conToken());
  assert.equal(r.cuerpo.paginacion.total, 1);

  r = await llamar('/admin/quejas?conFoto=si', conToken());
  assert.equal(r.cuerpo.paginacion.total, 1);

  r = await llamar('/admin/quejas?estado=inventado', conToken());
  assert.equal(r.status, 400);
});

test('GET /api/admin/quejas/:folio conserva la descripción original y los datos de contacto', async () => {
  const { status, cuerpo } = await llamar(`/admin/quejas/${folio}`, conToken());
  assert.equal(status, 200);
  assert.equal(cuerpo.datos.descripcion, DESCRIPCION);
  assert.equal(cuerpo.datos.ciudadano.nombre, 'María José López');
  assert.equal(cuerpo.datos.ciudadano.correo, 'maria.lopez@correo.com');
  assert.equal(cuerpo.datos.ciudadano.telefono, '55551234');
  assert.deepEqual(cuerpo.datos.ubicacion.coordenadas, { latitud: 14.6349, longitud: -90.5069 });
  assert.equal(cuerpo.datos.historial.length, 1);
});

test('GET /api/admin/quejas/:folio/foto devuelve la imagen comprimida desde Firestore', async () => {
  const { status, tipo, cuerpo } = await llamar(`/admin/quejas/${folio}/foto`, conToken());
  assert.equal(status, 200);
  assert.equal(tipo, 'image/jpeg');
  const meta = await sharp(cuerpo).metadata();
  assert.ok(meta.width <= 1600 && meta.height <= 1600);
  assert.ok(cuerpo.length < 750 * 1024);

  const mini = await llamar(`/admin/quejas/${folio}/foto?tamano=miniatura`, conToken());
  assert.equal(mini.tipo, 'image/webp');
});

test('PATCH /api/admin/quejas/:folio actualiza estado, prioridad e historial', async () => {
  let r = await llamar(`/admin/quejas/${folio}`, conToken(json('PATCH', { estado: 'resuelta' })));
  assert.equal(r.status, 400, 'resolver sin comentario debe fallar');

  r = await llamar(
    `/admin/quejas/${folio}`,
    conToken(json('PATCH', { estado: 'en_proceso', prioridad: 'alta', comentario: 'Se asignó una cuadrilla de bacheo.' }))
  );
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.datos.estado, 'en_proceso');
  assert.equal(r.cuerpo.datos.prioridad, 'alta');
  assert.equal(r.cuerpo.datos.historial.length, 3);
  assert.equal(r.cuerpo.datos.historial[1].usuario, 'Inspector de pruebas');

  r = await llamar(`/admin/quejas/${folio}`, conToken(json('PATCH', { estado: 'en_proceso' })));
  assert.equal(r.status, 400, 'sin cambios reales debe fallar');
});

test('El ciudadano ve el nuevo estado en el seguimiento', async () => {
  const { cuerpo } = await llamar(`/quejas/seguimiento/${folio}`);
  assert.equal(cuerpo.datos.estado, 'en_proceso');
  assert.equal(cuerpo.datos.historial.at(-1).comentario, 'Se asignó una cuadrilla de bacheo.');
});

test('GET /api/admin/estadisticas cuenta con agregaciones de Firestore', async () => {
  const { cuerpo } = await llamar('/admin/estadisticas', conToken());
  assert.equal(cuerpo.datos.total, 2);
  assert.equal(cuerpo.datos.porEstado.en_proceso, 1);
  assert.equal(cuerpo.datos.porEstado.recibida, 1);
  assert.equal(cuerpo.datos.porCategoria.calles, 1);
  assert.equal(cuerpo.datos.ultimas24h, 2);
});

test('Rutas inexistentes y JSON inválido responden con errores claros', async () => {
  assert.equal((await llamar('/no-existe')).status, 404);
  const r = await llamar('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
  assert.equal(r.status, 400);
  assert.equal(r.cuerpo.error.codigo, 'JSON_INVALIDO');
});
