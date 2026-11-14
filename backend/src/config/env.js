/**
 * Configuración central de la aplicación.
 * Lee las variables de entorno (archivo backend/.env) y las expone con valores por defecto seguros.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Carpeta raíz del backend (…/backend) sin importar desde dónde se ejecute `node`. */
export const RAIZ_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Carpeta con los archivos estáticos del frontend (…/frontend). */
export const RAIZ_FRONTEND = path.resolve(RAIZ_BACKEND, '..', 'frontend');

dotenv.config({ path: path.join(RAIZ_BACKEND, '.env'), quiet: true });

const entero = (valor, porDefecto) => {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

const lista = (valor) =>
  (valor || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const entorno = process.env.NODE_ENV || 'development';

let jwtSecreto = process.env.JWT_SECRET;
if (!jwtSecreto) {
  jwtSecreto = crypto.randomBytes(32).toString('hex');
  if (entorno !== 'test') {
    console.warn(
      '⚠️  JWT_SECRET no está definido en .env: se generó uno temporal. ' +
        'Las sesiones del panel se cerrarán cada vez que reinicie el servidor.'
    );
  }
}

export const config = {
  entorno,
  esProduccion: entorno === 'production',
  puerto: entero(process.env.PORT, 3000),
  /** Número de proxies de confianza (Render, Railway, etc.). 0 en local. */
  trustProxy: entero(process.env.TRUST_PROXY, 0),
  /** Orígenes permitidos para CORS (solo si el frontend se publica en otro dominio). */
  corsOrigenes: lista(process.env.CORS_ORIGINS),

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    credencialesRuta: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    credencialesJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    emulador: process.env.FIRESTORE_EMULATOR_HOST,
  },

  admin: {
    usuario: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
    nombre: process.env.ADMIN_NAME || 'Administrador municipal',
  },

  jwt: {
    secreto: jwtSecreto,
    expiracion: process.env.JWT_EXPIRES_IN || '8h',
  },

  fotos: {
    /** Tamaño máximo del archivo que sube el ciudadano (antes de comprimir). */
    maxBytes: entero(process.env.MAX_FOTO_MB, 5) * 1024 * 1024,
  },
};
