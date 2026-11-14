/**
 * Autenticación del personal municipal con JSON Web Tokens (JWT).
 * Las credenciales se definen en backend/.env (ADMIN_USER / ADMIN_PASSWORD).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const EMISOR = 'quejas-ciudadanas';

/** Compara dos textos en tiempo constante (evita ataques de temporización). */
function igualesSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function iniciarSesion(usuario, password) {
  if (!config.admin.password) {
    throw new ApiError(503, 'ADMIN_NO_CONFIGURADO', 'El acceso al panel no está configurado (falta ADMIN_PASSWORD en el servidor).');
  }
  if (!usuario || !password) {
    throw ApiError.validacion(
      [
        ...(!usuario ? [{ campo: 'usuario', mensaje: 'Ingresa tu usuario.' }] : []),
        ...(!password ? [{ campo: 'password', mensaje: 'Ingresa tu contraseña.' }] : []),
      ],
      'Ingresa usuario y contraseña.'
    );
  }

  const usuarioOk = igualesSeguro(String(usuario).trim().toLowerCase(), config.admin.usuario.toLowerCase());
  const passwordOk = igualesSeguro(password, config.admin.password);
  if (!(usuarioOk && passwordOk)) {
    throw new ApiError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.');
  }

  const perfil = { usuario: config.admin.usuario, nombre: config.admin.nombre, rol: 'admin' };
  const token = jwt.sign(perfil, config.jwt.secreto, {
    subject: perfil.usuario,
    issuer: EMISOR,
    expiresIn: config.jwt.expiracion,
  });
  const { exp } = jwt.decode(token);
  return { token, expira: new Date(exp * 1000).toISOString(), usuario: perfil };
}

export function verificarToken(token) {
  try {
    const datos = jwt.verify(token, config.jwt.secreto, { issuer: EMISOR });
    return { usuario: datos.usuario, nombre: datos.nombre, rol: datos.rol };
  } catch (error) {
    const mensaje =
      error.name === 'TokenExpiredError'
        ? 'Tu sesión expiró. Inicia sesión nuevamente.'
        : 'Sesión no válida. Inicia sesión nuevamente.';
    throw ApiError.noAutorizado(mensaje);
  }
}
