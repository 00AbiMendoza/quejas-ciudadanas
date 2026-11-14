import { verificarToken } from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';

/** Exige un token JWT válido en el encabezado Authorization: Bearer <token>. */
export function requiereAdmin(req, _res, next) {
  const [esquema, token] = (req.get('authorization') || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return next(ApiError.noAutorizado());
  }
  req.usuario = verificarToken(token);
  next();
}
