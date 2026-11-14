/**
 * Error de la API con código HTTP y código interno.
 * El middleware manejadorErrores lo transforma en una respuesta JSON uniforme:
 *   { ok: false, error: { codigo, mensaje, detalles? } }
 */
export class ApiError extends Error {
  /**
   * @param {number} status   Código HTTP (400, 401, 404…)
   * @param {string} codigo   Código legible por máquina (VALIDACION, NO_ENCONTRADO…)
   * @param {string} mensaje  Mensaje para mostrar al usuario
   * @param {Array<{campo: string, mensaje: string}>} [detalles] Errores por campo
   */
  constructor(status, codigo, mensaje, detalles) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  static validacion(detalles, mensaje = 'Revisa los datos ingresados: hay campos con errores.') {
    return new ApiError(400, 'VALIDACION', mensaje, detalles);
  }

  static noAutorizado(mensaje = 'Debes iniciar sesión para continuar.') {
    return new ApiError(401, 'NO_AUTORIZADO', mensaje);
  }

  static noEncontrado(mensaje = 'El recurso solicitado no existe.') {
    return new ApiError(404, 'NO_ENCONTRADO', mensaje);
  }

  static servicioNoDisponible(mensaje = 'No fue posible conectar con la base de datos. Intenta de nuevo en unos minutos.') {
    return new ApiError(503, 'BD_NO_DISPONIBLE', mensaje);
  }
}
