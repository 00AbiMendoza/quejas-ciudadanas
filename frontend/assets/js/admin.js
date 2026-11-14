/**
 * Pantalla B · Panel de Administración Municipal.
 * Inicio de sesión (JWT), indicadores, filtros, listado paginado y detalle de cada queja
 * con su descripción original, fotografía, ubicación, datos de contacto e historial.
 * Toda la información proviene de la API REST (que a su vez la lee de Firebase Firestore).
 */
import { api, configurarSesion, ErrorApi } from './api.js';
import {
  escaparHtml,
  fechaRelativa,
  formatearBytes,
  formatearFecha,
  formatearHora,
  icono,
  limpiarErroresDeCampos,
  mostrarErroresDeCampos,
  nombreDe,
  notificar,
  pintarIconos,
  retrasar,
} from './utils.js';

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const CLAVE_SESION = 'quejas:sesion-admin';
const INTERVALO_SONDEO_MS = 60_000;
const ESTADOS_CON_COMENTARIO = ['resuelta', 'rechazada'];

const FILTROS_INICIALES = Object.freeze({
  q: '',
  estado: '',
  categoria: '',
  prioridad: '',
  conFoto: '',
  desde: '',
  hasta: '',
  orden: 'recientes',
  pagina: 1,
  limite: 10,
});

const estado = {
  sesion: null,
  catalogos: null,
  filtros: { ...FILTROS_INICIALES },
  quejas: [],
  paginacion: null,
  estadisticas: null,
  miniaturas: new Map(),
  controladorLista: null,
  detalle: null,
  urlFotoDetalle: null,
  ultimoFoco: null,
  sondeo: null,
  ultimaCarga: null,
};

const formularioLogin = $('#formulario-login');
const formularioFiltros = $('#filtros');

/* ───────────────────────── Inicio y sesión ───────────────────────── */

async function iniciar() {
  pintarIconos();
  configurarLogin();
  configurarPanel();
  configurarDetalle();

  const guardada = leerSesion();
  if (guardada && new Date(guardada.expira) > new Date()) {
    configurarSesion(guardada.token, expirarSesion);
    try {
      await api.sesion();
      estado.sesion = guardada;
      await entrarAlPanel();
      return;
    } catch {
      /* Sesión inválida o servidor apagado: se muestra el login. */
    }
  }
  mostrarLogin();
}

function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_SESION));
  } catch {
    return null;
  }
}

function guardarSesion(sesion) {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  } catch {
    /* Sin almacenamiento: la sesión dura mientras la página esté abierta. */
  }
}

function limpiarSesion() {
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* no crítico */
  }
  estado.sesion = null;
  configurarSesion(null);
  clearInterval(estado.sondeo);
  estado.miniaturas.forEach((url) => URL.revokeObjectURL(url));
  estado.miniaturas.clear();
}

function mostrarLogin(mensaje) {
  $('#vista-panel').hidden = true;
  $('#vista-login').hidden = false;
  document.title = 'Iniciar sesión · Panel de Administración Municipal';
  const aviso = $('#login-error');
  aviso.hidden = !mensaje;
  if (mensaje) aviso.innerHTML = `${icono('alerta')}<span>${escaparHtml(mensaje)}</span>`;
  $('#usuario').focus();
}

function expirarSesion(error) {
  if (!estado.sesion) return;
  cerrarDetalle();
  limpiarSesion();
  mostrarLogin(error?.message || 'Tu sesión expiró. Inicia sesión nuevamente.');
}

function configurarLogin() {
  $('#btn-ver-password').addEventListener('click', (e) => {
    const campo = $('#password');
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    e.currentTarget.textContent = visible ? 'Mostrar' : 'Ocultar';
    e.currentTarget.setAttribute('aria-pressed', String(!visible));
  });

  formularioLogin.addEventListener('input', (e) => limpiarErroresDeCampos(formularioLogin, e.target.name));

  formularioLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErroresDeCampos(formularioLogin);
    $('#login-error').hidden = true;

    const usuario = $('#usuario').value.trim();
    const password = $('#password').value;
    const errores = [];
    if (!usuario) errores.push({ campo: 'usuario', mensaje: 'Ingresa tu usuario.' });
    if (!password) errores.push({ campo: 'password', mensaje: 'Ingresa tu contraseña.' });
    if (errores.length) {
      mostrarErroresDeCampos(formularioLogin, errores);
      formularioLogin.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const boton = $('#btn-login');
    boton.disabled = true;
    boton.querySelector('.btn-texto').textContent = 'Verificando…';
    try {
      const { datos } = await api.login(usuario, password);
      estado.sesion = datos;
      guardarSesion(datos);
      configurarSesion(datos.token, expirarSesion);
      formularioLogin.reset();
      await entrarAlPanel();
    } catch (error) {
      if (error instanceof ErrorApi && error.detalles.length) mostrarErroresDeCampos(formularioLogin, error.detalles);
      const aviso = $('#login-error');
      aviso.innerHTML = `${icono('alerta')}<span>${escaparHtml(error.message)}</span>`;
      aviso.hidden = false;
      $('#password').select();
    } finally {
      boton.disabled = false;
      boton.querySelector('.btn-texto').textContent = 'Iniciar sesión';
    }
  });
}

async function entrarAlPanel() {
  $('#vista-login').hidden = true;
  $('#vista-panel').hidden = false;
  document.title = 'Panel de Administración Municipal · Quejas ciudadanas';
  $('#nombre-usuario').textContent = estado.sesion.usuario?.nombre || 'Personal municipal';

  if (!estado.catalogos) await cargarCatalogos();
  await cargarTodo();

  clearInterval(estado.sondeo);
  estado.sondeo = setInterval(sondearNuevas, INTERVALO_SONDEO_MS);
}

async function cargarCatalogos() {
  try {
    const { datos } = await api.catalogos();
    estado.catalogos = datos;
    const opciones = (lista) => lista.map((c) => `<option value="${escaparHtml(c.id)}">${escaparHtml(c.nombre)}</option>`).join('');
    $('#f-estado').insertAdjacentHTML('beforeend', opciones(datos.estados));
    $('#f-categoria').insertAdjacentHTML('beforeend', opciones(datos.categorias));
    $('#f-prioridad').insertAdjacentHTML('beforeend', opciones(datos.prioridades));
  } catch (error) {
    notificar(`No se pudieron cargar los catálogos: ${error.message}`, 'error');
  }
}

/* ───────────────────────── Carga de datos ───────────────────────── */

async function cargarTodo() {
  const boton = $('#btn-actualizar');
  boton.disabled = true;
  boton.firstElementChild.outerHTML = '<span class="spinner" aria-hidden="true"></span>';
  await Promise.allSettled([cargarEstadisticas(), cargarLista()]);
  boton.disabled = false;
  boton.firstElementChild.outerHTML = icono('refrescar');
  estado.ultimaCarga = new Date();
  pintarUltimaActualizacion();
  $('#aviso-nuevas').hidden = true;
}

function pintarUltimaActualizacion() {
  const total = estado.estadisticas?.total;
  const partes = [`Actualizado a las ${formatearHora(estado.ultimaCarga?.toISOString())}`];
  if (total !== undefined) partes.push(`${total} ${total === 1 ? 'queja registrada' : 'quejas registradas'} en Firebase`);
  $('#ultima-actualizacion').textContent = partes.join(' · ');
}

async function cargarEstadisticas() {
  try {
    const { datos } = await api.estadisticas();
    estado.estadisticas = datos;
    pintarIndicadores();
    pintarGraficoCategorias();
    pintarActividad();
  } catch (error) {
    if (error.status === 401) return;
    $('#indicadores').innerHTML = `<div class="aviso aviso-error" style="grid-column:1/-1">${icono('alerta')}<span>No se pudieron cargar los indicadores: ${escaparHtml(error.message)}</span></div>`;
  }
}

/** Revisa periódicamente si llegaron quejas nuevas (solo si la pestaña está visible). */
async function sondearNuevas() {
  if (document.visibilityState !== 'visible' || !estado.sesion || !estado.estadisticas) return;
  try {
    const { datos } = await api.estadisticas();
    const nuevas = datos.total - estado.estadisticas.total;
    if (nuevas > 0) {
      const aviso = $('#aviso-nuevas');
      aviso.innerHTML = `${icono('bandeja')}<span><strong>${nuevas === 1 ? 'Llegó 1 queja nueva' : `Llegaron ${nuevas} quejas nuevas`}</strong> desde el portal ciudadano.</span>
        <button type="button" class="btn btn-primario btn-pequeno">Mostrar</button>`;
      aviso.querySelector('button').addEventListener('click', cargarTodo);
      aviso.hidden = false;
    }
  } catch {
    /* silencioso: se reintenta en el siguiente ciclo */
  }
}

/** Convierte las fechas del formulario (día local) en instantes ISO para la API. */
function parametrosDeConsulta() {
  const f = estado.filtros;
  return {
    ...f,
    desde: f.desde ? new Date(`${f.desde}T00:00:00`).toISOString() : '',
    hasta: f.hasta ? new Date(`${f.hasta}T23:59:59.999`).toISOString() : '',
  };
}

async function cargarLista() {
  estado.controladorLista?.abort();
  const controlador = new AbortController();
  estado.controladorLista = controlador;

  const cuerpo = $('#cuerpo-tabla');
  if (!estado.quejas.length) pintarFilasEsqueleto();
  cuerpo.style.opacity = '0.55';
  $('#error-lista').hidden = true;

  try {
    const respuesta = await api.listarQuejas(parametrosDeConsulta(), controlador.signal);
    estado.quejas = respuesta.datos;
    estado.paginacion = respuesta.paginacion;
    estado.filtros.pagina = respuesta.paginacion.pagina;
    pintarTabla();
    pintarPaginacion();
  } catch (error) {
    if (error.name === 'AbortError' || error.status === 401) return;
    const aviso = $('#error-lista');
    aviso.innerHTML = `${icono('alerta')}<div><strong>No se pudo cargar el listado.</strong> ${escaparHtml(error.message)}
      <br /><button type="button" class="btn btn-secundario btn-pequeno" style="margin-top:.5rem">${icono('refrescar')}Reintentar</button></div>`;
    aviso.querySelector('button').addEventListener('click', cargarLista);
    aviso.hidden = false;
    if (!estado.quejas.length) cuerpo.innerHTML = '';
  } finally {
    if (estado.controladorLista === controlador) cuerpo.style.opacity = '';
  }
}

/* ───────────────────────── Indicadores ───────────────────────── */

const ICONOS_ESTADO = { recibida: 'bandeja', en_revision: 'buscar', en_proceso: 'reloj', resuelta: 'check', rechazada: 'x' };

function pintarIndicadores() {
  const s = estado.estadisticas;
  if (!s || !estado.catalogos) return;
  const porcentaje = (n) => (s.total ? `${Math.round((n / s.total) * 100)} % del total` : 'Sin registros');

  const tarjetas = [
    {
      id: '',
      clase: 'total',
      nombre: 'Total de quejas',
      valor: s.total,
      pie: `${s.ultimas24h} en las últimas 24 h`,
      icono: 'documento',
    },
    ...estado.catalogos.estados.map((e) => ({
      id: e.id,
      clase: e.id,
      nombre: e.nombre,
      valor: s.porEstado[e.id] ?? 0,
      pie: porcentaje(s.porEstado[e.id] ?? 0),
      icono: ICONOS_ESTADO[e.id],
    })),
  ];

  $('#indicadores').innerHTML = tarjetas
    .map(
      (t) => `
      <button type="button" class="indicador ${t.clase}" data-estado="${t.id}" aria-pressed="${estado.filtros.estado === t.id}"
        title="${t.id ? `Filtrar por: ${escaparHtml(t.nombre)}` : 'Ver todas las quejas'}">
        <span class="indicador-cabecera">${escaparHtml(t.nombre)}${icono(t.icono)}</span>
        <span class="indicador-valor">${t.valor}</span>
        <span class="indicador-pie">${escaparHtml(t.pie)}</span>
      </button>`
    )
    .join('');

  $('#indicadores')
    .querySelectorAll('.indicador')
    .forEach((boton) =>
      boton.addEventListener('click', () => {
        const nuevo = boton.dataset.estado;
        aplicarFiltro('estado', estado.filtros.estado === nuevo ? '' : nuevo);
      })
    );
}

function pintarGraficoCategorias() {
  const s = estado.estadisticas;
  if (!s || !estado.catalogos) return;
  const datos = estado.catalogos.categorias
    .map((c) => ({ ...c, valor: s.porCategoria[c.id] ?? 0 }))
    .sort((a, b) => b.valor - a.valor);
  const maximo = Math.max(1, ...datos.map((d) => d.valor));

  $('#grafico-categorias').innerHTML = datos
    .map(
      (d) => `
      <button type="button" class="barra" data-categoria="${escaparHtml(d.id)}" aria-pressed="${estado.filtros.categoria === d.id}"
        aria-label="${escaparHtml(d.nombre)}: ${d.valor} quejas. Filtrar por esta categoría">
        <span class="barra-etiqueta"><span class="barra-nombre">${icono(d.id)}${escaparHtml(d.nombre)}</span><span class="barra-valor">${d.valor}</span></span>
        <span class="barra-pista"><span style="width:${(d.valor / maximo) * 100}%"></span></span>
      </button>`
    )
    .join('');

  $('#grafico-categorias')
    .querySelectorAll('.barra')
    .forEach((b) =>
      b.addEventListener('click', () => {
        const nueva = b.dataset.categoria;
        aplicarFiltro('categoria', estado.filtros.categoria === nueva ? '' : nueva);
      })
    );
}

function pintarActividad() {
  const s = estado.estadisticas;
  const pendientes = (s.porEstado.recibida ?? 0) + (s.porEstado.en_revision ?? 0);
  const cerradas = (s.porEstado.resuelta ?? 0) + (s.porEstado.rechazada ?? 0);
  const tasa = s.total ? Math.round(((s.porEstado.resuelta ?? 0) / s.total) * 100) : 0;
  $('#actividad').innerHTML = `
    <dt>Nuevas en las últimas 24 h</dt><dd>${s.ultimas24h}</dd>
    <dt>Recibidas en los últimos 7 días</dt><dd>${s.ultimos7d}</dd>
    <dt>Pendientes de revisión</dt><dd>${pendientes}</dd>
    <dt>Cerradas</dt><dd>${cerradas}</dd>
    <dt>Tasa de resolución</dt><dd>${tasa} %</dd>`;
}

/* ───────────────────────── Filtros ───────────────────────── */

function aplicarFiltro(campo, valor) {
  estado.filtros[campo] = valor;
  estado.filtros.pagina = 1;
  const control = formularioFiltros.elements[campo];
  if (control) control.value = valor;
  pintarIndicadores();
  pintarGraficoCategorias();
  cargarLista();
}

function leerFiltrosDelFormulario() {
  const datos = new FormData(formularioFiltros);
  for (const campo of ['q', 'estado', 'categoria', 'prioridad', 'conFoto', 'desde', 'hasta', 'orden']) {
    estado.filtros[campo] = (datos.get(campo) || '').toString().trim();
  }
  estado.filtros.orden ||= 'recientes';
  estado.filtros.pagina = 1;
}

const hayFiltrosActivos = () =>
  ['q', 'estado', 'categoria', 'prioridad', 'conFoto', 'desde', 'hasta'].some((c) => estado.filtros[c]);

function configurarPanel() {
  $('#btn-actualizar').addEventListener('click', cargarTodo);
  $('#btn-salir').addEventListener('click', () => {
    limpiarSesion();
    mostrarLogin();
    notificar('Sesión cerrada correctamente.', 'exito');
  });

  const buscarConRetraso = retrasar(() => {
    leerFiltrosDelFormulario();
    cargarLista();
  }, 350);

  formularioFiltros.addEventListener('submit', (e) => e.preventDefault());
  formularioFiltros.addEventListener('input', (e) => {
    if (e.target.name === 'q') buscarConRetraso();
  });
  formularioFiltros.addEventListener('change', (e) => {
    if (e.target.name === 'q') return;
    leerFiltrosDelFormulario();
    pintarIndicadores();
    pintarGraficoCategorias();
    cargarLista();
  });
  formularioFiltros.addEventListener('reset', () => {
    // El navegador limpia los controles después del evento "reset".
    setTimeout(() => {
      estado.filtros = { ...FILTROS_INICIALES, limite: estado.filtros.limite };
      pintarIndicadores();
      pintarGraficoCategorias();
      cargarLista();
    });
  });

  // Delegación de eventos en la tabla: clic en cualquier parte de la fila abre el detalle.
  $('#cuerpo-tabla').addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-folio]');
    if (fila) abrirDetalle(fila.dataset.folio);
  });

  $('#paginacion').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-pagina]');
    if (!boton) return;
    estado.filtros.pagina = Number(boton.dataset.pagina);
    cargarLista();
    $('.bandeja').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#paginacion').addEventListener('change', (e) => {
    if (e.target.name !== 'limite') return;
    estado.filtros.limite = Number(e.target.value);
    estado.filtros.pagina = 1;
    cargarLista();
  });
}

/* ───────────────────────── Tabla ───────────────────────── */

function pintarFilasEsqueleto() {
  $('#cuerpo-tabla').innerHTML = Array.from(
    { length: 5 },
    () => `<tr class="fila-esqueleto"><td colspan="7"><div class="esqueleto"></div></td></tr>`
  ).join('');
}

function pintarTabla() {
  const cuerpo = $('#cuerpo-tabla');
  const { total } = estado.paginacion;
  $('#conteo-resultados').textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;

  if (!estado.quejas.length) {
    cuerpo.innerHTML = hayFiltrosActivos()
      ? `<tr class="fila-vacia"><td colspan="7"><div class="estado-vacio">${icono('filtro')}
          <strong>Ninguna queja coincide con los filtros</strong><span>Prueba con otros criterios de búsqueda.</span>
          <button type="button" class="btn btn-secundario btn-pequeno" id="btn-vaciar-filtros">${icono('x')}Limpiar filtros</button></div></td></tr>`
      : `<tr class="fila-vacia"><td colspan="7"><div class="estado-vacio">${icono('bandeja')}
          <strong>Aún no hay quejas registradas</strong>
          <span>Cuando un ciudadano envíe una queja desde el portal, aparecerá aquí automáticamente.</span>
          <a class="btn btn-secundario btn-pequeno" href="./" target="_blank" rel="noopener">${icono('externo')}Abrir portal ciudadano</a></div></td></tr>`;
    $('#btn-vaciar-filtros')?.addEventListener('click', () => formularioFiltros.reset());
    return;
  }

  const { categorias, estados, prioridades } = estado.catalogos ?? {};
  cuerpo.innerHTML = estado.quejas
    .map(
      (q) => `
      <tr data-folio="${escaparHtml(q.folio)}" class="${estado.detalle?.folio === q.folio ? 'seleccionada' : ''}">
        <td class="celda-folio"><span class="folio">${escaparHtml(q.folio)}</span>
          <span class="cuando" title="${escaparHtml(formatearFecha(q.fechaCreacion))}">${escaparHtml(fechaRelativa(q.fechaCreacion))}</span></td>
        <td class="celda-queja">
          <button type="button" class="boton-queja">${escaparHtml(q.asunto)}</button>
          <span class="extracto">${escaparHtml(q.descripcion)}</span>
        </td>
        <td class="celda-categoria"><span>${icono(q.categoria)}${escaparHtml(nombreDe(categorias, q.categoria))}</span></td>
        <td class="celda-ubicacion">${escaparHtml(q.ubicacion?.direccion)}${q.ubicacion?.zona ? `<small>${escaparHtml(q.ubicacion.zona)}</small>` : ''}</td>
        <td class="celda-foto centrado">${
          q.tieneFoto
            ? `<span class="miniatura" data-miniatura="${escaparHtml(q.folio)}" title="Tiene fotografía">${icono('imagen')}</span>`
            : `<span class="sin-foto" title="Sin fotografía">—</span>`
        }</td>
        <td class="celda-prioridad"><span class="insignia prioridad-${escaparHtml(q.prioridad)}">${escaparHtml(nombreDe(prioridades, q.prioridad))}</span></td>
        <td class="celda-estado"><span class="insignia estado-${escaparHtml(q.estado)}">${escaparHtml(nombreDe(estados, q.estado))}</span></td>
      </tr>`
    )
    .join('');

  cargarMiniaturas();
}

/** Las fotos requieren el token, por eso se descargan con fetch y se muestran como blob. */
function cargarMiniaturas() {
  document.querySelectorAll('[data-miniatura]').forEach(async (contenedor) => {
    const folio = contenedor.dataset.miniatura;
    try {
      let url = estado.miniaturas.get(folio);
      if (!url) {
        const blob = await api.obtenerFoto(folio, 'miniatura');
        url = URL.createObjectURL(blob);
        estado.miniaturas.set(folio, url);
      }
      contenedor.innerHTML = `<img src="${url}" alt="Miniatura de la fotografía de ${escaparHtml(folio)}" loading="lazy" />`;
    } catch {
      /* Se conserva el ícono si la miniatura no carga. */
    }
  });
}

function pintarPaginacion() {
  const { total, pagina, paginas, limite } = estado.paginacion;
  const nav = $('#paginacion');
  if (!total) {
    nav.innerHTML = '';
    return;
  }
  const desde = (pagina - 1) * limite + 1;
  const hasta = Math.min(total, pagina * limite);
  nav.innerHTML = `
    <span>Mostrando <strong>${desde}–${hasta}</strong> de <strong>${total}</strong></span>
    <div class="paginacion-botones">
      <label class="visualmente-oculto" for="limite">Resultados por página</label>
      <select id="limite" name="limite" class="control">
        ${[10, 20, 50].map((n) => `<option value="${n}" ${n === limite ? 'selected' : ''}>${n} por página</option>`).join('')}
      </select>
      <button type="button" class="btn btn-secundario btn-pequeno" data-pagina="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icono('izquierda')}</button>
      <span>Página ${pagina} de ${paginas}</span>
      <button type="button" class="btn btn-secundario btn-pequeno" data-pagina="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''} aria-label="Página siguiente">${icono('derecha')}</button>
    </div>`;
}

/* ───────────────────────── Detalle de una queja ───────────────────────── */

function configurarDetalle() {
  const cajon = $('#detalle');
  cajon.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) cerrarDetalle();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#visor').hidden) cerrarVisor();
      else if (!cajon.hidden) cerrarDetalle();
    }
    // Mantiene el foco dentro del cajón mientras está abierto (accesibilidad).
    if (e.key === 'Tab' && !cajon.hidden && $('#visor').hidden) {
      const enfocables = [...cajon.querySelectorAll('button, a[href], select, textarea, input')].filter((el) => !el.disabled && el.offsetParent);
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables.at(-1);
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
  });

  $('#visor-cerrar').addEventListener('click', cerrarVisor);
  $('#visor').addEventListener('click', (e) => {
    if (e.target.id === 'visor') cerrarVisor();
  });
}

function marcarFilaSeleccionada(folio) {
  document.querySelectorAll('#cuerpo-tabla tr').forEach((tr) => tr.classList.toggle('seleccionada', tr.dataset.folio === folio));
}

async function abrirDetalle(folio) {
  if (estado.detalle?.folio !== folio) liberarFotoDetalle();
  estado.ultimoFoco = document.activeElement;
  estado.detalle = { folio };
  marcarFilaSeleccionada(folio);

  $('#detalle-folio').textContent = folio;
  $('#detalle-titulo').textContent = 'Cargando…';
  $('#detalle-insignias').innerHTML = '';
  $('#detalle-cuerpo').innerHTML = `
    <div class="esqueleto" style="height:8rem"></div>
    <div class="esqueleto" style="height:16rem"></div>
    <div class="esqueleto" style="height:7rem"></div>`;
  $('#detalle').hidden = false;
  document.body.classList.add('sin-scroll');
  $('.cajon-panel').focus();

  try {
    const { datos } = await api.obtenerQueja(folio);
    if (estado.detalle?.folio !== folio) return; // Se abrió otra queja mientras cargaba.
    estado.detalle = datos;
    pintarDetalle(datos);
  } catch (error) {
    if (error.status === 401) return;
    $('#detalle-titulo').textContent = 'No se pudo abrir la queja';
    $('#detalle-cuerpo').innerHTML = `<div class="aviso aviso-error">${icono('alerta')}<span>${escaparHtml(error.message)}</span></div>`;
  }
}

function cerrarDetalle() {
  const cajon = $('#detalle');
  if (cajon.hidden) return;
  cajon.hidden = true;
  document.body.classList.remove('sin-scroll');
  liberarFotoDetalle();
  estado.detalle = null;
  marcarFilaSeleccionada(null);
  estado.ultimoFoco?.focus?.();
}

function liberarFotoDetalle() {
  if (estado.urlFotoDetalle) URL.revokeObjectURL(estado.urlFotoDetalle);
  estado.urlFotoDetalle = null;
}

const descripcionHistorial = (h, catalogos) => {
  if (h.tipo === 'prioridad') return `Prioridad cambiada a <strong>${escaparHtml(nombreDe(catalogos.prioridades, h.prioridad))}</strong>`;
  if (h.tipo === 'nota') return `Nota interna <span class="historial-tipo">(no visible para el ciudadano)</span>`;
  if (!h.estadoAnterior) return `Queja <strong>${escaparHtml(nombreDe(catalogos.estados, h.estado).toLowerCase())}</strong>`;
  return `Estado cambiado a <strong>${escaparHtml(nombreDe(catalogos.estados, h.estado))}</strong>`;
};

function pintarDetalle(q) {
  const cat = estado.catalogos;
  const opciones = (lista, actual) =>
    lista.map((c) => `<option value="${escaparHtml(c.id)}" ${c.id === actual ? 'selected' : ''}>${escaparHtml(c.nombre)}</option>`).join('');

  $('#detalle-titulo').textContent = q.asunto;
  $('#detalle-insignias').innerHTML = `
    <span class="insignia estado-${escaparHtml(q.estado)}">${escaparHtml(nombreDe(cat.estados, q.estado))}</span>
    <span class="insignia prioridad-${escaparHtml(q.prioridad)}">Prioridad ${escaparHtml(nombreDe(cat.prioridades, q.prioridad).toLowerCase())}</span>
    <span class="insignia">${escaparHtml(nombreDe(cat.categorias, q.categoria))}</span>`;

  const u = q.ubicacion || {};
  const coordenadas = u.coordenadas
    ? `<dt>Coordenadas GPS</dt><dd>${u.coordenadas.latitud.toFixed(5)}, ${u.coordenadas.longitud.toFixed(5)}
        · <a href="https://www.google.com/maps?q=${u.coordenadas.latitud},${u.coordenadas.longitud}" target="_blank" rel="noopener noreferrer">${icono('ubicacion')}Ver en mapa</a></dd>`
    : '';

  const c = q.ciudadano || {};
  const ciudadano = c.anonimo
    ? `<div class="sin-foto-bloque">${icono('usuario')}Reporte anónimo: el ciudadano no compartió datos de contacto.</div>`
    : `<dl class="datos">
        <div class="completo"><dt>Nombre</dt><dd>${escaparHtml(c.nombre || '—')}</dd></div>
        <div><dt>Correo electrónico</dt><dd>${c.correo ? `<a href="mailto:${escaparHtml(c.correo)}">${icono('correo')}${escaparHtml(c.correo)}</a>` : '—'}</dd></div>
        <div><dt>Teléfono</dt><dd>${c.telefono ? `<a href="tel:${escaparHtml(c.telefono)}">${icono('telefono')}${escaparHtml(c.telefono)}</a>` : '—'}</dd></div>
      </dl>`;

  const foto = q.tieneFoto
    ? `<button type="button" class="foto-detalle" id="btn-foto" aria-label="Ampliar fotografía"><div class="esqueleto"></div></button>
       <div class="foto-meta">
         <span>${q.foto ? `${q.foto.ancho} × ${q.foto.alto} px · ${formatearBytes(q.foto.bytes)} · almacenada en Firestore` : ''}</span>
         <a href="#" id="enlace-foto" hidden target="_blank" rel="noopener">${icono('externo')}Abrir en pestaña nueva</a>
       </div>`
    : `<div class="sin-foto-bloque">${icono('imagen')}El ciudadano no adjuntó fotografía.</div>`;

  const historial = [...(q.historial || [])]
    .reverse()
    .map(
      (h) => `
      <li>
        <span class="punto estado-${escaparHtml(h.estado || '')}"></span>
        <div class="titulo-evento">${descripcionHistorial(h, cat)}</div>
        <div class="meta-evento">${escaparHtml(h.usuario || 'Sistema')} · ${formatearFecha(h.fecha)}</div>
        ${h.comentario ? `<div class="comentario-evento">${escaparHtml(h.comentario)}</div>` : ''}
      </li>`
    )
    .join('');

  $('#detalle-cuerpo').innerHTML = `
    <section class="bloque">
      <h3 class="bloque-titulo">${icono('nota')}Descripción original<small>Tal como la escribió el ciudadano</small></h3>
      <blockquote class="descripcion-original">${escaparHtml(q.descripcion)}</blockquote>
    </section>

    <section class="bloque">
      <h3 class="bloque-titulo">${icono('camara')}Fotografía asociada</h3>
      ${foto}
    </section>

    <section class="bloque">
      <h3 class="bloque-titulo">${icono('ubicacion')}Ubicación</h3>
      <dl class="datos">
        <div class="completo"><dt>Dirección</dt><dd>${escaparHtml(u.direccion || '—')}</dd></div>
        <div><dt>Zona / colonia</dt><dd>${escaparHtml(u.zona || '—')}</dd></div>
        <div><dt>Referencia</dt><dd>${escaparHtml(u.referencia || '—')}</dd></div>
        ${coordenadas ? `<div class="completo">${coordenadas}</div>` : ''}
      </dl>
    </section>

    <section class="bloque">
      <h3 class="bloque-titulo">${icono('usuario')}Ciudadano y registro</h3>
      ${ciudadano}
      <dl class="datos" style="margin-top:.85rem">
        <div><dt>Fecha de registro</dt><dd>${formatearFecha(q.fechaCreacion)}</dd></div>
        <div><dt>Última actualización</dt><dd>${formatearFecha(q.fechaActualizacion)}</dd></div>
      </dl>
    </section>

    <section class="bloque">
      <h3 class="bloque-titulo">${icono('bandera')}Gestión de la queja</h3>
      <form id="formulario-gestion" class="gestion" novalidate>
        <div class="fila-2">
          <div class="campo">
            <label for="g-estado">Estado</label>
            <select id="g-estado" name="estado" class="control">${opciones(cat.estados, q.estado)}</select>
          </div>
          <div class="campo">
            <label for="g-prioridad">Prioridad</label>
            <select id="g-prioridad" name="prioridad" class="control">${opciones(cat.prioridades, q.prioridad)}</select>
          </div>
        </div>
        <div class="campo">
          <label for="g-comentario">Comentario <span class="opcional" id="g-comentario-nota">(opcional)</span></label>
          <textarea id="g-comentario" name="comentario" class="control" maxlength="1000"
            placeholder="Ej.: Se asignó la cuadrilla de bacheo para el jueves."></textarea>
          <p class="ayuda" id="g-ayuda">Si cambias el estado, el comentario será visible para el ciudadano al consultar su folio. Si no, se guarda como nota interna.</p>
          <p class="mensaje-error" data-error-de="comentario"></p>
          <p class="mensaje-error" data-error-de="estado"></p>
        </div>
        <div class="gestion-acciones">
          <button type="submit" class="btn btn-primario" id="btn-guardar">${icono('check')}<span>Guardar cambios</span></button>
        </div>
      </form>
    </section>

    <section class="bloque">
      <h3 class="bloque-titulo">${icono('reloj')}Historial</h3>
      <ul class="linea-tiempo">${historial}</ul>
    </section>`;

  configurarGestion(q);
  if (q.tieneFoto) cargarFotoDetalle(q.folio);
}

async function cargarFotoDetalle(folio) {
  const boton = $('#btn-foto');
  try {
    if (!estado.urlFotoDetalle) {
      const blob = await api.obtenerFoto(folio);
      if (estado.detalle?.folio !== folio) return;
      estado.urlFotoDetalle = URL.createObjectURL(blob);
    }
    boton.innerHTML = `<img src="${estado.urlFotoDetalle}" alt="Fotografía adjunta a la queja ${escaparHtml(folio)}" />`;
    boton.addEventListener('click', () => abrirVisor(estado.urlFotoDetalle, folio));
    const enlace = $('#enlace-foto');
    enlace.href = estado.urlFotoDetalle;
    enlace.hidden = false;
  } catch (error) {
    if (boton) boton.outerHTML = `<div class="sin-foto-bloque">${icono('alerta')}No se pudo cargar la fotografía: ${escaparHtml(error.message)}</div>`;
  }
}

function configurarGestion(q) {
  const formulario = $('#formulario-gestion');
  const selectorEstado = $('#g-estado');

  const actualizarAyuda = () => {
    const requiere = selectorEstado.value !== q.estado && ESTADOS_CON_COMENTARIO.includes(selectorEstado.value);
    $('#g-comentario-nota').textContent = requiere ? '(obligatorio para este estado)' : '(opcional)';
    $('#g-comentario-nota').className = requiere ? 'requerido' : 'opcional';
  };
  selectorEstado.addEventListener('change', actualizarAyuda);
  formulario.addEventListener('input', () => limpiarErroresDeCampos(formulario));

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErroresDeCampos(formulario);

    const cambios = {};
    const nuevoEstado = selectorEstado.value;
    const nuevaPrioridad = $('#g-prioridad').value;
    const comentario = $('#g-comentario').value.trim();
    if (nuevoEstado !== q.estado) cambios.estado = nuevoEstado;
    if (nuevaPrioridad !== q.prioridad) cambios.prioridad = nuevaPrioridad;
    if (comentario) cambios.comentario = comentario;

    if (!Object.keys(cambios).length) {
      mostrarErroresDeCampos(formulario, [{ campo: 'comentario', mensaje: 'No hay cambios que guardar: modifica el estado, la prioridad o escribe un comentario.' }]);
      return;
    }
    if (cambios.estado && ESTADOS_CON_COMENTARIO.includes(cambios.estado) && !comentario) {
      mostrarErroresDeCampos(formulario, [{ campo: 'comentario', mensaje: 'Explica al ciudadano cómo se resolvió o por qué no procede.' }]);
      $('#g-comentario').focus();
      return;
    }

    const boton = $('#btn-guardar');
    boton.disabled = true;
    boton.firstElementChild.outerHTML = '<span class="spinner" aria-hidden="true"></span>';
    try {
      const { datos, mensaje } = await api.actualizarQueja(q.folio, cambios);
      estado.detalle = datos;
      pintarDetalle(datos);
      notificar(mensaje || 'Cambios guardados.', 'exito');
      cargarEstadisticas();
      cargarLista();
    } catch (error) {
      if (error.status === 401) return;
      mostrarErroresDeCampos(formulario, error.detalles?.length ? error.detalles : [{ campo: 'comentario', mensaje: error.message }]);
      boton.disabled = false;
      boton.firstElementChild.outerHTML = icono('check');
    }
  });
}

function abrirVisor(url, folio) {
  const img = $('#visor-img');
  img.src = url;
  img.alt = `Fotografía de la queja ${folio}`;
  $('#visor').hidden = false;
  $('#visor-cerrar').focus();
}

function cerrarVisor() {
  $('#visor').hidden = true;
  $('#visor-img').removeAttribute('src');
  $('#btn-foto')?.focus();
}

iniciar();
