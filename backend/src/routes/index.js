/**
 * Definición de rutas de la API REST.
 *
 *  Público (Portal ciudadano)
 *    GET    /api/salud
 *    GET    /api/catalogos
 *    POST   /api/quejas                         (multipart: campos + foto)
 *    GET    /api/quejas/seguimiento/:folio
 *
 *  Autenticación
 *    POST   /api/auth/login
 *    GET    /api/auth/sesion                    (JWT)
 *
 *  Panel de Administración (JWT)
 *    GET    /api/admin/estadisticas
 *    GET    /api/admin/quejas
 *    GET    /api/admin/quejas/:folio
 *    GET    /api/admin/quejas/:folio/foto
 *    PATCH  /api/admin/quejas/:folio
 */
import { Router } from 'express';
import * as publico from '../controllers/publico.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as auth from '../controllers/auth.controller.js';
import { requiereAdmin } from '../middlewares/autenticacion.js';
import { subirFoto } from '../middlewares/subirFoto.js';
import { limiteLogin, limiteNuevasQuejas } from '../middlewares/limites.js';

const rutas = Router();

// ── Público ──────────────────────────────────────────────
rutas.get('/salud', publico.salud);
rutas.get('/catalogos', publico.catalogos);
rutas.post('/quejas', limiteNuevasQuejas, subirFoto, publico.registrarQueja);
rutas.get('/quejas/seguimiento/:folio', publico.seguimiento);

// ── Autenticación ────────────────────────────────────────
rutas.post('/auth/login', limiteLogin, auth.login);
rutas.get('/auth/sesion', requiereAdmin, auth.sesionActual);

// ── Panel de Administración ──────────────────────────────
const panel = Router();
panel.use(requiereAdmin);
panel.get('/estadisticas', admin.estadisticas);
panel.get('/quejas', admin.listar);
panel.get('/quejas/:folio', admin.detalle);
panel.get('/quejas/:folio/foto', admin.foto);
panel.patch('/quejas/:folio', admin.actualizar);
rutas.use('/admin', panel);

export default rutas;
