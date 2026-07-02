const state = {
  view: 'dashboard',
  catalogoItems: [],
  proveedores: [],
  materias: [],
  lotesMp: [],
  productos: [],
  tipos: [],
  recetas: [],
  explosion: [],
  ordenes: [],
  fases: [],
  lotesProd: [],
  operarios: [],
  equipos: [],
  registros: [],
  calidad: []
};

const endpoints = {
  catalogoItems: '/api/catalogo-items',
  proveedores: '/api/proveedores',
  materias: '/api/materias-primas',
  lotesMp: '/api/lotes-materia-prima',
  productos: '/api/productos',
  tipos: '/api/tipos-preparacion',
  recetas: '/api/recetas',
  explosion: '/api/explosion-materiales',
  ordenes: '/api/ordenes',
  fases: '/api/fases',
  lotesProd: '/api/lotes-produccion',
  operarios: '/api/operarios',
  equipos: '/api/equipos',
  registros: '/api/registros-fase',
  calidad: '/api/control-calidad'
};

let mixingInterval = null;
let mixingStartedAt = null;

const $ = (selector) => document.querySelector(selector);

function setStatus(text, isError = false) {
  const el = $('#status');
  el.textContent = text;
  el.style.color = isError ? '#b42318' : '#687583';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Solicitud fallida.');
  return data;
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach((key) => {
    if (data[key] === '') data[key] = null;
    if (key.startsWith('id_') && data[key] !== null) data[key] = Number(data[key]);
    if (['peso_recibido', 'temperatura_objetivo', 'cantidad_objetivo', 'temperatura_masa', 'peso_total', 'peso_por_porcion', 'duracion_amasado_seg'].includes(key) && data[key] !== null) data[key] = Number(data[key]);
  });
  return data;
}

function fillSelect(selector, rows, valueKey, labelFn, blank = true) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = blank ? '<option value="">Seleccionar</option>' : '';
  rows.forEach((row) => {
    const option = document.createElement('option');
    option.value = row[valueKey];
    option.textContent = labelFn(row);
    el.appendChild(option);
  });
}

function table(rows, columns, actions) {
  if (!rows.length) return '<p class="muted">Sin registros.</p>';
  const head = columns.map((col) => `<th>${col.label}</th>`).join('') + (actions ? '<th>Acciones</th>' : '');
  const body = rows.map((row) => {
    const cells = columns.map((col) => `<td>${col.render ? col.render(row) : row[col.key] ?? ''}</td>`).join('');
    return `<tr>${cells}${actions ? `<td>${actions(row)}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function formatDate(value) {
  if (!value) return '';
  const [datePart] = String(value).split('T');
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function loadAll() {
  setStatus('Cargando datos...');
  const pairs = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
    try {
      return [key, await api(url)];
    } catch {
      return [key, []];
    }
  }));
  pairs.forEach(([key, value]) => state[key] = value);
  render();
  setStatus('Datos actualizados');
}

function render() {
  renderSelects();
  renderDashboard();
  renderCatalogo();
  renderExplosionIndex();
  renderProveedores();
  renderMaterias();
  renderStock();
  renderOrdenes();
  renderLotes();
  renderRegistros();
  renderCalidad();
}

function renderCatalogo() {
  $('#tabla-catalogo').innerHTML = table(state.catalogoItems, [
    { label: 'Codigo', key: 'codigo' },
    { label: 'Descripcion', key: 'descripcion' },
    { label: 'Tipo', key: 'tipo_item' },
    { label: 'Unidad', key: 'unidad_medida' },
    { label: 'Familia', key: 'familia' },
    { label: 'Activo', render: (r) => Number(r.activo) ? 'Si' : 'No' }
  ]);
}

function renderExplosionIndex() {
  if (!$('#explosion-result') || state.view === 'explosion') return;
}

function renderExplosionResult(data) {
  $('#explosion-result').classList.remove('muted');
  $('#explosion-result').innerHTML = `
    <p><strong>${data.codigo}</strong> - ${data.descripcion}</p>
    ${table(data.componentes || [], [
      { label: 'Codigo', key: 'codigo' },
      { label: 'Descripcion', key: 'descripcion' },
      { label: 'Tipo', key: 'tipo_item' },
      { label: 'Cantidad', render: (r) => `${r.cantidad} ${r.unidad}` },
      { label: 'Nivel', key: 'nivel' }
    ])}
    <button type="button" id="explosion-to-order" class="secondary">Generar orden</button>
  `;
  $('#explosion-to-order').addEventListener('click', () => {
    const product = state.productos.find((row) => row.codigo_item === data.codigo);
    if (!product) {
      setStatus('Ese codigo no esta registrado como producto terminado para crear orden.', true);
      return;
    }
    setView('ordenes');
    $('#orden-producto').value = product.id_producto;
    setStatus(`Producto ${data.codigo} seleccionado para nueva orden`);
  });
}

function renderSelects() {
  fillSelect('#lote-mp-materia', state.materias, 'id_materia_prima', (r) => `${r.codigo_item || 'MP'} - ${r.nombre} (${r.unidad_medida})`);
  fillSelect('#lote-mp-proveedor', state.proveedores, 'id_proveedor', (r) => r.nombre);
  fillSelect('#stock-tipo', state.tipos.filter((r) => r.nombre !== 'Producto terminado'), 'id_tipo_preparacion', (r) => `${r.codigo_item || r.categoria || 'ST'} - ${r.nombre}`, false);
  fillSelect('#orden-producto', state.productos, 'id_producto', (r) => `${r.codigo_item || 'PT'} - ${r.nombre}`);
  fillSelect('#tr-orden', state.ordenes, 'id_orden', (r) => r.codigo_orden, false);
  fillSelect('#tr-fase', state.fases.filter((r) => !['Recepcion materia prima', 'Generacion de lote para stock'].includes(r.nombre_fase)), 'id_fase', (r) => r.nombre_fase, false);
  updateOutputPreview();
  updatePhaseFields(false);
  fillSelect('#cc-lote', state.lotesProd, 'id_lote_prod', (r) => `${r.codigo_lote} - ${r.cantidad_actual} ${r.unidad_medida}`);
  document.querySelectorAll('.origin-row').forEach(updateOriginLotSelect);
}

function renderStock() {
  const rows = state.lotesProd.filter((row) => row.codigo_orden === 'STOCK-GENERAL');
  $('#tabla-stock').innerHTML = table(rows, [
    { label: 'Codigo', key: 'codigo_lote' },
    { label: 'Preparacion', key: 'tipo_preparacion' },
    { label: 'Disponible', render: (r) => `${r.cantidad_actual} ${r.unidad_medida}` },
    { label: 'Creacion', render: (r) => formatDate(r.fecha_creacion) },
    { label: 'Estado', key: 'estado' }
  ], (row) => `<button data-stock-trace="${row.codigo_lote}" class="secondary">Trazabilidad</button>`);
}

function renderProveedores() {
  $('#tabla-proveedores').innerHTML = table(state.proveedores, [
    { label: 'Nombre', key: 'nombre' },
    { label: 'Contacto', key: 'contacto' },
    { label: 'Telefono', key: 'telefono' },
    { label: 'Email', key: 'email' },
    { label: 'Estado', key: 'estado' }
  ]);
}

function renderDashboard() {
  $('#dashboard').innerHTML = `
    <div class="cards">
      <div class="card">Catalogo<strong>${state.catalogoItems.length}</strong></div>
      <div class="card">Materias primas<strong>${state.lotesMp.length}</strong></div>
      <div class="card">Ordenes<strong>${state.ordenes.length}</strong></div>
      <div class="card">Lotes produccion<strong>${state.lotesProd.length}</strong></div>
      <div class="card">Controles calidad<strong>${state.calidad.length}</strong></div>
    </div>
    <div class="panel">
      <h2>Ultimos lotes</h2>
      ${table(state.lotesProd.slice(0, 6), [
        { label: 'Codigo', key: 'codigo_lote' },
        { label: 'Preparacion', key: 'tipo_preparacion' },
        { label: 'Fase', key: 'nombre_fase' },
        { label: 'Cantidad', render: (r) => `${r.cantidad_actual} ${r.unidad_medida}` },
        { label: 'Estado', key: 'estado' }
      ])}
    </div>`;
}

function renderMaterias() {
  $('#tabla-materias').innerHTML = table(state.materias, [
    { label: 'Codigo item', key: 'codigo_item' },
    { label: 'Materia prima', key: 'nombre' },
    { label: 'Descripcion', key: 'descripcion' },
    { label: 'Unidad', key: 'unidad_medida' },
    { label: 'Temperatura objetivo', key: 'temperatura_objetivo' },
    { label: 'Estado', key: 'estado' }
  ]);
  $('#tabla-mp').innerHTML = table(state.lotesMp, [
    { label: 'Lote proveedor', key: 'lote_proveedor' },
    { label: 'Materia', key: 'materia_prima' },
    { label: 'Proveedor', key: 'proveedor' },
    { label: 'Peso recibido', render: (r) => `${r.peso_recibido} ${r.unidad_medida || ''}` },
    { label: 'Fecha recepcion', render: (r) => formatDate(r.fecha_recepcion) },
    { label: 'Vence', render: (r) => formatDate(r.fecha_vencimiento) },
    { label: 'Estado', key: 'estado' }
  ]);
}

function renderOrdenes() {
  $('#tabla-ordenes').innerHTML = table(state.ordenes, [
    { label: 'Codigo', key: 'codigo_orden' },
    { label: 'Producto', key: 'producto' },
    { label: 'Receta', key: 'nombre_receta' },
    { label: 'Objetivo', render: (r) => `${r.cantidad_objetivo} ${r.unidad_medida}` },
    { label: 'Estado', key: 'estado' },
    { label: 'Responsable', key: 'responsable' }
  ], (row) => `<button data-order-production="${row.id_orden}">Registrar</button>`);
}

function renderLotes() {
  $('#tabla-lotes').innerHTML = table(state.lotesProd.filter((row) => row.codigo_orden !== 'STOCK-GENERAL'), [
    { label: 'Codigo', key: 'codigo_lote' },
    { label: 'Tipo', render: (r) => r.tipo_lote === 'PRODUCTO_TERMINADO' ? 'PT' : 'ST' },
    { label: 'Preparacion', key: 'tipo_preparacion' },
    { label: 'Orden', key: 'codigo_orden' },
    { label: 'Fase', key: 'nombre_fase' },
    { label: 'Cantidad', render: (r) => `${r.cantidad_actual} ${r.unidad_medida}` }
  ], (row) => `<button data-lote="${row.id_lote_prod}" class="secondary">Ver</button>`);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const remaining = String(seconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${remaining}`;
}

function renderRegistros() {
  $('#tabla-registros').innerHTML = table(state.registros, [
    { label: 'Orden', key: 'codigo_orden' },
    { label: 'Lote generado', key: 'codigo_lote' },
    { label: 'Tipo', render: (r) => r.tipo_lote === 'PRODUCTO_TERMINADO' ? 'PT' : 'ST' },
    { label: 'Fase', key: 'nombre_fase' },
    { label: 'Temperatura masa', render: (r) => r.temperatura_masa == null ? '' : `${r.temperatura_masa} C` },
    { label: 'Peso total', render: (r) => `${r.peso_salida} kg` },
    { label: 'Peso por porcion', render: (r) => r.peso_por_porcion == null ? '' : `${r.peso_por_porcion} kg` },
    { label: 'Tiempo', render: (r) => r.duracion_amasado_seg == null ? '-' : formatDuration(r.duracion_amasado_seg) }
  ]);
}

function renderCalidad() {
  $('#tabla-calidad').innerHTML = table(state.calidad, [
    { label: 'Fecha', render: (r) => formatDate(r.fecha) },
    { label: 'Lote', key: 'codigo_lote' },
    { label: 'Parametro', key: 'parametro' },
    { label: 'Valor', key: 'valor' },
    { label: 'Resultado', key: 'resultado' }
  ]);
}

function updateOriginLotSelect(row) {
  const type = row.querySelector('.origin-type').value;
  const select = row.querySelector('.origin-lot');
  const current = select.value;
  const context = row.dataset.context || 'order';
  const selectedOrder = Number($('#tr-orden').value);
  const lots = type === 'MP'
    ? state.lotesMp.filter((l) => Number(l.peso_disponible) > 0)
    : state.lotesProd.filter((l) => {
      if (Number(l.cantidad_actual) <= 0) return false;
      if (context === 'stock') return l.codigo_orden === 'STOCK-GENERAL';
      return l.codigo_orden === 'STOCK-GENERAL' || !selectedOrder || l.id_orden === selectedOrder;
    });
  select.innerHTML = lots.map((lot) => {
    const value = type === 'MP' ? lot.id_lote_mp : lot.id_lote_prod;
    const label = type === 'MP'
      ? `${lot.lote_proveedor} - ${lot.materia_prima} - ${lot.proveedor} (${lot.peso_disponible})`
      : `${lot.codigo_lote} - ${lot.tipo_preparacion || lot.tipo_lote} (${lot.cantidad_actual})`;
    return `<option value="${value}">${label}</option>`;
  }).join('');
  if (current) select.value = current;
}

function addOriginRow(containerId = 'origenes', context = 'order') {
  const node = $('#origin-template').content.firstElementChild.cloneNode(true);
  node.dataset.context = context;
  $(`#${containerId}`).appendChild(node);
  updateOriginLotSelect(node);
  calcWeights(context);
}

function calcWeights(context = 'order') {
  const container = context === 'stock' ? $('#stock-origenes') : $('#origenes');
  const output = context === 'stock' ? $('#stock-origin-total') : $('#origin-total');
  const total = [...container.querySelectorAll('.origin-qty')].reduce((sum, input) => sum + Number(input.value || 0), 0);
  output.textContent = `Total seleccionado: ${total.toFixed(3)} kg`;
}

function originsPayload(form) {
  return [...form.querySelectorAll('.origin-row')].map((row) => {
    const tipo = row.querySelector('.origin-type').value;
    return {
      tipo_lote_origen: tipo,
      id_lote_mp_origen: tipo === 'MP' ? Number(row.querySelector('.origin-lot').value) : null,
      id_lote_prod_origen: tipo === 'PROD' ? Number(row.querySelector('.origin-lot').value) : null,
      cantidad_consumida: Number(row.querySelector('.origin-qty').value),
      unidad_medida: row.querySelector('.origin-unit').value || 'kg'
    };
  });
}

function transformationPayload(form) {
  const data = formData(form);
  data.consumos = originsPayload(form);
  return data;
}

const outputByPhase = {
  'Preparacion mantequilla empastada': ['ST', 'EMP-MANT'],
  'Preparacion de masa': ['ST', 'MASA-B'],
  'Empaste': ['ST', 'MASA-EMP'],
  'Laminado': ['ST', 'LAM-HOJ'],
  'Reposo': ['ST', 'REP-HOJ'],
  'Formado': ['ST', 'FORM-CROI'],
  'Congelado': ['ST', 'CONG-CROI'],
  'Horneado': ['PT', 'PT-CROI'],
  'Empaque': ['PT', 'PT-CROI']
};

const fieldsByPhase = {
  'Preparacion mantequilla empastada': { temperature: true, temperatureLabel: 'Temperatura de mantequilla (C)' },
  'Preparacion de masa': { temperature: true, portion: true, timer: true, temperatureLabel: 'Temperatura de masa (C)' },
  'Empaste': { temperature: true, temperatureLabel: 'Temperatura de empaste (C)' },
  'Laminado': { temperature: true, temperatureLabel: 'Temperatura de masa (C)' },
  'Reposo': { temperature: true, temperatureLabel: 'Temperatura de masa (C)' },
  'Formado': { portion: true },
  'Congelado': { temperature: true, temperatureLabel: 'Temperatura de congelado (C)' },
  'Horneado': { temperature: true, temperatureLabel: 'Temperatura de horno (C)' },
  'Empaque': { portion: true }
};

function currentPhase() {
  const phaseId = Number($('#tr-fase').value);
  return state.fases.find((item) => item.id_fase === phaseId);
}

function currentPhaseFields() {
  return fieldsByPhase[currentPhase()?.nombre_fase] || {};
}

function updateOutputPreview() {
  const phase = currentPhase();
  const output = outputByPhase[phase?.nombre_fase] || ['ST', 'Lote automatico'];
  $('#output-preview').textContent = `${output[0]} | ${output[1]}`;
  $('#output-preview').classList.toggle('final', output[0] === 'PT');
}

function updatePhaseFields(resetClock = true) {
  const fields = currentPhaseFields();
  const temperatureField = $('#field-temperatura');
  const portionField = $('#field-peso-porcion');
  const temperatureInput = temperatureField.querySelector('input');
  const portionInput = portionField.querySelector('input');

  temperatureField.classList.toggle('is-hidden', !fields.temperature);
  portionField.classList.toggle('is-hidden', !fields.portion);
  $('#timer-panel').classList.toggle('is-hidden', !fields.timer);
  $('#label-temperatura').textContent = fields.temperatureLabel || 'Temperatura (C)';
  temperatureInput.required = Boolean(fields.temperature);
  portionInput.required = Boolean(fields.portion);
  if (!fields.temperature) temperatureInput.value = '';
  if (!fields.portion) portionInput.value = '';
  if (resetClock) resetMixingTimer();
  $('#save-mixing').disabled = Boolean(fields.timer && !$('#mixing-end').value);
}

function localTime(date) {
  return date.toTimeString().slice(0, 8);
}

function updateMixingClock() {
  if (!mixingStartedAt) return;
  const seconds = Math.floor((Date.now() - mixingStartedAt) / 1000);
  $('#mixing-time').textContent = formatDuration(seconds);
  $('#mixing-seconds').value = Math.max(1, seconds);
}

function startMixing() {
  if (mixingInterval) return;
  mixingStartedAt = Date.now();
  $('#mixing-start').value = localTime(new Date(mixingStartedAt));
  $('#mixing-end').value = '';
  $('#mixing-seconds').value = 1;
  $('#start-mixing').disabled = true;
  $('#stop-mixing').disabled = false;
  $('#save-mixing').disabled = true;
  updateMixingClock();
  mixingInterval = window.setInterval(updateMixingClock, 1000);
  setStatus('Amasado en curso');
}

function stopMixing() {
  if (!mixingStartedAt) return;
  window.clearInterval(mixingInterval);
  mixingInterval = null;
  updateMixingClock();
  $('#mixing-end').value = localTime(new Date());
  mixingStartedAt = null;
  $('#stop-mixing').disabled = true;
  $('#save-mixing').disabled = false;
  setStatus('Amasado finalizado');
}

function resetMixingTimer() {
  window.clearInterval(mixingInterval);
  mixingInterval = null;
  mixingStartedAt = null;
  $('#mixing-time').textContent = '00:00:00';
  $('#mixing-start').value = '';
  $('#mixing-end').value = '';
  $('#mixing-seconds').value = '';
  $('#start-mixing').disabled = false;
  $('#stop-mixing').disabled = true;
  $('#save-mixing').disabled = Boolean(currentPhaseFields().timer);
}

function activatePanel(button) {
  const tabs = button.closest('.tabs');
  const group = tabs.dataset.tabs;
  tabs.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button));
  document.querySelectorAll(group === 'mp' ? '#materias .tab-panel' : '#ordenes .tab-panel')
    .forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.panel));
}

function traceNodeType(node) {
  if (node.tipo === 'MP') return 'mp';
  return node.datos?.tipo_lote === 'PRODUCTO_TERMINADO' ? 'pt' : 'st';
}

function traceNodeLabel(node) {
  if (node.tipo === 'MP') return 'MP';
  return node.datos?.tipo_lote === 'PRODUCTO_TERMINADO' ? 'PT' : 'ST';
}

function renderTraceNode(node) {
  const type = traceNodeType(node);
  const consumed = node.consumo
    ? `<span>${node.consumo.cantidad_consumida} ${node.consumo.unidad_medida}</span>`
    : '';
  const subtitle = node.tipo === 'MP'
    ? `${node.datos?.materia_prima || 'Materia prima'}`
    : `${node.datos?.tipo_preparacion || node.datos?.tipo_lote || 'Lote'}${node.datos?.nombre_fase ? ` | ${node.datos.nombre_fase}` : ''}`;
  const meta = node.tipo === 'MP'
    ? `Recibido: ${node.datos?.peso_recibido ?? 0} ${node.datos?.unidad_medida || ''}`
    : `Orden: ${node.datos?.codigo_orden || ''}`;
  const parents = node.origenes?.length
    ? `
      <div class="trace-parents">
        ${node.origenes.map(renderTraceNode).join('')}
      </div>
      <div class="trace-drop"></div>`
    : '';

  return `
    <div class="trace-branch">
      ${parents}
      <div class="trace-node trace-node-${type}">
        <div class="trace-node-head">
          <span class="trace-badge">${traceNodeLabel(node)}</span>
          ${consumed}
        </div>
        <strong>${node.lote || 'Sin lote'}</strong>
        <small>${subtitle}</small>
        <small>${meta}</small>
      </div>
    </div>`;
}

async function showLot(id) {
  const lote = await api(`/api/lotes-produccion/${id}`);
  $('#detalle-lote').innerHTML = `
    <p><strong>${lote.codigo_lote}</strong></p>
    <p>Tipo: ${lote.tipo_lote}</p>
    <p>Preparacion: ${lote.tipo_preparacion || ''}</p>
    <p>Orden: ${lote.codigo_orden}</p>
    <p>Receta: ${lote.nombre_receta || ''}</p>
    <p>Fase: ${lote.nombre_fase || ''}</p>
    <p>Cantidad: ${lote.cantidad_actual} ${lote.unidad_medida}</p>
    <p>Estado: ${lote.estado}</p>
    <p>Creacion: ${formatDate(lote.fecha_creacion)}</p>
    <p>${lote.observaciones || ''}</p>
    <button class="secondary" id="trace-this">Ver trazabilidad hacia atras</button>
    <h3>Usado en</h3>
    ${table(lote.usado_en || [], [
      { label: 'Destino', key: 'lote_destino' },
      { label: 'Cantidad', render: (r) => `${r.cantidad_consumida} ${r.unidad_medida}` },
      { label: 'Fecha', render: (r) => formatDate(r.fecha_consumo) }
    ])}
  `;
  $('#trace-this').addEventListener('click', () => {
    $('#trace-code').value = lote.codigo_lote;
    setView('trazabilidad');
    $('#trace-form').requestSubmit();
  });
}

function setView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === name));
  document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $('#page-title').textContent = document.querySelector(`.nav[data-view="${name}"]`).textContent;
}

function bindForms() {
  const simpleForms = [
    ['#catalogo-item-form', '/api/catalogo-items'],
    ['#materia-form', '/api/materias-primas'],
    ['#proveedor-form', '/api/proveedores'],
    ['#lote-mp-form', '/api/lotes-materia-prima'],
    ['#orden-form', '/api/ordenes'],
    ['#calidad-form', '/api/control-calidad']
  ];
  simpleForms.forEach(([selector, url]) => {
    $(selector).addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api(url, { method: 'POST', body: JSON.stringify(formData(form)) });
        form.reset();
        await loadAll();
        setStatus('Registro guardado');
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  });

  $('#transformacion-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api('/api/transformaciones', { method: 'POST', body: JSON.stringify(transformationPayload(form)) });
      form.reset();
      $('#origenes').innerHTML = '';
      addOriginRow();
      resetMixingTimer();
      await loadAll();
      document.querySelector('[data-panel="orden-lotes"]').click();
      setStatus('Lote generado automaticamente');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  $('#stock-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = formData(form);
      data.consumos = originsPayload(form);
      const created = await api('/api/lotes-stock', { method: 'POST', body: JSON.stringify(data) });
      form.reset();
      $('#stock-origenes').innerHTML = '';
      addOriginRow('stock-origenes', 'stock');
      await loadAll();
      setStatus(`Lote ${created.codigo_lote} generado para stock general`);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  $('#trace-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const code = $('#trace-code').value.trim();
      const tree = await api(`/api/trazabilidad/codigo/${encodeURIComponent(code)}`);
      $('#trace-result').innerHTML = `<div class="trace-tree">${renderTraceNode(tree)}</div>`;
      setStatus('Trazabilidad cargada');
    } catch (error) {
      $('#trace-result').innerHTML = '';
      setStatus(error.message, true);
    }
  });

  $('#explosion-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const code = $('#explosion-code').value.trim();
      const data = await api(`/api/explosion-materiales/producto/${encodeURIComponent(code)}`);
      renderExplosionResult(data);
      setStatus('Explosion de materiales cargada');
    } catch (error) {
      $('#explosion-result').classList.add('muted');
      $('#explosion-result').textContent = '';
      setStatus(error.message, true);
    }
  });
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('.nav');
  if (nav) setView(nav.dataset.view);

  const tab = event.target.closest('.tab');
  if (tab) activatePanel(tab);

  const orderButton = event.target.closest('[data-order-production]');
  if (orderButton) {
    $('#transformacion-form').reset();
    $('#origenes').innerHTML = '';
    addOriginRow();
    $('#tr-orden').value = orderButton.dataset.orderProduction;
    updatePhaseFields();
    document.querySelector('[data-panel="orden-amasado"]').click();
  }

  const stockTrace = event.target.closest('[data-stock-trace]');
  if (stockTrace) {
    $('#trace-code').value = stockTrace.dataset.stockTrace;
    setView('trazabilidad');
    $('#trace-form').requestSubmit();
  }

  const loteButton = event.target.closest('[data-lote]');
  if (loteButton) showLot(loteButton.dataset.lote).catch((error) => setStatus(error.message, true));

  if (event.target.id === 'add-origin') addOriginRow();
  if (event.target.id === 'add-stock-origin') addOriginRow('stock-origenes', 'stock');
  if (event.target.id === 'start-mixing') startMixing();
  if (event.target.id === 'stop-mixing') stopMixing();
  if (event.target.classList.contains('remove-origin')) {
    const row = event.target.closest('.origin-row');
    const context = row.dataset.context || 'order';
    row.remove();
    calcWeights(context);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.classList.contains('origin-qty')) calcWeights(event.target.closest('.origin-row').dataset.context || 'order');
});

document.addEventListener('change', (event) => {
  if (event.target.classList.contains('origin-type')) updateOriginLotSelect(event.target.closest('.origin-row'));
  if (event.target.id === 'tr-fase') {
    updateOutputPreview();
    updatePhaseFields();
  }
  if (event.target.id === 'tr-orden') {
    resetMixingTimer();
    document.querySelectorAll('.origin-row').forEach(updateOriginLotSelect);
  }
});

$('#refresh').addEventListener('click', loadAll);
bindForms();
addOriginRow();
addOriginRow('stock-origenes', 'stock');
loadAll();
