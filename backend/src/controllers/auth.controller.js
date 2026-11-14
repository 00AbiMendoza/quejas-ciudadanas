import { iniciarSesion } from '../services/auth.service.js';

/** POST /api/auth/login — { usuario, password } → { token, expira, usuario } */
export function login(req, res) {
  const { usuario, password } = req.body ?? {};
  const sesion = iniciarSesion(usuario, password);
  res.json({ ok: true, datos: sesion });
}

/** GET /api/auth/sesion — confirma que el token sigue siendo válido. */
export function sesionActual(req, res) {
  res.json({ ok: true, datos: { usuario: req.usuario } });
}
