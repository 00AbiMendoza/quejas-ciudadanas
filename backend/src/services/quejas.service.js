/**
 * Capa de servicio: toda la lógica de negocio y el acceso a Cloud Firestore.
 *
 * Estructura de datos en Firestore
 * ─────────────────────────────────
 * quejas/{folio}                 Documento principal (liviano, sin la imagen)
 *   folio, categoria, asunto, descripcion,
 *   ubicacion { direccion, zona, referencia, coordenadas { latitud, longitud } },
 *   ciudadano { anonimo, nombre, correo, telefono },
 *   estado, prioridad, tieneFoto, foto { mime, ancho, alto, bytes },
 *   historial [ { tipo, estado, estadoAnterior, comentario, usuario, fecha } ],
 *   fechaCreacion, fechaActualizacion, origen { canal, agente }
 *
 * quejas_fotos/{folio}           Fotografía separada para no cargarla en los listados
 *   imagen (Bytes), miniatura (Bytes), mime, ancho, alto, bytes, original { … }, fechaCreacion
 *
 * El folio (p. ej. QC-2026-7KX3PM) es también el ID del documento: así la consulta
 * pública de seguimiento es una lectura directa y no se puede adivinar el siguiente folio.
 */
import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import {
  CATEGORIAS,
  ESTADOS,
  ESTADO_INICIAL,
  PRIORIDAD_INICIAL,
} from '../constants/catalogos.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizar } from '../utils/texto.js';

export const COLECCION_QUEJAS = 'quejas';
export const COLECCION_FOTOS = 'quejas_fotos';

const quejas = () => db.collection(COLECCION_QUEJAS);
const fotos = () => db.collection(COLECCION_FOTOS);

const ALFABETO_FOLIO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos, sin 0/O ni 1/I
const CODIGO_YA_EXISTE = 6; // gRPC ALREADY_EXISTS
const PESO_PRIORIDAD = { alta: 3, media: 2, baja: 1 };

function generarFolio(fecha) {
  const bytes = crypto.randomBytes(6);
  let codigo = '';
  for (const b of bytes) codigo += ALFABETO_FOLIO[b % ALFABETO_FOLIO.length];
  return `QC-${fecha.getFullYear()}-${codigo}`;
}

const aISO = (valor) => (valor instanceof Timestamp ? valor.toDate().toISOString() : valor ?? null);

function serializarHistorial(historial = []) {
  return historial.map((h) => ({ ...h, fecha: aISO(h.fecha) }));
}

/** Convierte un documento de Firestore en un objeto JSON para la API. */
function serializarQueja(doc, { completo = false } = {}) {
  const d = doc.data();
  const base = {
    id: doc.id,
    folio: d.folio,
    categoria: d.categoria,
    asunto: d.asunto,
    descripcion: d.descripcion,
    ubicacion: d.ubicacion,
    estado: d.estado,
    prioridad: d.prioridad,
    tieneFoto: Boolean(d.tieneFoto),
    ciudadano: {
      anonimo: Boolean(d.ciudadano?.anonimo),
      nombre: d.ciudadano?.nombre ?? null,
    },
    fechaCreacion: aISO(d.fechaCreacion),
    fechaActualizacion: aISO(d.fechaActualizacion),
  };
  if (!completo) return base;
  return {
    ...base,
    ciudadano: d.ciudadano,
    foto: d.foto ?? null,
    historial: serializarHistorial(d.historial),
    origen: d.origen ?? null,
  };
}

/**
 * Registra una queja nueva (y su fotografía, si viene) en una sola operación atómica.
 * @param {object} datos  Datos ya validados por validarNuevaQueja().
 * @param {object|null} foto Resultado de procesarFoto() o null.
 * @param {object} origen Información técnica de la solicitud.
 */
export async function crearQueja(datos, foto, origen = {}) {
  const ahora = Timestamp.now();

  for (let intento = 0; intento < 5; intento++) {
    const folio = generarFolio(ahora.toDate());
    const queja = {
      folio,
      ...datos,
      estado: ESTADO_INICIAL,
      prioridad: PRIORIDAD_INICIAL,
      tieneFoto: Boolean(foto),
      foto: foto ? { mime: foto.mime, ancho: foto.ancho, alto: foto.alto, bytes: foto.bytes } : null,
      historial: [
        {
          tipo: 'estado',
          estado: ESTADO_INICIAL,
          estadoAnterior: null,
          comentario: 'Queja registrada desde el portal ciudadano.',
          usuario: 'Sistema',
          fecha: ahora,
        },
      ],
      fechaCreacion: ahora,
      fechaActualizacion: ahora,
      origen: { canal: 'portal_web', agente: (origen.agente || '').slice(0, 200) || null },
    };

    // Batch = escritura atómica: se guardan ambos documentos o ninguno.
    const lote = db.batch();
    lote.create(quejas().doc(folio), queja);
    if (foto) {
      lote.create(fotos().doc(folio), {
        imagen: foto.imagen,
        miniatura: foto.miniatura,
        mime: foto.mime,
        ancho: foto.ancho,
        alto: foto.alto,
        bytes: foto.bytes,
        original: foto.original,
        fechaCreacion: ahora,
      });
    }

    try {
      await lote.commit();
      return {
        id: folio,
        folio,
        estado: ESTADO_INICIAL,
        categoria: datos.categoria,
        asunto: datos.asunto,
        tieneFoto: Boolean(foto),
        fechaCreacion: ahora.toDate().toISOString(),
      };
    } catch (error) {
      if (error.code === CODIGO_YA_EXISTE) continue; // Folio repetido (muy improbable): se genera otro.
      throw error;
    }
  }
  throw new ApiError(500, 'FOLIO_NO_GENERADO', 'No fue posible generar un folio único. Intenta nuevamente.');
}

/** Consulta pública de seguimiento: NO expone datos personales ni la descripción. */
export async function consultarSeguimiento(folio) {
  const doc = await quejas().doc(folio).get();
  if (!doc.exists) throw ApiError.noEncontrado('No encontramos ninguna queja con ese folio. Verifica que esté bien escrito.');
  const d = doc.data();
  return {
    folio: d.folio,
    categoria: d.categoria,
    asunto: d.asunto,
    estado: d.estado,
    fechaCreacion: aISO(d.fechaCreacion),
    fechaActualizacion: aISO(d.fechaActualizacion),
    historial: (d.historial || [])
      .filter((h) => h.tipo === 'estado')
      .map((h) => ({ estado: h.estado, comentario: h.comentario ?? null, fecha: aISO(h.fecha) })),
  };
}

/**
 * Listado para el Panel de Administración con filtros, búsqueda y paginación.
 *
 * Los filtros de igualdad (estado, categoría, prioridad) se resuelven en Firestore,
 * que los atiende con sus índices automáticos (sin crear índices compuestos).
 * La búsqueda de texto, el rango de fechas, el orden y la paginación se aplican en
 * el backend, porque Firestore no ofrece búsqueda de texto completo.
 */
export async function listarQuejas(filtros) {
  let consulta = quejas();
  if (filtros.estado) consulta = consulta.where('estado', '==', filtros.estado);
  if (filtros.categoria) consulta = consulta.where('categoria', '==', filtros.categoria);
  if (filtros.prioridad) consulta = consulta.where('prioridad', '==', filtros.prioridad);

  const instantanea = await consulta
    .select(
      'folio', 'categoria', 'asunto', 'descripcion', 'ubicacion', 'estado', 'prioridad',
      'tieneFoto', 'ciudadano.anonimo', 'ciudadano.nombre', 'fechaCreacion', 'fechaActualizacion'
    )
    .get();

  let lista = instantanea.docs.map((doc) => serializarQueja(doc));

  if (filtros.conFoto) {
    const quiere = filtros.conFoto === 'si';
    lista = lista.filter((q) => q.tieneFoto === quiere);
  }
  if (filtros.desde) lista = lista.filter((q) => new Date(q.fechaCreacion) >= filtros.desde);
  if (filtros.hasta) lista = lista.filter((q) => new Date(q.fechaCreacion) <= filtros.hasta);
  if (filtros.q) {
    const terminos = normalizar(filtros.q).split(/\s+/).filter(Boolean);
    lista = lista.filter((q) => {
      const texto = normalizar(
        [q.folio, q.asunto, q.descripcion, q.ubicacion?.direccion, q.ubicacion?.zona, q.ciudadano?.nombre].join(' ')
      );
      return terminos.every((t) => texto.includes(t));
    });
  }

  const porFecha = (campo) => (a, b) => new Date(b[campo]) - new Date(a[campo]);
  const comparadores = {
    recientes: porFecha('fechaCreacion'),
    antiguas: (a, b) => porFecha('fechaCreacion')(b, a),
    actualizadas: porFecha('fechaActualizacion'),
    prioridad: (a, b) =>
      (PESO_PRIORIDAD[b.prioridad] || 0) - (PESO_PRIORIDAD[a.prioridad] || 0) || porFecha('fechaCreacion')(a, b),
  };
  lista.sort(comparadores[filtros.orden]);

  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / filtros.limite));
  const pagina = Math.min(filtros.pagina, paginas);
  const inicio = (pagina - 1) * filtros.limite;

  return {
    datos: lista.slice(inicio, inicio + filtros.limite).map((q) => ({
      ...q,
      // El listado muestra un extracto; la descripción completa se ve en el detalle.
      descripcion: q.descripcion.length > 160 ? `${q.descripcion.slice(0, 160)}…` : q.descripcion,
    })),
    paginacion: { total, pagina, paginas, limite: filtros.limite },
  };
}

/** Detalle completo de una queja (incluye datos de contacto e historial). */
export async function obtenerQueja(folio) {
  const doc = await quejas().doc(folio).get();
  if (!doc.exists) throw ApiError.noEncontrado('La queja solicitada no existe.');
  return serializarQueja(doc, { completo: true });
}

/** Devuelve la fotografía (completa o miniatura) asociada a una queja. */
export async function obtenerFoto(folio, tamano = 'completa') {
  const doc = await fotos().doc(folio).get();
  if (!doc.exists) throw ApiError.noEncontrado('Esta queja no tiene fotografía adjunta.');
  const d = doc.data();
  if (tamano === 'miniatura' && d.miniatura) {
    return { buffer: Buffer.from(d.miniatura), mime: 'image/webp' };
  }
  return { buffer: Buffer.from(d.imagen), mime: d.mime || 'image/jpeg' };
}

/**
 * Cambia estado y/o prioridad, o agrega una nota. Usa una transacción para que dos
 * personas del personal municipal no se sobrescriban el historial entre sí.
 */
export async function actualizarQueja(folio, cambios, usuario) {
  const ref = quejas().doc(folio);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw ApiError.noEncontrado('La queja solicitada no existe.');
    const actual = doc.data();
    const ahora = Timestamp.now();
    const historial = [...(actual.historial || [])];
    const actualizacion = { fechaActualizacion: ahora };

    const cambiaEstado = cambios.estado && cambios.estado !== actual.estado;
    const cambiaPrioridad = cambios.prioridad && cambios.prioridad !== actual.prioridad;

    if (!cambiaEstado && !cambiaPrioridad && !cambios.comentario) {
      throw ApiError.validacion([], 'Los valores enviados son iguales a los actuales: no hay cambios que guardar.');
    }

    if (cambiaEstado) {
      actualizacion.estado = cambios.estado;
      historial.push({
        tipo: 'estado',
        estado: cambios.estado,
        estadoAnterior: actual.estado,
        comentario: cambios.comentario,
        usuario,
        fecha: ahora,
      });
    } else if (cambios.comentario) {
      historial.push({ tipo: 'nota', estado: actual.estado, comentario: cambios.comentario, usuario, fecha: ahora });
    }

    if (cambiaPrioridad) {
      actualizacion.prioridad = cambios.prioridad;
      historial.push({
        tipo: 'prioridad',
        prioridad: cambios.prioridad,
        prioridadAnterior: actual.prioridad ?? null,
        usuario,
        fecha: ahora,
      });
    }

    actualizacion.historial = historial;
    tx.update(ref, actualizacion);
  });

  return obtenerQueja(folio);
}

/**
 * Indicadores del panel usando consultas de agregación count() de Firestore:
 * se cuentan los documentos en el servidor de Google sin descargarlos.
 */
export async function obtenerEstadisticas() {
  const contar = async (consulta) => (await consulta.count().get()).data().count;
  const hace = (horas) => Timestamp.fromMillis(Date.now() - horas * 3_600_000);

  const [total, ultimas24h, ultimos7d, porEstado, porCategoria] = await Promise.all([
    contar(quejas()),
    contar(quejas().where('fechaCreacion', '>=', hace(24))),
    contar(quejas().where('fechaCreacion', '>=', hace(24 * 7))),
    Promise.all(ESTADOS.map((e) => contar(quejas().where('estado', '==', e.id)))),
    Promise.all(CATEGORIAS.map((c) => contar(quejas().where('categoria', '==', c.id)))),
  ]);

  return {
    total,
    ultimas24h,
    ultimos7d,
    porEstado: Object.fromEntries(ESTADOS.map((e, i) => [e.id, porEstado[i]])),
    porCategoria: Object.fromEntries(CATEGORIAS.map((c, i) => [c.id, porCategoria[i]])),
    generado: new Date().toISOString(),
  };
}
