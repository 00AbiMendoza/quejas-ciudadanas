/**
 * Pantalla A · Portal público de atención ciudadana.
 * Permite registrar una queja con fotografía, recibir la confirmación con folio
 * y consultar el estado de quejas anteriores. Todo pasa por la API REST del backend.
 */
import { api, ErrorApi } from './api.js';
import {
  copiarTexto,
  escaparHtml,
  fechaRelativa,
  formatearBytes,
  formatearFecha,
  icono,
  limpiarErroresDeCampos,
  mostrarErroresDeCampos,
  nombreDe,
  notificar,
  pintarIconos,
} from './utils.js';

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const PATRON_FOLIO = /^QC-\d{4}-[A-HJ-NP-Z2-9]{6}$/;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PATRON_NOMBRE = /^\p{L}[\p{L}\s.'-]*$/u;
const CLAVE_FOLIOS = 'quejas:folios-recientes';

const estado = {
  catalogos: null,
  foto: null,
  urlVistaPrevia: null,
  enviando: false,
};

const formulario = $('#formulario-queja');
const formularioSeguimiento = $('#formulario-seguimiento');

/* ───────────────────────── Inicio ───────────────────────── */

function iniciar() {
  pintarIconos();
  $('#anio').textContent = new Date().getFullYear();
  configurarPestanas();
  configurarFormulario();
  configurarFoto();
  configurarUbicacion();
  configurarConfirmacion();
  configurarSeguimiento();
  cargarCatalogos();
  verificarServicio();
}

async function cargarCatalogos() {
  const lista = $('#lista-categorias');
  try {
    const { datos } = await api.catalogos();
    estado.catalogos = datos;
    lista.innerHTML = datos.categorias
      .map(
        (c) => `
        <label class="opcion-categoria">
          <input type="radio" name="categoria" value="${escaparHtml(c.id)}" />
          <span class="categoria-icono">${icono(c.id)}</span>
          <span class="categoria-texto"><strong>${escaparHtml(c.nombre)}</strong><small>${escaparHtml(c.descripcion || '')}</small></span>
        </label>`
      )
      .join('');
    $('#max-foto').textContent = formatearBytes(datos.limites.fotoMaxBytes);
    $('#contador-descripcion').textContent = `0 / ${datos.limites.descripcion.max}`;
  } catch (error) {
    lista.innerHTML = `
      <div class="aviso aviso-error" style="grid-column: 1 / -1">
        ${icono('alerta')}
        <div><strong>No se pudieron cargar las categorías.</strong> ${escaparHtml(error.message)}
        <br /><button type="button" class="btn btn-secundario btn-pequeno" id="btn-reintentar" style="margin-top:.5rem">${icono('refrescar')}Reintentar</button></div>
      </div>`;
    $('#btn-reintentar').addEventListener('click', cargarCatalogos);
  }
}

async function verificarServicio() {
  const indicador = $('#estado-servicio');
  try {
    await api.salud();
    indicador.className = 'estado-servicio en-linea';
    indicador.lastElementChild.textContent = 'Servicio en línea';
  } catch {
    indicador.className = 'estado-servicio fuera-de-linea';
    indicador.lastElementChild.textContent = 'Servicio no disponible';
  }
}

/* ───────────────────────── Pestañas ───────────────────────── */

function configurarPestanas() {
  const pestanas = [...document.querySelectorAll('.pestana')];

  pestanas.forEach((p) => p.addEventListener('click', () => mostrarVista(p.dataset.vista)));

  // Navegación con flechas entre pestañas (accesibilidad).
  $('.pestanas').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const actual = pestanas.findIndex((p) => p.getAttribute('aria-selected') === 'true');
    const siguiente = pestanas[(actual + (e.key === 'ArrowRight' ? 1 : -1) + pestanas.length) % pestanas.length];
    mostrarVista(siguiente.dataset.vista);
    siguiente.focus();
  });

  window.addEventListener('hashchange', () => mostrarVistaDesdeUrl());
  mostrarVistaDesdeUrl();
}

function mostrarVistaDesdeUrl() {
  const parametros = new URLSearchParams(location.search);
  const folio = parametros.get('folio');
  if (location.hash === '#seguimiento' || folio) {
    mostrarVista('seguimiento', { actualizarUrl: false });
    if (folio) {
      $('#folio').value = folio.toUpperCase();
      buscarFolio();
    }
  } else {
    mostrarVista('registrar', { actualizarUrl: false });
  }
}

function mostrarVista(vista, { actualizarUrl = true } = {}) {
  document.querySelectorAll('.pestana').forEach((p) => {
    const activa = p.dataset.vista === vista;
    p.setAttribute('aria-selected', String(activa));
    p.tabIndex = activa ? 0 : -1;
  });
  $('#panel-registrar').hidden = vista !== 'registrar';
  $('#panel-seguimiento').hidden = vista !== 'seguimiento';
  if (actualizarUrl) history.replaceState(null, '', `#${vista}`);
  if (vista === 'seguimiento') pintarFoliosRecientes();
}

/* ───────────────────────── Validación en el navegador ───────────────────────── */

const limites = () =>
  estado.catalogos?.limites ?? {
    asunto: { min: 5, max: 100 },
    descripcion: { min: 20, max: 2000 },
    direccion: { min: 5, max: 200 },
    nombre: { min: 3, max: 100 },
  };

function validarLongitud(valor, { min, max }, etiqueta, femenino = false) {
  if (!valor) return `${etiqueta} es ${femenino ? 'obligatoria' : 'obligatorio'}.`;
  if (min && valor.length < min) return `${etiqueta} debe tener al menos ${min} caracteres (llevas ${valor.length}).`;
  if (max && valor.length > max) return `${etiqueta} no puede superar ${max} caracteres.`;
  return '';
}

const esAnonimo = () => formulario.anonimo.checked;
const valor = (nombre) => (formulario.elements[nombre]?.value ?? '').trim();

/** Reglas equivalentes a las del backend (el backend vuelve a validar todo). */
const REGLAS = {
  categoria: () => (formulario.querySelector('input[name="categoria"]:checked') ? '' : 'Selecciona la categoría del problema.'),
  asunto: () => validarLongitud(valor('asunto'), limites().asunto, 'El asunto'),
  descripcion: () => validarLongitud(valor('descripcion'), limites().descripcion, 'La descripción', true),
  direccion: () => validarLongitud(valor('direccion'), limites().direccion, 'La dirección', true),
  nombre: () => {
    if (esAnonimo()) return '';
    const v = valor('nombre');
    return validarLongitud(v, limites().nombre, 'El nombre') || (PATRON_NOMBRE.test(v) ? '' : 'El nombre solo puede contener letras y espacios.');
  },
  correo: () => {
    if (esAnonimo()) return '';
    const v = valor('correo');
    if (!v && !valor('telefono')) return 'Ingresa un correo o un teléfono para poder contactarte.';
    return v && !PATRON_CORREO.test(v) ? 'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).' : '';
  },
  telefono: () => {
    if (esAnonimo()) return '';
    const v = valor('telefono').replace(/[\s()-]/g, '');
    return v && !/^\+?\d{8,15}$/.test(v) ? 'El teléfono debe tener entre 8 y 15 dígitos.' : '';
  },
  aceptaTerminos: () => (formulario.aceptaTerminos.checked ? '' : 'Debes aceptar el uso de tus datos para registrar la queja.'),
};

function validarCampo(campo) {
  limpiarErroresDeCampos(formulario, campo);
  const mensaje = REGLAS[campo]?.() || '';
  if (mensaje) mostrarErroresDeCampos(formulario, [{ campo, mensaje }]);
  return mensaje;
}

function validarFormulario() {
  return Object.keys(REGLAS)
    .map((campo) => ({ campo, mensaje: REGLAS[campo]() }))
    .filter((e) => e.mensaje);
}

/* ───────────────────────── Formulario de queja ───────────────────────── */

function configurarFormulario() {
  // Validar al salir de cada campo y limpiar el error mientras se corrige.
  formulario.addEventListener('focusout', (e) => {
    const campo = e.target.name;
    if (REGLAS[campo] && e.target.type !== 'radio' && e.target.type !== 'checkbox' && e.target.value.trim()) validarCampo(campo);
  });
  formulario.addEventListener('input', (e) => {
    const campo = e.target.name;
    if (!campo) return;
    if (campo === 'telefono' || campo === 'correo') {
      limpiarErroresDeCampos(formulario, 'correo');
      limpiarErroresDeCampos(formulario, 'telefono');
    } else {
      limpiarErroresDeCampos(formulario, campo);
    }
  });
  formulario.addEventListener('change', (e) => {
    if (e.target.name === 'categoria' || e.target.name === 'aceptaTerminos') validarCampo(e.target.name);
  });

  // Contador de caracteres de la descripción.
  const descripcion = $('#descripcion');
  const contador = $('#contador-descripcion');
  descripcion.addEventListener('input', () => {
    const max = limites().descripcion.max;
    const largo = descripcion.value.length;
    contador.textContent = `${largo} / ${max}`;
    contador.classList.toggle('cerca', largo > max * 0.9 && largo <= max);
    contador.classList.toggle('excedido', largo > max);
  });

  // Reporte anónimo: desactiva los datos de contacto.
  formulario.anonimo.addEventListener('change', () => {
    const anonimo = esAnonimo();
    const contacto = $('#datos-contacto');
    contacto.setAttribute('aria-disabled', String(anonimo));
    contacto.querySelectorAll('input').forEach((input) => (input.disabled = anonimo));
    ['nombre', 'correo', 'telefono'].forEach((c) => limpiarErroresDeCampos(formulario, c));
  });

  formulario.addEventListener('submit', enviarQueja);
}

async function enviarQueja(evento) {
  evento.preventDefault();
  if (estado.enviando) return;

  ocultarResumenErrores();
  limpiarErroresDeCampos(formulario);

  const errores = validarFormulario();
  if (errores.length) {
    mostrarErroresDeCampos(formulario, errores);
    mostrarResumenErrores('Revisa los campos marcados antes de enviar:', errores);
    return;
  }

  // FormData respeta los campos desactivados (no envía contacto si es anónimo).
  const datos = new FormData(formulario);
  datos.delete('foto');
  if (estado.foto) datos.append('foto', estado.foto, estado.foto.name);

  ponerEnviando(true);
  try {
    const respuesta = await api.registrarQueja(datos, actualizarProgreso);
    guardarFolioReciente(respuesta.datos.folio);
    mostrarConfirmacion(respuesta.datos);
  } catch (error) {
    if (error instanceof ErrorApi && error.detalles.length) {
      mostrarErroresDeCampos(formulario, error.detalles);
      mostrarResumenErrores(error.message, error.detalles);
    } else {
      mostrarResumenErrores(error.message || 'No fue posible enviar la queja.');
    }
  } finally {
    ponerEnviando(false);
  }
}

function ponerEnviando(enviando) {
  estado.enviando = enviando;
  const boton = $('#btn-enviar');
  boton.disabled = enviando;
  boton.querySelector('.btn-texto').textContent = enviando ? 'Enviando…' : 'Enviar queja';
  boton.firstElementChild.outerHTML = enviando ? '<span class="spinner" aria-hidden="true"></span>' : icono('enviar');
  $('#progreso').hidden = !enviando;
  if (enviando) actualizarProgreso(0);
}

function actualizarProgreso(fraccion) {
  const porcentaje = Math.round(fraccion * 100);
  $('#progreso-relleno').style.width = `${porcentaje}%`;
  $('#progreso-texto').textContent =
    porcentaje < 100 ? `Subiendo información… ${porcentaje}%` : 'Procesando y guardando en el sistema municipal…';
}

/** Elemento al que se lleva al usuario cuando hace clic en un error del resumen. */
const DESTINO_ERROR = { categoria: 'lista-categorias', foto: 'zona-foto', ubicacion: 'btn-ubicacion' };

function mostrarResumenErrores(mensaje, errores = []) {
  const resumen = $('#resumen-errores');
  const enlaces = errores
    .map((e) => {
      const destino = DESTINO_ERROR[e.campo] || e.campo;
      return `<li><a href="#${escaparHtml(destino)}" data-enfocar="${escaparHtml(destino)}">${escaparHtml(e.mensaje)}</a></li>`;
    })
    .join('');
  resumen.innerHTML = `${icono('alerta')}<div><strong>No pudimos enviar tu queja.</strong> ${escaparHtml(mensaje)}${enlaces ? `<ul>${enlaces}</ul>` : ''}</div>`;
  resumen.hidden = false;
  resumen.focus();
  resumen.scrollIntoView({ behavior: 'smooth', block: 'center' });
  resumen.querySelectorAll('[data-enfocar]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const destino = document.getElementById(a.dataset.enfocar);
      const enfocable = destino?.matches('input, textarea, select, button') ? destino : destino?.querySelector('input');
      destino?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      enfocable?.focus({ preventScroll: true });
    })
  );
}

function ocultarResumenErrores() {
  const resumen = $('#resumen-errores');
  resumen.hidden = true;
  resumen.innerHTML = '';
}

/* ───────────────────────── Fotografía ───────────────────────── */

function configurarFoto() {
  const entrada = $('#foto');
  const zona = $('#zona-foto');

  entrada.addEventListener('change', () => {
    if (entrada.files[0]) seleccionarFoto(entrada.files[0]);
  });

  ['dragenter', 'dragover'].forEach((tipo) =>
    zona.addEventListener(tipo, (e) => {
      e.preventDefault();
      zona.classList.add('arrastrando');
    })
  );
  ['dragleave', 'drop'].forEach((tipo) =>
    zona.addEventListener(tipo, (e) => {
      e.preventDefault();
      zona.classList.remove('arrastrando');
    })
  );
  zona.addEventListener('drop', (e) => {
    const archivo = e.dataTransfer?.files?.[0];
    if (archivo) seleccionarFoto(archivo);
  });

  $('#btn-quitar-foto').addEventListener('click', quitarFoto);
}

function seleccionarFoto(archivo) {
  limpiarErroresDeCampos(formulario, 'foto');
  const maximo = estado.catalogos?.limites?.fotoMaxBytes ?? 5 * 1024 * 1024;

  let error = '';
  if (!TIPOS_FOTO.includes(archivo.type)) error = 'Formato no permitido. Usa una imagen JPG, PNG o WEBP.';
  else if (archivo.size > maximo) error = `La foto pesa ${formatearBytes(archivo.size)}; el máximo es ${formatearBytes(maximo)}.`;

  if (error) {
    $('#foto').value = '';
    mostrarErroresDeCampos(formulario, [{ campo: 'foto', mensaje: error }]);
    return;
  }

  if (estado.urlVistaPrevia) URL.revokeObjectURL(estado.urlVistaPrevia);
  estado.foto = archivo;
  estado.urlVistaPrevia = URL.createObjectURL(archivo);

  const img = $('#vista-previa-img');
  img.onload = () => {
    $('#vista-previa-detalle').textContent = `${formatearBytes(archivo.size)} · ${img.naturalWidth} × ${img.naturalHeight} px`;
  };
  img.onerror = () => {
    quitarFoto();
    mostrarErroresDeCampos(formulario, [{ campo: 'foto', mensaje: 'No se pudo leer la imagen. Intenta con otra fotografía.' }]);
  };
  img.src = estado.urlVistaPrevia;
  $('#vista-previa-nombre').textContent = archivo.name;
  $('#vista-previa-detalle').textContent = formatearBytes(archivo.size);
  $('#vista-previa').hidden = false;
  $('#zona-foto').hidden = true;
}

function quitarFoto() {
  if (estado.urlVistaPrevia) URL.revokeObjectURL(estado.urlVistaPrevia);
  estado.foto = null;
  estado.urlVistaPrevia = null;
  $('#foto').value = '';
  $('#vista-previa-img').removeAttribute('src');
  $('#vista-previa').hidden = true;
  $('#zona-foto').hidden = false;
  limpiarErroresDeCampos(formulario, 'foto');
}

/* ───────────────────────── Ubicación GPS ───────────────────────── */

function configurarUbicacion() {
  const boton = $('#btn-ubicacion');
  const texto = $('#estado-ubicacion');

  if (!('geolocation' in navigator)) {
    boton.hidden = true;
    texto.textContent = '';
    return;
  }

  boton.addEventListener('click', () => {
    boton.disabled = true;
    texto.textContent = 'Obteniendo ubicación…';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        boton.disabled = false;
        $('#latitud').value = coords.latitude.toFixed(6);
        $('#longitud').value = coords.longitude.toFixed(6);
        boton.hidden = true;
        texto.innerHTML = `<span class="chip-ubicacion">${icono('ubicacion')}Ubicación agregada (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})
          <button type="button" aria-label="Quitar ubicación">${icono('x')}</button></span>`;
        texto.querySelector('button').addEventListener('click', quitarUbicacion);
      },
      (error) => {
        boton.disabled = false;
        texto.textContent =
          error.code === error.PERMISSION_DENIED
            ? 'No diste permiso para usar tu ubicación. Puedes continuar sin ella.'
            : 'No fue posible obtener tu ubicación. Puedes continuar sin ella.';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function quitarUbicacion() {
  $('#latitud').value = '';
  $('#longitud').value = '';
  $('#btn-ubicacion').hidden = false;
  $('#estado-ubicacion').textContent = 'Opcional: ayuda a ubicar el lugar exacto.';
}

/* ───────────────────────── Confirmación ───────────────────────── */

function mostrarConfirmacion(queja) {
  $('#conf-folio').textContent = queja.folio;
  $('#conf-categoria').textContent = nombreDe(estado.catalogos?.categorias, queja.categoria);
  $('#conf-asunto').textContent = queja.asunto;
  $('#conf-fecha').textContent = formatearFecha(queja.fechaCreacion);
  $('#conf-estado').innerHTML = `<span class="insignia estado-${escaparHtml(queja.estado)}">${escaparHtml(nombreDe(estado.catalogos?.estados, queja.estado))}</span>`;
  $('#conf-foto').textContent = queja.tieneFoto ? 'Adjunta' : 'Sin fotografía';

  formulario.hidden = true;
  const confirmacion = $('#confirmacion');
  confirmacion.hidden = false;
  confirmacion.focus();
  $('.principal').scrollIntoView({ behavior: 'smooth' });
  notificar(`Queja registrada con el folio ${queja.folio}`, 'exito');
}

function configurarConfirmacion() {
  $('#btn-copiar-folio').addEventListener('click', async () => {
    const copiado = await copiarTexto($('#conf-folio').textContent);
    notificar(copiado ? 'Folio copiado al portapapeles.' : 'No se pudo copiar; anótalo manualmente.', copiado ? 'exito' : 'error');
  });

  $('#btn-nueva-queja').addEventListener('click', () => {
    formulario.reset();
    formulario.anonimo.dispatchEvent(new Event('change'));
    $('#descripcion').dispatchEvent(new Event('input'));
    quitarFoto();
    quitarUbicacion();
    limpiarErroresDeCampos(formulario);
    $('#confirmacion').hidden = true;
    formulario.hidden = false;
    $('#asunto').focus();
  });

  $('#btn-ver-estado').addEventListener('click', () => {
    $('#folio').value = $('#conf-folio').textContent;
    mostrarVista('seguimiento');
    buscarFolio();
  });
}

/* ───────────────────────── Seguimiento ───────────────────────── */

function configurarSeguimiento() {
  const entrada = $('#folio');
  entrada.addEventListener('input', () => {
    entrada.value = entrada.value.toUpperCase().replace(/\s/g, '');
    limpiarErroresDeCampos(formularioSeguimiento);
  });
  formularioSeguimiento.addEventListener('submit', (e) => {
    e.preventDefault();
    buscarFolio();
  });
}

async function buscarFolio() {
  const folio = $('#folio').value.trim().toUpperCase();
  const resultado = $('#resultado-seguimiento');
  limpiarErroresDeCampos(formularioSeguimiento);

  if (!PATRON_FOLIO.test(folio)) {
    mostrarErroresDeCampos(formularioSeguimiento, [
      { campo: 'folio', mensaje: 'Escribe el folio completo, con el formato QC-2026-XXXXXX.' },
    ]);
    $('#folio').focus();
    return;
  }

  const boton = $('#btn-buscar-folio');
  boton.disabled = true;
  resultado.innerHTML = '<div class="resultado"><div class="esqueleto" style="height:9rem"></div></div>';

  try {
    const { datos } = await api.seguimiento(folio);
    resultado.innerHTML = plantillaSeguimiento(datos);
    guardarFolioReciente(datos.folio);
  } catch (error) {
    const esNoEncontrado = error.status === 404;
    resultado.innerHTML = `
      <div class="resultado">
        <div class="aviso ${esNoEncontrado ? 'aviso-info' : 'aviso-error'}">${icono(esNoEncontrado ? 'info' : 'alerta')}
          <div>${escaparHtml(error.message)}</div>
        </div>
      </div>`;
  } finally {
    boton.disabled = false;
  }
}

function plantillaSeguimiento(q) {
  const estados = estado.catalogos?.estados;
  const orden = ['recibida', 'en_revision', 'en_proceso', 'resuelta'];
  const rechazada = q.estado === 'rechazada';
  const indiceActual = rechazada ? 3 : orden.indexOf(q.estado);
  const visitados = new Set(q.historial.map((h) => h.estado));

  const etapas = orden
    .map((id, i) => {
      const nombre = rechazada && i === 3 ? nombreDe(estados, 'rechazada') : nombreDe(estados, id);
      let clase = '';
      if (i === indiceActual) clase = 'actual';
      else if (i < indiceActual && visitados.has(id)) clase = 'hecha';
      return `<li class="${clase}">${escaparHtml(nombre)}</li>`;
    })
    .join('');

  const eventos = [...q.historial]
    .reverse()
    .map(
      (h) => `
      <li>
        <span class="punto estado-${escaparHtml(h.estado)}"></span>
        <div class="titulo-evento">${escaparHtml(nombreDe(estados, h.estado))}</div>
        <div class="meta-evento">${formatearFecha(h.fecha)} · ${fechaRelativa(h.fecha)}</div>
        ${h.comentario ? `<div class="comentario-evento">${escaparHtml(h.comentario)}</div>` : ''}
      </li>`
    )
    .join('');

  return `
    <div class="resultado">
      <div class="resultado-cabecera">
        <div>
          <div class="resultado-folio">${escaparHtml(q.folio)}</div>
          <h3>${escaparHtml(q.asunto)}</h3>
        </div>
        <span class="insignia estado-${escaparHtml(q.estado)}">${escaparHtml(nombreDe(estados, q.estado))}</span>
      </div>
      <div class="resultado-meta">
        <span>${icono(q.categoria)}${escaparHtml(nombreDe(estado.catalogos?.categorias, q.categoria))}</span>
        <span>${icono('calendario')}Registrada el ${formatearFecha(q.fechaCreacion)}</span>
        <span>${icono('reloj')}Actualizada ${fechaRelativa(q.fechaActualizacion)}</span>
      </div>
      <ol class="etapas ${rechazada ? 'rechazada' : ''}" aria-label="Avance de la queja">${etapas}</ol>
      <h4>Historial de la queja</h4>
      <ul class="linea-tiempo">${eventos}</ul>
    </div>`;
}

/* Folios guardados solo en este navegador para consultarlos rápido. */
function leerFoliosRecientes() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_FOLIOS)) || [];
  } catch {
    return [];
  }
}

function guardarFolioReciente(folio) {
  try {
    const folios = [folio, ...leerFoliosRecientes().filter((f) => f !== folio)].slice(0, 5);
    localStorage.setItem(CLAVE_FOLIOS, JSON.stringify(folios));
  } catch {
    /* almacenamiento no disponible: no es crítico */
  }
}

function pintarFoliosRecientes() {
  const contenedor = $('#folios-recientes');
  const folios = leerFoliosRecientes();
  contenedor.hidden = !folios.length;
  if (!folios.length) return;
  contenedor.innerHTML = `<span>Tus folios recientes:</span>${folios
    .map((f) => `<button type="button" data-folio="${escaparHtml(f)}">${escaparHtml(f)}</button>`)
    .join('')}`;
  contenedor.querySelectorAll('[data-folio]').forEach((b) =>
    b.addEventListener('click', () => {
      $('#folio').value = b.dataset.folio;
      buscarFolio();
    })
  );
}

iniciar();
