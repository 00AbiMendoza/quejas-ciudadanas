/**
 * Recepción de la fotografía con multer.
 * Se guarda en memoria (no en disco) porque el backend la procesa y la envía a Firestore.
 */
import multer from 'multer';
import { config } from '../config/env.js';
import { TIPOS_FOTO_PERMITIDOS } from '../constants/catalogos.js';
import { ApiError } from '../utils/ApiError.js';

const receptor = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.fotos.maxBytes,
    files: 1,
    fields: 20,
    fieldSize: 16 * 1024,
  },
  fileFilter(_req, archivo, cb) {
    if (!TIPOS_FOTO_PERMITIDOS.includes(archivo.mimetype)) {
      return cb(
        ApiError.validacion(
          [{ campo: 'foto', mensaje: 'Formato no permitido. Usa una imagen JPG, PNG o WEBP.' }],
          'Formato de imagen no permitido.'
        )
      );
    }
    cb(null, true);
  },
});

/** Acepta un único archivo en el campo "foto" (opcional). */
export const subirFoto = receptor.single('foto');
