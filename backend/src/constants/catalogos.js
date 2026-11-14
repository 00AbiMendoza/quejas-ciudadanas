/**
 * Catálogos del sistema. El frontend los obtiene desde GET /api/catalogos,
 * de modo que se definen en un solo lugar (el backend).
 */

export const CATEGORIAS = Object.freeze([
  { id: 'alumbrado', nombre: 'Alumbrado público', descripcion: 'Lámparas apagadas, postes dañados' },
  { id: 'calles', nombre: 'Baches y calles', descripcion: 'Baches, banquetas o asfalto dañado' },
  { id: 'basura', nombre: 'Basura y limpieza', descripcion: 'Basureros, recolección, limpieza' },
  { id: 'agua', nombre: 'Agua y drenajes', descripcion: 'Fugas, falta de agua, tragantes' },
  { id: 'parques', nombre: 'Parques y áreas verdes', descripcion: 'Árboles, jardines, juegos' },
  { id: 'transito', nombre: 'Tránsito y señalización', descripcion: 'Semáforos, señales, vehículos' },
  { id: 'ruido', nombre: 'Ruido y contaminación', descripcion: 'Ruido excesivo, humo, olores' },
  { id: 'seguridad', nombre: 'Seguridad ciudadana', descripcion: 'Zonas de riesgo, vandalismo' },
  { id: 'otro', nombre: 'Otro', descripcion: 'Cualquier otro problema' },
]);

export const ESTADOS = Object.freeze([
  { id: 'recibida', nombre: 'Recibida', descripcion: 'La queja fue registrada y espera revisión.' },
  { id: 'en_revision', nombre: 'En revisión', descripcion: 'El personal municipal está evaluando la queja.' },
  { id: 'en_proceso', nombre: 'En proceso', descripcion: 'Se asignó a una cuadrilla o dependencia para su atención.' },
  { id: 'resuelta', nombre: 'Resuelta', descripcion: 'El problema fue atendido.' },
  { id: 'rechazada', nombre: 'No procede', descripcion: 'La queja no corresponde o no pudo atenderse.' },
]);

export const PRIORIDADES = Object.freeze([
  { id: 'baja', nombre: 'Baja' },
  { id: 'media', nombre: 'Media' },
  { id: 'alta', nombre: 'Alta' },
]);

/** Estados que exigen un comentario para explicarle al ciudadano qué se hizo. */
export const ESTADOS_QUE_REQUIEREN_COMENTARIO = Object.freeze(['resuelta', 'rechazada']);

export const ESTADO_INICIAL = 'recibida';
export const PRIORIDAD_INICIAL = 'media';

const ids = (catalogo) => new Set(catalogo.map((c) => c.id));
export const IDS_CATEGORIAS = ids(CATEGORIAS);
export const IDS_ESTADOS = ids(ESTADOS);
export const IDS_PRIORIDADES = ids(PRIORIDADES);

export const TIPOS_FOTO_PERMITIDOS = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/** Formato de folio: QC-2026-7KX3PM (sin caracteres ambiguos como 0/O o 1/I). */
export const PATRON_FOLIO = /^QC-\d{4}-[A-HJ-NP-Z2-9]{6}$/;
