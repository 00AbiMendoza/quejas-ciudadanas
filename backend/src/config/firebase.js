/**
 * Inicialización de Firebase Admin SDK y Cloud Firestore.
 *
 * El backend es el ÚNICO que se comunica con Firebase: el navegador nunca recibe
 * credenciales. Las reglas de seguridad de Firestore (firestore.rules) bloquean
 * cualquier acceso directo desde clientes.
 *
 * Formas de proporcionar credenciales (en orden de prioridad):
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  → contenido JSON de la cuenta de servicio (útil en Render/Railway).
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH  → ruta al archivo .json descargado desde la consola de Firebase.
 *   3. FIRESTORE_EMULATOR_HOST        → emulador local de Firestore (desarrollo y pruebas).
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config, RAIZ_BACKEND } from './env.js';

function leerCuentaDeServicio() {
  const { credencialesJson, credencialesRuta } = config.firebase;

  if (credencialesJson) {
    try {
      return JSON.parse(credencialesJson);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene un JSON válido.');
    }
  }

  if (credencialesRuta) {
    const ruta = path.resolve(RAIZ_BACKEND, credencialesRuta);
    if (!fs.existsSync(ruta)) {
      throw new Error(
        `No se encontró el archivo de credenciales de Firebase en: ${ruta}\n` +
          '   Descárgalo en Consola de Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.'
      );
    }
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  }

  return null;
}

function opcionesDeInicializacion() {
  const cuenta = leerCuentaDeServicio();
  if (cuenta) {
    return { credential: cert(cuenta), projectId: cuenta.project_id };
  }
  if (config.firebase.emulador) {
    // El emulador no necesita credenciales reales. Los proyectos "demo-*" nunca tocan la nube.
    return { projectId: config.firebase.projectId || 'demo-quejas' };
  }
  throw new Error(
    'Faltan las credenciales de Firebase.\n' +
      '   Define FIREBASE_SERVICE_ACCOUNT_PATH en backend/.env (ver README.md, sección "Configurar Firebase").'
  );
}

const app = getApps()[0] ?? initializeApp(opcionesDeInicializacion());

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

export const proyectoFirebase = app.options.projectId;
export const usandoEmulador = Boolean(config.firebase.emulador);

/** Comprueba que Firestore responde (se usa al iniciar y en /api/salud). */
export async function verificarConexionFirestore() {
  await db.collection('quejas').limit(1).get();
  return true;
}
