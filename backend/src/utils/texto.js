/** Utilidades para limpiar y comparar texto. */

// Caracteres de control (excepto salto de línea y tabulación) que no deben guardarse.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Convierte a string, quita caracteres de control y espacios sobrantes en una línea. */
export function limpiarLinea(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor).replace(CONTROL, '').replace(/\s+/g, ' ').trim();
}

/**
 * Limpia un texto de varias líneas conservando los saltos de línea que escribió
 * el ciudadano (la descripción original debe mostrarse tal como fue redactada).
 */
export function limpiarParrafo(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Minúsculas y sin tildes, para búsquedas: "Público" → "publico". */
export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Interpreta "true", "on", "1", true… como verdadero (los formularios multipart envían strings). */
export function aBooleano(valor) {
  if (typeof valor === 'boolean') return valor;
  return ['true', 'on', '1', 'si', 'sí'].includes(String(valor ?? '').trim().toLowerCase());
}
