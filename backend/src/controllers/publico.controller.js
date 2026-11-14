/**
 * Controladores públicos (Portal ciudadano). No requieren iniciar sesión.
 */
import { CATEGORIAS, ESTADOS, PRIORIDADES } from '../constants/catalogos.js';
import { config } from '../config/env.js';
import { proyectoFirebase, usandoEmulador, verificarConexionFirestore } from '../config/firebase.js';
import { procesarFoto } from '../services/imagen.service.js';
import { consultarSeguimiento, crearQueja } from '../services/quejas.service.js';
import { validarFolio, validarNuevaQueja, LIMITES } from '../validators/queja.validator.js';

/** GET /api/catalogos — categorías, estados, prioridades y límites de los campos. */
export function catalogos(_req, res) {
  res.json({
    ok: true,
    datos: {
      categorias: CATEGORIAS,
      estados: ESTADOS,
      prioridades: PRIORIDADES,
      limites: { ...LIMITES, fotoMaxBytes: config.fotos.maxBytes },
    },
  });
}

/**
 * POST /api/quejas — registra una queja (multipart/form-data con la foto opcional).
 * Flujo: validar campos → procesar foto → guardar en Firestore → responder con el folio.
 */
export async function registrarQueja(req, res) {
  const datos = validarNuevaQueja(req.body);
  const foto = req.file ? await procesarFoto(req.file.buffer) : null;
  const queja = await crearQueja(datos, foto, { agente: req.get('user-agent') });

  res.status(201).location(`/api/quejas/seguimiento/${queja.folio}`).json({
    ok: true,
    mensaje: 'Tu queja fue registrada correctamente.',
    datos: queja,
  });
}

/** GET /api/quejas/seguimiento/:folio — estado actual e historial (sin datos personales). */
export async function seguimiento(req, res) {
  const folio = validarFolio(req.params.folio);
  res.json({ ok: true, datos: await consultarSeguimiento(folio) });
}

/** GET /api/salud — verifica que la API y Firestore respondan. */
export async function salud(_req, res) {
  const inicio = Date.now();
  try {
    await verificarConexionFirestore();
    res.json({
      ok: true,
      datos: {
        api: 'en línea',
        firestore: 'conectado',
        proyecto: proyectoFirebase,
        emulador: usandoEmulador,
        latenciaMs: Date.now() - inicio,
      },
    });
  } catch {
    res.status(503).json({
      ok: false,
      error: { codigo: 'BD_NO_DISPONIBLE', mensaje: 'La API funciona, pero no hay conexión con Firestore.' },
    });
  }
}
