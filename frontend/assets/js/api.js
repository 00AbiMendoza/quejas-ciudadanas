/**
 * Cliente de la API REST. Es el único módulo del frontend que habla con el backend.
 *
 * API_URL vacío = el frontend lo sirve el mismo backend (recomendado: http://localhost:3000).
 * Si publicas el frontend en otro dominio, define antes de cargar los scripts:
 *   <script>window.API_URL = 'https://tu-backend.onrender.com'</script>
 */
const API_URL = (window.API_URL || '').replace(/\/$/, '');

/** Error con la información que devuelve la API: { status, codigo, mensaje, detalles }. */
export class ErrorApi extends Error {
  constructor(mensaje, { status = 0, codigo = 'ERROR', detalles = [] } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const SIN_CONEXION = () =>
  new ErrorApi('No hay conexión con el servidor. Verifica tu internet o que el backend esté encendido.', {
    codigo: 'SIN_CONEXION',
  });

let tokenActual = null;
let alExpirarSesion = null;

/** El Panel de Administración registra aquí su token y qué hacer si expira. */
export function configurarSesion(token, manejadorExpiracion) {
  tokenActual = token;
  if (manejadorExpiracion) alExpirarSesion = manejadorExpiracion;
}

async function interpretarRespuesta(respuesta) {
  const esJson = (respuesta.headers.get('content-type') || '').includes('application/json');
  const cuerpo = esJson ? await respuesta.json().catch(() => null) : null;
  if (respuesta.ok) return cuerpo;

  const error = new ErrorApi(cuerpo?.error?.mensaje || `El servidor respondió con un error (${respuesta.status}).`, {
    status: respuesta.status,
    codigo: cuerpo?.error?.codigo,
    detalles: cuerpo?.error?.detalles || [],
  });
  if (respuesta.status === 401 && tokenActual && alExpirarSesion) alExpirarSesion(error);
  throw error;
}

async function solicitud(ruta, { metodo = 'GET', cuerpo, comoBlob = false, senal } = {}) {
  const encabezados = { Accept: comoBlob ? 'image/*' : 'application/json' };
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
  if (tokenActual) encabezados.Authorization = `Bearer ${tokenActual}`;

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}/api${ruta}`, {
      method: metodo,
      headers: encabezados,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: senal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw SIN_CONEXION();
  }

  if (comoBlob && respuesta.ok) return respuesta.blob();
  return interpretarRespuesta(respuesta);
}

/**
 * Envía un FormData mostrando el progreso de subida (fetch todavía no lo permite,
 * por eso se usa XMLHttpRequest).
 */
function enviarFormulario(ruta, formulario, alProgresar) {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api${ruta}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseType = 'json';
    xhr.timeout = 60_000;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && alProgresar) alProgresar(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      const cuerpo = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) return resolver(cuerpo);
      rechazar(
        new ErrorApi(cuerpo?.error?.mensaje || `El servidor respondió con un error (${xhr.status}).`, {
          status: xhr.status,
          codigo: cuerpo?.error?.codigo,
          detalles: cuerpo?.error?.detalles || [],
        })
      );
    });
    xhr.addEventListener('error', () => rechazar(SIN_CONEXION()));
    xhr.addEventListener('timeout', () =>
      rechazar(new ErrorApi('El servidor tardó demasiado en responder. Intenta de nuevo.', { codigo: 'TIEMPO_AGOTADO' }))
    );
    xhr.send(formulario);
  });
}

const consulta = (parametros = {}) => {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== '') p.set(clave, valor);
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
};

export const api = {
  // Público
  salud: () => solicitud('/salud'),
  catalogos: () => solicitud('/catalogos'),
  registrarQueja: (formulario, alProgresar) => enviarFormulario('/quejas', formulario, alProgresar),
  seguimiento: (folio) => solicitud(`/quejas/seguimiento/${encodeURIComponent(folio)}`),

  // Autenticación
  login: (usuario, password) => solicitud('/auth/login', { metodo: 'POST', cuerpo: { usuario, password } }),
  sesion: () => solicitud('/auth/sesion'),

  // Panel de Administración
  estadisticas: () => solicitud('/admin/estadisticas'),
  listarQuejas: (filtros, senal) => solicitud(`/admin/quejas${consulta(filtros)}`, { senal }),
  obtenerQueja: (folio) => solicitud(`/admin/quejas/${encodeURIComponent(folio)}`),
  obtenerFoto: (folio, tamano) =>
    solicitud(`/admin/quejas/${encodeURIComponent(folio)}/foto${consulta({ tamano })}`, { comoBlob: true }),
  actualizarQueja: (folio, cambios) =>
    solicitud(`/admin/quejas/${encodeURIComponent(folio)}`, { metodo: 'PATCH', cuerpo: cambios }),
};
