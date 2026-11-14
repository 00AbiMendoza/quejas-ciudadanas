/**
 * Controladores del Panel de Administración Municipal (requieren token JWT).
 */
import {
  actualizarQueja,
  listarQuejas,
  obtenerEstadisticas,
  obtenerFoto,
  obtenerQueja,
} from '../services/quejas.service.js';
import { validarActualizacion, validarFiltros, validarFolio } from '../validators/queja.validator.js';

/** GET /api/admin/quejas?q=&estado=&categoria=&prioridad=&conFoto=&desde=&hasta=&orden=&pagina=&limite= */
export async function listar(req, res) {
  const filtros = validarFiltros(req.query);
  const { datos, paginacion } = await listarQuejas(filtros);
  res.json({ ok: true, datos, paginacion });
}

/** GET /api/admin/quejas/:folio — detalle completo con historial y contacto. */
export async function detalle(req, res) {
  const folio = validarFolio(req.params.folio);
  res.json({ ok: true, datos: await obtenerQueja(folio) });
}

/** GET /api/admin/quejas/:folio/foto?tamano=miniatura — devuelve la imagen binaria. */
export async function foto(req, res) {
  const folio = validarFolio(req.params.folio);
  const tamano = req.query.tamano === 'miniatura' ? 'miniatura' : 'completa';
  const { buffer, mime } = await obtenerFoto(folio, tamano);
  res
    .set({
      'Content-Type': mime,
      'Content-Length': buffer.length,
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename="${folio}${mime === 'image/webp' ? '-mini.webp' : '.jpg'}"`,
    })
    .send(buffer);
}

/** PATCH /api/admin/quejas/:folio — { estado?, prioridad?, comentario? } */
export async function actualizar(req, res) {
  const folio = validarFolio(req.params.folio);
  const cambios = validarActualizacion(req.body);
  const queja = await actualizarQueja(folio, cambios, req.usuario.nombre);
  res.json({ ok: true, mensaje: 'Cambios guardados correctamente.', datos: queja });
}

/** GET /api/admin/estadisticas — indicadores para el tablero. */
export async function estadisticas(_req, res) {
  res.json({ ok: true, datos: await obtenerEstadisticas() });
}
