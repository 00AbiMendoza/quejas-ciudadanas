/**
 * Utilidades de interfaz compartidas: íconos SVG, formato de fechas, escape de HTML,
 * notificaciones y manejo de errores en formularios.
 */

const TRAZOS = {
  alumbrado: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  calles: '<path d="M4 21 8 3M20 21 16 3M12 4v2M12 10v3M12 17v3"/>',
  basura: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  agua: '<path d="M12 2.7s-6.5 7-6.5 11.3a6.5 6.5 0 0 0 13 0C18.5 9.7 12 2.7 12 2.7z"/>',
  parques: '<path d="M12 22v-5"/><path d="M12 2 5 12h4l-3 5h12l-3-5h4z"/>',
  transito: '<rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>',
  ruido: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  seguridad: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  otro: '<circle cx="12" cy="12" r="10"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>',
  ubicacion: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mira: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  refrescar: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  correo: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  telefono: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  izquierda: '<path d="m15 18-6-6 6-6"/>',
  derecha: '<path d="m9 18 6-6-6-6"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  edificio: '<path d="M2 21h20M4 21V10M20 21V10M8 21V10M12 21V10M16 21V10M2 10 12 3l10 7"/>',
  subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  bandeja: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  candado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  grafico: '<path d="M3 3v18h18M7 16v-3M12 16V8M17 16v-6"/>',
  externo: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  actividad: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  filtro: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  nota: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  bandera: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
};

/** Devuelve el SVG de un ícono como texto. */
export function icono(nombre, clase = '') {
  const trazo = TRAZOS[nombre] || TRAZOS.otro;
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${trazo}</svg>`;
}

/** Reemplaza cada <span data-icono="nombre"> del documento por su SVG. */
export function pintarIconos(raiz = document) {
  raiz.querySelectorAll('[data-icono]').forEach((el) => {
    el.outerHTML = icono(el.dataset.icono, el.className);
  });
}

/** Escapa texto antes de insertarlo como HTML (previene XSS). */
export function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const formatoFecha = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
const formatoDia = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
const formatoHora = new Intl.DateTimeFormat('es-GT', { hour: '2-digit', minute: '2-digit' });
const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export const formatearFecha = (iso) => (iso ? formatoFecha.format(new Date(iso)) : '—');
export const formatearDia = (iso) => (iso ? formatoDia.format(new Date(iso)) : '—');
export const formatearHora = (iso) => (iso ? formatoHora.format(new Date(iso)) : '');

/** "hace 5 minutos", "ayer", "hace 3 días"… */
export function fechaRelativa(iso) {
  if (!iso) return '';
  const segundos = Math.round((new Date(iso) - Date.now()) / 1000);
  const unidades = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unidad, s] of unidades) {
    if (Math.abs(segundos) >= s) return relativo.format(Math.round(segundos / s), unidad);
  }
  return 'hace un momento';
}

export function formatearBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function retrasar(fn, ms = 300) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
}

/** Notificación flotante temporal. tipo: 'exito' | 'error' | 'info' */
export function notificar(mensaje, tipo = 'info', duracion = 4500) {
  let contenedor = document.querySelector('.notificaciones');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.className = 'notificaciones';
    contenedor.setAttribute('role', 'status');
    contenedor.setAttribute('aria-live', 'polite');
    document.body.append(contenedor);
  }
  const iconos = { exito: 'check', error: 'alerta', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `${icono(iconos[tipo] || 'info')}<span>${escaparHtml(mensaje)}</span>`;
  contenedor.append(toast);
  setTimeout(() => {
    toast.classList.add('saliendo');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duracion);
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Muestra los errores devueltos por la API junto a cada campo del formulario.
 * Cada campo debe tener un elemento [data-error-de="nombreCampo"].
 * @returns {Array} errores que no corresponden a ningún campo visible.
 */
export function mostrarErroresDeCampos(formulario, detalles = []) {
  const sinCampo = [];
  for (const { campo, mensaje } of detalles) {
    const destino = formulario.querySelector(`[data-error-de="${campo}"]`);
    if (!destino) {
      sinCampo.push({ campo, mensaje });
      continue;
    }
    destino.textContent = mensaje;
    const contenedor = destino.closest('.campo, .grupo-campo');
    contenedor?.classList.add('con-error');
    contenedor?.querySelectorAll('input, select, textarea').forEach((c) => c.setAttribute('aria-invalid', 'true'));
  }
  return sinCampo;
}

export function limpiarErroresDeCampos(formulario, campo) {
  const selector = campo ? `[data-error-de="${campo}"]` : '[data-error-de]';
  formulario.querySelectorAll(selector).forEach((destino) => {
    destino.textContent = '';
    const contenedor = destino.closest('.campo, .grupo-campo');
    contenedor?.classList.remove('con-error');
    contenedor?.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
  });
}

/** Busca un elemento del catálogo por id y devuelve su nombre legible. */
export const nombreDe = (catalogo, id) => catalogo?.find((c) => c.id === id)?.nombre ?? id ?? '—';
