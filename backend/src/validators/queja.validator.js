/**
 * Validaciones del lado del servidor.
 * El frontend también valida, pero el backend NUNCA confía en los datos que recibe:
 * todo se revisa, se limpia y se normaliza aquí antes de llegar a Firebase.
 *
 * Cada función devuelve los datos ya limpios o lanza ApiError.validacion(detalles),
 * donde detalles = [{ campo, mensaje }] para que el frontend marque cada campo.
 */
import {
  IDS_CATEGORIAS,
  IDS_ESTADOS,
  IDS_PRIORIDADES,
  ESTADOS_QUE_REQUIEREN_COMENTARIO,
  PATRON_FOLIO,
} from '../constants/catalogos.js';
import { ApiError } from '../utils/ApiError.js';
import { aBooleano, limpiarLinea, limpiarParrafo } from '../utils/texto.js';

export const LIMITES = Object.freeze({
  asunto: { min: 5, max: 100 },
  descripcion: { min: 20, max: 2000 },
  direccion: { min: 5, max: 200 },
  zona: { max: 80 },
  referencia: { max: 200 },
  nombre: { min: 3, max: 100 },
  correo: { max: 120 },
  comentario: { max: 1000 },
  busqueda: { max: 100 },
});

const PATRON_NOMBRE = /^\p{L}[\p{L}\s.'-]*$/u;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PATRON_TELEFONO = /^\+?\d{8,15}$/;

/** Acumulador de errores por campo. */
function crearValidador() {
  const errores = [];
  return {
    errores,
    error(campo, mensaje) {
      if (!errores.some((e) => e.campo === campo)) errores.push({ campo, mensaje });
    },
    /** etiqueta: "El asunto", "La descripción"… (femenino ajusta "obligatorio/a"). */
    longitud(campo, valor, { min, max }, etiqueta, { requerido = true, femenino = false } = {}) {
      if (!valor) {
        if (requerido) this.error(campo, `${etiqueta} es ${femenino ? 'obligatoria' : 'obligatorio'}.`);
        return;
      }
      if (min && valor.length < min) this.error(campo, `${etiqueta} debe tener al menos ${min} caracteres.`);
      else if (max && valor.length > max) this.error(campo, `${etiqueta} no puede superar ${max} caracteres.`);
    },
    lanzarSiHayErrores() {
      if (errores.length) throw ApiError.validacion(errores);
    },
  };
}

function numeroOpcional(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Valida el formulario del portal ciudadano (multipart/form-data).
 * @returns datos limpios listos para guardarse.
 */
export function validarNuevaQueja(cuerpo = {}) {
  const v = crearValidador();

  // Campo trampa (honeypot): invisible para personas, los bots suelen llenarlo.
  if (limpiarLinea(cuerpo.sitioWeb)) {
    throw new ApiError(400, 'SOLICITUD_RECHAZADA', 'No fue posible procesar la solicitud.');
  }

  const categoria = limpiarLinea(cuerpo.categoria);
  const asunto = limpiarLinea(cuerpo.asunto);
  const descripcion = limpiarParrafo(cuerpo.descripcion);
  const direccion = limpiarLinea(cuerpo.direccion);
  const zona = limpiarLinea(cuerpo.zona);
  const referencia = limpiarLinea(cuerpo.referencia);
  const anonimo = aBooleano(cuerpo.anonimo);
  const nombre = anonimo ? '' : limpiarLinea(cuerpo.nombre);
  const correo = anonimo ? '' : limpiarLinea(cuerpo.correo).toLowerCase();
  const telefono = anonimo ? '' : limpiarLinea(cuerpo.telefono).replace(/[\s()-]/g, '');
  const latitud = numeroOpcional(cuerpo.latitud);
  const longitud = numeroOpcional(cuerpo.longitud);

  // ¿Qué pasó?
  if (!categoria) v.error('categoria', 'Selecciona la categoría del problema.');
  else if (!IDS_CATEGORIAS.has(categoria)) v.error('categoria', 'La categoría seleccionada no es válida.');
  v.longitud('asunto', asunto, LIMITES.asunto, 'El asunto');
  v.longitud('descripcion', descripcion, LIMITES.descripcion, 'La descripción', { femenino: true });

  // ¿Dónde?
  v.longitud('direccion', direccion, LIMITES.direccion, 'La dirección', { femenino: true });
  v.longitud('zona', zona, LIMITES.zona, 'La zona o colonia', { requerido: false });
  v.longitud('referencia', referencia, LIMITES.referencia, 'La referencia', { requerido: false });

  const hayLat = latitud !== null;
  const hayLng = longitud !== null;
  if (hayLat !== hayLng) {
    v.error('ubicacion', 'La ubicación GPS está incompleta.');
  } else if (hayLat && (Number.isNaN(latitud) || latitud < -90 || latitud > 90 || Number.isNaN(longitud) || longitud < -180 || longitud > 180)) {
    v.error('ubicacion', 'Las coordenadas GPS no son válidas.');
  }

  // ¿Quién reporta?
  if (!anonimo) {
    v.longitud('nombre', nombre, LIMITES.nombre, 'El nombre');
    if (nombre && !PATRON_NOMBRE.test(nombre)) v.error('nombre', 'El nombre solo puede contener letras y espacios.');

    if (!correo && !telefono) {
      v.error('correo', 'Ingresa un correo o un teléfono para poder contactarte.');
    }
    if (correo && (correo.length > LIMITES.correo.max || !PATRON_CORREO.test(correo))) {
      v.error('correo', 'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).');
    }
    if (telefono && !PATRON_TELEFONO.test(telefono)) {
      v.error('telefono', 'El teléfono debe tener entre 8 y 15 dígitos.');
    }
  }

  if (!aBooleano(cuerpo.aceptaTerminos)) {
    v.error('aceptaTerminos', 'Debes aceptar el uso de tus datos para registrar la queja.');
  }

  v.lanzarSiHayErrores();

  return {
    categoria,
    asunto,
    descripcion,
    ubicacion: {
      direccion,
      zona: zona || null,
      referencia: referencia || null,
      coordenadas: hayLat ? { latitud, longitud } : null,
    },
    ciudadano: {
      anonimo,
      nombre: nombre || null,
      correo: correo || null,
      telefono: telefono || null,
    },
  };
}

/** Valida y normaliza los filtros del listado del panel (query string). */
export function validarFiltros(query = {}) {
  const v = crearValidador();
  const filtros = {
    q: limpiarLinea(query.q).slice(0, LIMITES.busqueda.max),
    estado: limpiarLinea(query.estado),
    categoria: limpiarLinea(query.categoria),
    prioridad: limpiarLinea(query.prioridad),
    conFoto: limpiarLinea(query.conFoto),
    desde: null,
    hasta: null,
    orden: limpiarLinea(query.orden) || 'recientes',
    pagina: Number.parseInt(query.pagina, 10) || 1,
    limite: Number.parseInt(query.limite, 10) || 10,
  };

  if (filtros.estado && !IDS_ESTADOS.has(filtros.estado)) v.error('estado', 'Estado no válido.');
  if (filtros.categoria && !IDS_CATEGORIAS.has(filtros.categoria)) v.error('categoria', 'Categoría no válida.');
  if (filtros.prioridad && !IDS_PRIORIDADES.has(filtros.prioridad)) v.error('prioridad', 'Prioridad no válida.');
  if (filtros.conFoto && !['si', 'no'].includes(filtros.conFoto)) v.error('conFoto', 'Use "si" o "no".');
  if (!['recientes', 'antiguas', 'prioridad', 'actualizadas'].includes(filtros.orden)) v.error('orden', 'Orden no válido.');

  for (const campo of ['desde', 'hasta']) {
    if (query[campo]) {
      const fecha = new Date(String(query[campo]));
      if (Number.isNaN(fecha.getTime())) v.error(campo, 'Fecha no válida (use formato ISO 8601).');
      else filtros[campo] = fecha;
    }
  }
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    v.error('hasta', 'La fecha final debe ser posterior a la inicial.');
  }

  filtros.pagina = Math.max(1, filtros.pagina);
  filtros.limite = Math.min(50, Math.max(1, filtros.limite));

  v.lanzarSiHayErrores();
  return filtros;
}

/** Valida los cambios que el personal municipal hace a una queja. */
export function validarActualizacion(cuerpo = {}) {
  const v = crearValidador();
  const estado = limpiarLinea(cuerpo.estado);
  const prioridad = limpiarLinea(cuerpo.prioridad);
  const comentario = limpiarParrafo(cuerpo.comentario);

  if (!estado && !prioridad && !comentario) {
    throw ApiError.validacion([], 'No se indicó ningún cambio.');
  }
  if (estado && !IDS_ESTADOS.has(estado)) v.error('estado', 'Estado no válido.');
  if (prioridad && !IDS_PRIORIDADES.has(prioridad)) v.error('prioridad', 'Prioridad no válida.');
  v.longitud('comentario', comentario, LIMITES.comentario, 'El comentario', { requerido: false });
  if (estado && ESTADOS_QUE_REQUIEREN_COMENTARIO.includes(estado) && !comentario) {
    v.error('comentario', 'Agrega un comentario explicando la resolución para el ciudadano.');
  }

  v.lanzarSiHayErrores();
  return { estado: estado || null, prioridad: prioridad || null, comentario: comentario || null };
}

/** Valida el formato del folio (también es el ID del documento en Firestore). */
export function validarFolio(folio) {
  const limpio = limpiarLinea(folio).toUpperCase();
  if (!PATRON_FOLIO.test(limpio)) {
    throw ApiError.validacion(
      [{ campo: 'folio', mensaje: 'El folio debe tener el formato QC-2026-XXXXXX.' }],
      'El folio ingresado no tiene un formato válido.'
    );
  }
  return limpio;
}
