/**
 * Manejo centralizado de errores: toda falla termina en una respuesta JSON con el
 * mismo formato, un código HTTP correcto y un mensaje comprensible para el usuario.
 */
import multer from 'multer';
import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const MB = (bytes) => Math.round(bytes / (1024 * 1024));

/** Códigos gRPC de Firestore que indican problemas de conexión/configuración. */
const ERRORES_FIRESTORE = {
  5: 'La base de datos de Firestore no existe. Créala en la consola de Firebase (ver README).', // NOT_FOUND
  7: 'La cuenta de servicio no tiene permisos sobre Firestore.', // PERMISSION_DENIED
  8: 'Se alcanzó la cuota gratuita diaria de Firebase. Intenta más tarde.', // RESOURCE_EXHAUSTED
  14: 'No fue posible conectar con Firebase. Verifica la conexión a internet.', // UNAVAILABLE
  16: 'Las credenciales de Firebase no son válidas.', // UNAUTHENTICATED
};

function traducirError(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'ARCHIVO_MUY_GRANDE', `La fotografía supera el tamaño máximo de ${MB(config.fotos.maxBytes)} MB.`, [
        { campo: 'foto', mensaje: `La fotografía supera el tamaño máximo de ${MB(config.fotos.maxBytes)} MB.` },
      ]);
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
      return ApiError.validacion([{ campo: 'foto', mensaje: 'Solo se permite adjuntar una fotografía.' }]);
    }
    return new ApiError(400, 'FORMULARIO_INVALIDO', 'El formulario enviado no es válido.');
  }

  if (error.type === 'entity.parse.failed') {
    return new ApiError(400, 'JSON_INVALIDO', 'El cuerpo de la solicitud no es un JSON válido.');
  }
  if (error.type === 'entity.too.large') {
    return new ApiError(413, 'SOLICITUD_MUY_GRANDE', 'La solicitud es demasiado grande.');
  }

  if (typeof error.code === 'number' && ERRORES_FIRESTORE[error.code]) {
    return new ApiError(503, 'BD_NO_DISPONIBLE', ERRORES_FIRESTORE[error.code]);
  }

  return new ApiError(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado en el servidor. Intenta de nuevo.');
}

/** Rutas /api que no existen. */
export function rutaNoEncontrada(req, _res, next) {
  next(ApiError.noEncontrado(`La ruta ${req.method} ${req.originalUrl} no existe en la API.`));
}

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(error, req, res, _next) {
  const apiError = traducirError(error);

  if (apiError.status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} →`, error);
  }

  res.status(apiError.status).json({
    ok: false,
    error: {
      codigo: apiError.codigo,
      mensaje: apiError.message,
      ...(apiError.detalles?.length ? { detalles: apiError.detalles } : {}),
    },
  });
}
