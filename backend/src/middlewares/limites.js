/**
 * Límites de solicitudes por IP para evitar abuso (spam de quejas o fuerza bruta en el login).
 */
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';

const responder = (mensaje) => (_req, res, _next, opciones) =>
  res.status(opciones.statusCode).json({ ok: false, error: { codigo: 'DEMASIADAS_SOLICITUDES', mensaje } });

const desactivado = config.entorno === 'test';

export const limiteNuevasQuejas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => desactivado,
  handler: responder('Has enviado demasiadas quejas en poco tiempo. Espera unos minutos e intenta de nuevo.'),
});

export const limiteLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => desactivado,
  handler: responder('Demasiados intentos de inicio de sesión. Espera 10 minutos.'),
});

export const limiteGeneral = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => desactivado,
  handler: responder('Demasiadas solicitudes. Espera un momento.'),
});
