const state = {
  view: 'dashboard',
  catalogoItems: [],
  ubicaciones: [],
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
  ubicaciones: '/api/ubicaciones',
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
const unitOptions = ['kg', 'g', 'L', 'ml', 'UND', 'Bandeja', 'Saco', 'Receta'];

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
    if (['peso_recibido', 'temperatura_objetivo', 'cantidad_objetivo', 'temperatura_masa', 'peso_total', 'peso_por_porcion', 'duracion_amasado_seg'].includes(key) && data[key] !== null) {
      data[key] = normalizeNumberText(data[key]);
    }
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

function fillUnitSelect(selectorOrElement, selected = 'kg') {
  const el = typeof selectorOrElement === 'string' ? $(selectorOrElement) : selectorOrElement;
  if (!el) return;
  const current = selected || el.value || 'kg';
  el.innerHTML = unitOptions.map((unit) => `<option value="${unit}">${unit}</option>`).join('');
  el.value = unitOptions.includes(current) ? current : 'kg';
}

function fillLocationSelect(selector, selected = '') {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = '<option value="">Sin ubicacion</option>';
  state.ubicaciones.forEach((row) => {
    const option = document.createElement('option');
    option.value = row.id_ubicacion;
    option.textContent = `${row.nombre}${row.tipo ? ` (${row.tipo})` : ''}`;
    el.appendChild(option);
  });
  if (selected) el.value = selected;
}

function optionText(value) {
  return String(value || '').toLowerCase();
}

function filterRows(rows, query, labelFn) {
  const term = optionText(query).trim();
  if (!term) return rows;
  return rows.filter((row) => optionText(labelFn(row)).includes(term));
}

function fillDatalist(selector, rows, labelFn) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = rows.map((row) => `<option value="${labelFn(row)}"></option>`).join('');
}

function table(rows, columns, actions) {
  if (!rows.length) return '<p class="muted">Sin registros.</p>';
  const head = columns.map((col) => `<th>${col.label}</th>`).join('') + (actions ? '<th>Acciones</th>' : '');
  const body = rows.map((row) => {
    const cells = columns.map((col) => `<td data-label="${col.label}">${col.render ? col.render(row) : row[col.key] ?? ''}</td>`).join('');
    return `<tr>${cells}${actions ? `<td data-label="Acciones">${actions(row)}</td>` : ''}</tr>`;
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
      { label: 'Disponible', render: (r) => `${r.disponible ?? 0} ${r.unidad_disponible || r.unidad || ''}` },
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
    setProductCombo(product.id_producto);
    setStatus(`Producto ${data.codigo} seleccionado para nueva orden`);
  });
}

function renderSelects() {
  fillUnitSelect('#catalogo-unidad', 'kg');
  fillUnitSelect('#materia-unidad', 'kg');
  fillLocationSelect('#lote-mp-ubicacion');
  fillLocationSelect('#stock-ubicacion', defaultLocationForUnit($('#stock-unidad')?.value));
  fillLocationSelect('#tr-ubicacion', defaultLocationForUnit($('#tr-unidad')?.value));
  fillSelect('#lote-mp-materia', state.materias, 'id_materia_prima', (r) => `${r.codigo_item || 'MP'} - ${r.nombre} (${r.unidad_medida})`);
  fillSelect('#lote-mp-proveedor', state.proveedores, 'id_proveedor', (r) => r.nombre);
  renderProductSelect();
  renderOrderSelect();
  renderStockPreparationSelect();
  fillUnitSelect('#orden-unidad', selectedProductUnit());
  fillUnitSelect('#tr-unidad', selectedOrderUnit());
  fillUnitSelect('#stock-unidad', selectedStockPreparationUnit());
  fillSelect('#tr-fase', state.fases.filter((r) => !['Recepcion materia prima', 'Generacion de lote para stock'].includes(r.nombre_fase)), 'id_fase', (r) => r.nombre_fase, false);
  updateOutputPreview();
  updatePhaseFields(false);
  fillSelect('#cc-lote', state.lotesProd, 'id_lote_prod', (r) => `${r.codigo_lote} - ${r.cantidad_actual} ${r.unidad_medida}`);
  document.querySelectorAll('.origin-row').forEach(updateOriginLotSelect);
}

function productLabel(row) {
  return `${row.codigo_item || 'PT'} - ${row.nombre}`;
}

function orderLabel(row) {
  return `${row.codigo_orden} - ${row.producto || ''} (${row.cantidad_objetivo} ${row.unidad_medida || ''})`;
}

function preparationLabel(row) {
  return `${row.codigo_item || row.categoria || 'ST'} - ${row.nombre}`;
}

function stockPreparations() {
  return state.tipos.filter((row) => {
    const name = String(row.nombre || '').toLowerCase();
    const code = String(row.codigo_item || row.categoria || '').toUpperCase();
    const isRecipeStage = code.startsWith('STPC') || (name.includes('congelado') && name.includes('1 und'));
    const isInternalOnly = ['producto terminado', 'lote consolidado', 'croissant formado', 'croissant congelado'].includes(name);
    return row.estado !== 'INACTIVO' && !isInternalOnly && !isRecipeStage;
  });
}

function renderProductSelect() {
  fillDatalist('#orden-producto-options', state.productos, productLabel);
  syncProductCombo(false);
}

function renderOrderSelect() {
  fillDatalist('#tr-orden-options', state.ordenes, orderLabel);
  syncOrderCombo(false);
}

function renderStockPreparationSelect() {
  fillDatalist('#stock-prep-options', stockPreparations(), preparationLabel);
  syncStockPreparationCombo(false);
}

function selectedProductUnit() {
  const product = state.productos.find((row) => String(row.id_producto) === String($('#orden-producto')?.value));
  return product?.unidad_medida || product?.unidad_item || 'kg';
}

function selectedOrderUnit() {
  const order = state.ordenes.find((row) => String(row.id_orden) === String($('#tr-orden')?.value));
  return order?.unidad_medida || 'kg';
}

function selectedStockPreparationUnit() {
  const preparation = state.tipos.find((row) => String(row.id_tipo_preparacion) === String($('#stock-prep')?.value));
  return preparation?.unidad_medida || 'kg';
}

function defaultLocationForUnit(unit) {
  const normalized = String(unit || '').toLowerCase();
  const wanted = normalized === 'und' ? 'Congelador' : normalized === 'kg' ? 'Nevera' : '';
  const location = state.ubicaciones.find((row) => row.nombre === wanted);
  return location?.id_ubicacion || '';
}

function findProductFromCombo() {
  const value = optionText($('#orden-producto-combo')?.value);
  return state.productos.find((row) => {
    const code = optionText(row.codigo_item);
    const name = optionText(row.nombre);
    return optionText(productLabel(row)) === value || code === value || name === value;
  });
}

function findOrderFromCombo() {
  const value = optionText($('#tr-orden-combo')?.value);
  return state.ordenes.find((row) => optionText(orderLabel(row)) === value || optionText(row.codigo_orden) === value);
}

function findStockPreparationFromCombo() {
  const value = optionText($('#stock-prep-combo')?.value);
  return stockPreparations().find((row) => {
    const code = optionText(row.codigo_item || row.categoria);
    const name = optionText(row.nombre);
    return optionText(preparationLabel(row)) === value || code === value || name === value;
  });
}

function setProductCombo(id) {
  const product = state.productos.find((row) => String(row.id_producto) === String(id));
  $('#orden-producto').value = product?.id_producto || '';
  $('#orden-producto-combo').value = product ? productLabel(product) : '';
  $('#orden-producto-combo').setCustomValidity(product ? '' : 'Seleccione un producto de la lista.');
  fillUnitSelect('#orden-unidad', selectedProductUnit());
}

function setOrderCombo(id) {
  const order = state.ordenes.find((row) => String(row.id_orden) === String(id));
  $('#tr-orden').value = order?.id_orden || '';
  $('#tr-orden-combo').value = order ? orderLabel(order) : '';
  $('#tr-orden-combo').setCustomValidity(order ? '' : 'Seleccione una orden de la lista.');
  fillUnitSelect('#tr-unidad', outputUnitForPhase());
}

function setStockPreparationCombo(id) {
  const preparation = state.tipos.find((row) => String(row.id_tipo_preparacion) === String(id));
  $('#stock-prep').value = preparation?.id_tipo_preparacion || '';
  $('#stock-prep-combo').value = preparation ? preparationLabel(preparation) : '';
  $('#stock-prep-combo').setCustomValidity(preparation ? '' : 'Seleccione un semiterminado de la lista.');
  fillUnitSelect('#stock-unidad', selectedStockPreparationUnit());
}

function syncProductCombo(requireSelection = true) {
  const product = findProductFromCombo();
  $('#orden-producto').value = product?.id_producto || '';
  $('#orden-producto-combo').setCustomValidity(!requireSelection || product ? '' : 'Seleccione un producto de la lista.');
  fillUnitSelect('#orden-unidad', selectedProductUnit());
}

function syncOrderCombo(requireSelection = true) {
  const order = findOrderFromCombo();
  $('#tr-orden').value = order?.id_orden || '';
  $('#tr-orden-combo').setCustomValidity(!requireSelection || order ? '' : 'Seleccione una orden de la lista.');
  fillUnitSelect('#tr-unidad', outputUnitForPhase());
}

function syncStockPreparationCombo(requireSelection = true) {
  const preparation = findStockPreparationFromCombo();
  $('#stock-prep').value = preparation?.id_tipo_preparacion || '';
  $('#stock-prep-combo').setCustomValidity(!requireSelection || preparation ? '' : 'Seleccione un semiterminado de la lista.');
  fillUnitSelect('#stock-unidad', selectedStockPreparationUnit());
  fillLocationSelect('#stock-ubicacion', defaultLocationForUnit($('#stock-unidad')?.value));
}

function outputUnitForPhase() {
  const phase = currentPhase();
  const output = outputByPhase[phase?.nombre_fase] || [];
  if (output[0] === 'PT') return selectedOrderUnit();
  const type = state.tipos.find((row) => row.nombre === output[1] || row.categoria === output[1]);
  return type?.unidad_medida || 'kg';
}

function renderStock() {
  const rows = state.lotesProd.filter((row) => row.tipo_lote !== 'PRODUCTO_TERMINADO' && Number(row.cantidad_actual) > 0);
  $('#tabla-stock').innerHTML = table(rows, [
    { label: 'Codigo', key: 'codigo_lote' },
    { label: 'Preparacion', key: 'tipo_preparacion' },
    { label: 'Orden', key: 'codigo_orden' },
    { label: 'Fase', key: 'nombre_fase' },
    { label: 'Disponible', render: (r) => `${r.cantidad_actual} ${r.unidad_medida}` },
    { label: 'Ubicacion', key: 'ubicacion' },
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
    { label: 'Codigo MP', key: 'codigo_item' },
    { label: 'Materia prima', key: 'nombre' },
    { label: 'Descripcion', key: 'descripcion' },
    { label: 'Unidad', key: 'unidad_medida' },
    { label: 'Temperatura objetivo', key: 'temperatura_objetivo' },
    { label: 'Estado', key: 'estado' }
  ]);
  $('#tabla-mp').innerHTML = table(state.lotesMp, [
    { label: 'Codigo MP', key: 'codigo_item' },
    { label: 'Lote proveedor', key: 'lote_proveedor' },
    { label: 'Materia', key: 'materia_prima' },
    { label: 'Proveedor', key: 'proveedor' },
    { label: 'Peso recibido', render: (r) => `${r.peso_recibido} ${r.unidad_medida || ''}` },
    { label: 'Ubicacion', key: 'ubicacion' },
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
    { label: 'Cantidad', render: (r) => `${r.cantidad_actual} ${r.unidad_medida}` },
    { label: 'Ubicacion', key: 'ubicacion' }
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
    { label: 'Cantidad salida', render: (r) => `${r.peso_salida} ${r.unidad_medida || ''}` },
    { label: 'Cantidad por porcion', render: (r) => r.peso_por_porcion == null ? '' : `${r.peso_por_porcion} ${r.unidad_medida || ''}` },
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
  const filter = row.querySelector('.origin-search')?.value || '';
  const lots = type === 'MP'
    ? state.lotesMp.filter((l) => Number(l.peso_disponible) > 0)
    : state.lotesProd.filter((l) => {
      if (Number(l.cantidad_actual) <= 0) return false;
      if (context === 'stock') return l.codigo_orden === 'STOCK-GENERAL';
      return l.codigo_orden === 'STOCK-GENERAL' || !selectedOrder || l.id_orden === selectedOrder;
    });
  const rows = filterRows(lots, filter, (lot) => type === 'MP'
    ? `${lot.codigo_item || 'MP'} ${lot.lote_proveedor} ${lot.materia_prima} ${lot.proveedor} ${lot.peso_disponible} ${lot.unidad_medida || ''}`
    : `${lot.codigo_lote} ${lot.tipo_preparacion || lot.tipo_lote} ${lot.cantidad_actual} ${lot.unidad_medida || ''}`);
  select.innerHTML = rows.map((lot) => {
    const value = type === 'MP' ? lot.id_lote_mp : lot.id_lote_prod;
    const label = type === 'MP'
      ? `${lot.codigo_item || 'MP'} - ${lot.lote_proveedor} - ${lot.materia_prima} - ${lot.proveedor} (${lot.peso_disponible} ${lot.unidad_medida || ''})`
      : `${lot.codigo_lote} - ${lot.tipo_preparacion || lot.tipo_lote} (${lot.cantidad_actual} ${lot.unidad_medida || ''})`;
    return `<option value="${value}">${label}</option>`;
  }).join('');
  if (current) select.value = current;
  fillUnitSelect(row.querySelector('.origin-unit'), selectedOriginUnit(row));
  calcWeights(context);
}

function addOriginRow(containerId = 'origenes', context = 'order') {
  const node = $('#origin-template').content.firstElementChild.cloneNode(true);
  node.dataset.context = context;
  $(`#${containerId}`).appendChild(node);
  fillUnitSelect(node.querySelector('.origin-unit'), 'kg');
  updateOriginLotSelect(node);
  calcWeights(context);
}

function calcWeights(context = 'order') {
  const container = context === 'stock' ? $('#stock-origenes') : $('#origenes');
  const output = context === 'stock' ? $('#stock-origin-total') : $('#origin-total');
  const totals = {};
  [...container.querySelectorAll('.origin-row')].forEach((row) => {
    const qty = normalizeNumberText(row.querySelector('.origin-qty')?.value || 0);
    const unit = row.querySelector('.origin-unit')?.value || 'kg';
    if (Number.isFinite(qty) && qty > 0) totals[unit] = (totals[unit] || 0) + qty;
  });
  const summary = Object.entries(totals)
    .map(([unit, value]) => `${value.toFixed(3)} ${unit}`)
    .join(' + ') || '0';
  output.textContent = `Total seleccionado: ${summary}`;
}

function normalizeNumberText(value) {
  return Number(String(value || '').replace(',', '.'));
}

function trimNumber(value) {
  return String(Number(value.toFixed(6)));
}

function scaleOriginsToOutput(form) {
  const target = normalizeNumberText(form.querySelector('[name="peso_total"]')?.value);
  if (!Number.isFinite(target) || target <= 0) return false;
  const inputs = [...form.querySelectorAll('.origin-qty')];
  const outputUnit = form.querySelector('[name="unidad_salida"]')?.value || 'kg';
  const units = [...form.querySelectorAll('.origin-unit')].map((input) => input.value || 'kg');
  if (!units.length || units.some((unit) => unit !== outputUnit)) return false;
  const total = inputs.reduce((sum, input) => sum + normalizeNumberText(input.value || 0), 0);
  if (!Number.isFinite(total) || total <= 0 || target <= total + 0.000001) return false;

  const factor = target / total;
  inputs.forEach((input) => {
    const current = normalizeNumberText(input.value || 0);
    if (Number.isFinite(current) && current > 0) input.value = trimNumber(current * factor);
  });
  calcWeights(form.id === 'stock-form' ? 'stock' : 'order');
  return true;
}

function selectedOriginUnit(row) {
  const type = row.querySelector('.origin-type').value;
  const selected = row.querySelector('.origin-lot').value;
  if (type === 'MP') {
    const lot = state.lotesMp.find((item) => String(item.id_lote_mp) === String(selected));
    return lot?.unidad_medida || row.querySelector('.origin-unit')?.value || 'kg';
  }
  const lot = state.lotesProd.find((item) => String(item.id_lote_prod) === String(selected));
  return lot?.unidad_medida || row.querySelector('.origin-unit')?.value || 'kg';
}

function originsPayload(form) {
  return [...form.querySelectorAll('.origin-row')].map((row) => {
    const tipo = row.querySelector('.origin-type').value;
    return {
      tipo_lote_origen: tipo,
      id_lote_mp_origen: tipo === 'MP' ? Number(row.querySelector('.origin-lot').value) : null,
      id_lote_prod_origen: tipo === 'PROD' ? Number(row.querySelector('.origin-lot').value) : null,
      cantidad_consumida: normalizeNumberText(row.querySelector('.origin-qty').value),
      unidad_medida: row.querySelector('.origin-unit').value || 'kg',
      temperatura_uso: row.querySelector('.origin-temp')?.value ? normalizeNumberText(row.querySelector('.origin-temp').value) : null
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
  fillUnitSelect('#tr-unidad', outputUnitForPhase());
  fillLocationSelect('#tr-ubicacion', defaultLocationForUnit($('#tr-unidad')?.value));
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
    ? `<span>${node.consumo.cantidad_consumida} ${node.consumo.unidad_medida}${node.consumo.temperatura_uso == null ? '' : ` | ${node.consumo.temperatura_uso} C`}</span>`
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
    <p>Ubicacion: ${lote.ubicacion || 'Sin ubicacion'}</p>
    <p>Estado: ${lote.estado}</p>
    <p>Creacion: ${formatDate(lote.fecha_creacion)}</p>
    <p>${lote.observaciones || ''}</p>
    <form id="move-lot-form" class="move-form">
      <h3>Mover ubicacion</h3>
      <input type="hidden" name="id_lote_prod" value="${lote.id_lote_prod}">
      <label>Nueva ubicacion <select name="id_ubicacion_destino" id="move-location" required></select></label>
      <label>Temperatura traslado (C) <input name="temperatura" type="number" step="0.1"></label>
      <label>Responsable <input name="responsable"></label>
      <label>Observaciones <textarea name="observaciones"></textarea></label>
      <button>Mover lote</button>
    </form>
    <button class="secondary" id="trace-this">Ver trazabilidad hacia atras</button>
    <h3>Movimientos de ubicacion</h3>
    ${table(lote.movimientos || [], [
      { label: 'Fecha', render: (r) => formatDate(r.fecha) },
      { label: 'Hora', key: 'hora' },
      { label: 'Origen', render: (r) => r.ubicacion_origen || 'Sin ubicacion' },
      { label: 'Destino', key: 'ubicacion_destino' },
      { label: 'Temp', render: (r) => r.temperatura == null ? '' : `${r.temperatura} C` },
      { label: 'Responsable', key: 'responsable' }
    ])}
    <h3>Usado en</h3>
    ${table(lote.usado_en || [], [
      { label: 'Destino', key: 'lote_destino' },
      { label: 'Cantidad', render: (r) => `${r.cantidad_consumida} ${r.unidad_medida}` },
      { label: 'Fecha', render: (r) => formatDate(r.fecha_consumo) }
    ])}
  `;
  fillLocationSelect('#move-location', lote.id_ubicacion || '');
  $('#trace-this').addEventListener('click', () => {
    $('#trace-code').value = lote.codigo_lote;
    setView('trazabilidad');
    $('#trace-form').requestSubmit();
  });
  $('#move-lot-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = formData(form);
      await api(`/api/movimientos-ubicacion/produccion/${lote.id_lote_prod}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      await loadAll();
      await showLot(lote.id_lote_prod);
      setStatus('Ubicacion del lote actualizada');
    } catch (error) {
      setStatus(error.message, true);
    }
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
      const scaled = scaleOriginsToOutput(form);
      await api('/api/transformaciones', { method: 'POST', body: JSON.stringify(transformationPayload(form)) });
      form.reset();
      $('#origenes').innerHTML = '';
      addOriginRow();
      resetMixingTimer();
      await loadAll();
      document.querySelector('[data-panel="orden-lotes"]').click();
      setStatus(scaled ? 'Cantidades ajustadas al peso total y lote generado automaticamente' : 'Lote generado automaticamente');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  const stockForm = $('#stock-form');
  if (stockForm) {
    stockForm.addEventListener('submit', async (event) => {
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
  }

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
    renderOrderSelect();
    setOrderCombo(orderButton.dataset.orderProduction);
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
  if (event.target.classList.contains('origin-search')) updateOriginLotSelect(event.target.closest('.origin-row'));
  if (event.target.id === 'orden-producto-combo') syncProductCombo();
  if (event.target.id === 'tr-orden-combo') {
    syncOrderCombo();
    document.querySelectorAll('.origin-row').forEach(updateOriginLotSelect);
  }
  if (event.target.id === 'stock-prep-combo') syncStockPreparationCombo();
});

document.addEventListener('change', (event) => {
  if (event.target.classList.contains('origin-type') || event.target.classList.contains('origin-lot')) updateOriginLotSelect(event.target.closest('.origin-row'));
  if (event.target.classList.contains('origin-unit')) calcWeights(event.target.closest('.origin-row').dataset.context || 'order');
  if (event.target.id === 'orden-producto-combo') syncProductCombo();
  if (event.target.id === 'tr-fase') {
    updateOutputPreview();
    updatePhaseFields();
  }
  if (event.target.id === 'tr-orden-combo') {
    syncOrderCombo();
    resetMixingTimer();
    fillUnitSelect('#tr-unidad', outputUnitForPhase());
    document.querySelectorAll('.origin-row').forEach(updateOriginLotSelect);
  }
  if (event.target.id === 'stock-prep-combo') syncStockPreparationCombo();
  if (event.target.id === 'tr-unidad') calcWeights();
  if (event.target.id === 'tr-unidad') fillLocationSelect('#tr-ubicacion', defaultLocationForUnit($('#tr-unidad')?.value));
  if (event.target.id === 'stock-unidad') {
    calcWeights('stock');
    fillLocationSelect('#stock-ubicacion', defaultLocationForUnit($('#stock-unidad')?.value));
  }
});

$('#refresh').addEventListener('click', loadAll);
bindForms();
addOriginRow();
if ($('#stock-origenes')) addOriginRow('stock-origenes', 'stock');
loadAll();
