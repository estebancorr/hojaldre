const express = require('express');
const db = require('../db/database');

const router = express.Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function codeDate() {
  return today().replace(/-/g, '');
}

function num(value) {
  return Number(String(value ?? '').replace(',', '.'));
}

function generateLotCode(prefix) {
  const cleanPrefix = String(prefix || 'LOTE').trim().toUpperCase();
  const base = `${cleanPrefix}-${codeDate()}`;
  const existing = new Set(
    db.prepare('SELECT codigo_lote FROM LOTE_PRODUCCION WHERE codigo_lote LIKE ?').all(`${base}-%`)
      .map((row) => row.codigo_lote)
  );
  let sequence = 1;
  while (existing.has(`${base}-${String(sequence).padStart(3, '0')}`)) sequence += 1;
  return `${base}-${String(sequence).padStart(3, '0')}`;
}

function getProdLot(id) {
  return db.prepare(`
    SELECT l.*, tp.nombre AS tipo_preparacion
    FROM LOTE_PRODUCCION l
    LEFT JOIN TIPO_PREPARACION tp ON tp.id_tipo_preparacion = l.id_tipo_preparacion
    WHERE l.id_lote_prod = ?
  `).get(id);
}

const outputsByPhase = {
  'preparacion mantequilla empastada': 'Mantequilla empastada',
  'preparacion de masa': 'Masa tipo B',
  'empaste': 'Masa empastada',
  'laminado': 'Masa laminada',
  'reposo': 'Masa reposada',
  'formado': 'Croissant formado',
  'congelado': 'Croissant congelado',
  'horneado': 'Producto terminado',
  'empaque': 'Producto terminado'
};

const rulesByPhase = {
  'preparacion mantequilla empastada': { temperature: true },
  'preparacion de masa': { temperature: true, portion: true, timer: true },
  'empaste': { temperature: true },
  'laminado': { temperature: true },
  'reposo': { temperature: true },
  'formado': { portion: true },
  'congelado': { temperature: true },
  'horneado': { temperature: true },
  'empaque': { portion: true }
};

function resolveOutput(data) {
  const order = db.prepare('SELECT * FROM ORDEN_PRODUCCION WHERE id_orden = ?').get(data.id_orden);
  if (!order) throw new Error('Orden de produccion no encontrada.');

  const phase = db.prepare('SELECT * FROM FASE_PRODUCCION WHERE id_fase = ?').get(data.id_fase);
  if (!phase) throw new Error('Fase de produccion no encontrada.');

  const preparationName = outputsByPhase[phase.nombre_fase.toLowerCase()];
  if (!preparationName) throw new Error(`La fase ${phase.nombre_fase} no genera un lote de produccion.`);

  const preparation = db.prepare('SELECT * FROM TIPO_PREPARACION WHERE lower(nombre) = lower(?)').get(preparationName);
  if (!preparation) throw new Error(`No existe el tipo de preparacion ${preparationName}.`);

  const isFinal = preparationName === 'Producto terminado';
  return {
    order,
    phase,
    preparation,
    id_producto: order.id_producto,
    id_receta: order.id_receta,
    id_tipo_preparacion: preparation.id_tipo_preparacion,
    tipo_lote: isFinal ? 'PRODUCTO_TERMINADO' : 'SEMIELABORADO',
    prefix: preparation.categoria || (isFinal ? 'PT' : 'ST')
  };
}

function validate(data) {
  if (!data.id_orden) throw new Error('No se puede crear lote sin orden de produccion.');
  if (!data.id_fase) throw new Error('Debe seleccionar una fase.');
  if (!data.peso_total || num(data.peso_total) <= 0) throw new Error('El peso total debe ser mayor a cero.');
  if (!Array.isArray(data.consumos) || data.consumos.length === 0) throw new Error('Debe agregar al menos un lote de origen.');
  data.consumos.forEach((consumo) => {
    if (!consumo.cantidad_consumida || num(consumo.cantidad_consumida) <= 0) throw new Error('Las cantidades consumidas deben ser mayores a cero.');
  });

  const output = resolveOutput(data);
  const tipoSalida = output.preparation;
  const rules = rulesByPhase[output.phase.nombre_fase.toLowerCase()] || {};
  if (rules.temperature && data.temperatura_masa == null) throw new Error('Debe registrar la temperatura para esta fase.');
  if (rules.portion && (!data.peso_por_porcion || num(data.peso_por_porcion) <= 0)) throw new Error('El peso por porcion debe ser mayor a cero.');
  if (rules.timer && (!data.hora_inicio || !data.hora_fin || !data.duracion_amasado_seg)) {
    throw new Error('Debe iniciar y finalizar el amasado antes de guardar.');
  }

  if (tipoSalida && tipoSalida.nombre.toLowerCase() === 'masa empastada') {
    let tieneMasa = false;
    let tieneMantequilla = false;
    data.consumos.filter((c) => c.tipo_lote_origen === 'PROD').forEach((c) => {
      const lote = getProdLot(c.id_lote_prod_origen);
      const nombre = (lote?.tipo_preparacion || '').toLowerCase();
      tieneMasa = tieneMasa || nombre.includes('masa tipo b') || (lote?.codigo_lote || '').startsWith('MASA-B');
      tieneMantequilla = tieneMantequilla || nombre.includes('mantequilla empastada') || (lote?.codigo_lote || '').startsWith('EMP-MANT');
    });
    if (!tieneMasa || !tieneMantequilla) {
      throw new Error('Para crear masa empastada debe seleccionar una masa tipo B y una mantequilla empastada.');
    }
  }
}

const crearTransformacion = db.transaction((data) => {
  validate(data);
  const output = resolveOutput(data);
  const fecha = today();
  const codigo = generateLotCode(output.prefix);
  const pesoEntrada = Number(data.consumos.reduce((sum, c) => sum + num(c.cantidad_consumida || 0), 0));
  const pesoSalida = num(data.peso_total);
  if (pesoSalida > pesoEntrada) throw new Error('El peso total no puede superar la cantidad consumida de los lotes origen.');
  const merma = Number((pesoEntrada - pesoSalida).toFixed(3));
  const temperatura = data.temperatura_masa == null ? null : num(data.temperatura_masa);
  const pesoPorPorcion = data.peso_por_porcion == null ? null : num(data.peso_por_porcion);
  const duracion = data.duracion_amasado_seg == null ? null : num(data.duracion_amasado_seg);

  const loteResult = db.prepare(`
    INSERT INTO LOTE_PRODUCCION
    (id_orden, id_producto, id_tipo_preparacion, id_receta, id_fase_actual, codigo_lote, tipo_lote, fecha_creacion, cantidad_actual, unidad_medida, estado, observaciones)
    VALUES (@id_orden, @id_producto, @id_tipo_preparacion, @id_receta, @id_fase_actual, @codigo_lote, @tipo_lote, @fecha_creacion, @cantidad_actual, @unidad_medida, @estado, @observaciones)
  `).run({
    id_orden: data.id_orden,
    id_producto: output.id_producto,
    id_tipo_preparacion: output.id_tipo_preparacion,
    id_receta: output.id_receta,
    id_fase_actual: data.id_fase,
    codigo_lote: codigo,
    tipo_lote: output.tipo_lote,
    fecha_creacion: fecha,
    cantidad_actual: pesoSalida,
    unidad_medida: 'kg',
    estado: 'DISPONIBLE',
    observaciones: data.observaciones || ''
  });

  const idLoteDestino = loteResult.lastInsertRowid;
  const regResult = db.prepare(`
    INSERT INTO REGISTRO_FASE
    (id_orden, id_fase, id_lote_salida, id_operario, id_equipo, fecha, hora_inicio, hora_fin, temperatura_inicial, temperatura_final, temperatura_masa, peso_entrada_total, peso_salida, peso_por_porcion, duracion_amasado_seg, merma, estado, observaciones)
    VALUES (@id_orden, @id_fase, @id_lote_salida, @id_operario, @id_equipo, @fecha, @hora_inicio, @hora_fin, @temperatura_inicial, @temperatura_final, @temperatura_masa, @peso_entrada_total, @peso_salida, @peso_por_porcion, @duracion_amasado_seg, @merma, @estado, @observaciones)
  `).run({
    id_orden: data.id_orden,
    id_fase: data.id_fase,
    id_lote_salida: idLoteDestino,
    id_operario: data.id_operario || null,
    id_equipo: data.id_equipo || null,
    fecha,
    hora_inicio: data.hora_inicio || null,
    hora_fin: data.hora_fin || null,
    temperatura_inicial: temperatura,
    temperatura_final: temperatura,
    temperatura_masa: temperatura,
    peso_entrada_total: pesoEntrada,
    peso_salida: pesoSalida,
    peso_por_porcion: pesoPorPorcion,
    duracion_amasado_seg: duracion,
    merma,
    estado: 'COMPLETADA',
    observaciones: data.observaciones || ''
  });

  data.consumos.forEach((consumo) => {
    const cantidad = num(consumo.cantidad_consumida);
    if (consumo.tipo_lote_origen === 'MP') {
      const loteMp = db.prepare('SELECT * FROM LOTE_MATERIA_PRIMA WHERE id_lote_mp = ?').get(consumo.id_lote_mp_origen);
      if (!loteMp) throw new Error('Lote de materia prima no encontrado.');
      const codigoMp = loteMp.lote_proveedor || loteMp.lote_interno;
      if (loteMp.fecha_vencimiento && loteMp.fecha_vencimiento < fecha) throw new Error(`No se puede usar materia prima vencida: ${codigoMp}.`);
      if (Number(loteMp.peso_disponible) < cantidad) throw new Error(`No hay disponibilidad suficiente en ${codigoMp}.`);
      db.prepare('UPDATE LOTE_MATERIA_PRIMA SET peso_disponible = peso_disponible - ? WHERE id_lote_mp = ?').run(cantidad, consumo.id_lote_mp_origen);
    } else if (consumo.tipo_lote_origen === 'PROD') {
      const loteProd = db.prepare('SELECT * FROM LOTE_PRODUCCION WHERE id_lote_prod = ?').get(consumo.id_lote_prod_origen);
      if (!loteProd) throw new Error('Lote de produccion origen no encontrado.');
      if (Number(loteProd.cantidad_actual) < cantidad) throw new Error(`No hay disponibilidad suficiente en ${loteProd.codigo_lote}.`);
      db.prepare('UPDATE LOTE_PRODUCCION SET cantidad_actual = cantidad_actual - ? WHERE id_lote_prod = ?').run(cantidad, consumo.id_lote_prod_origen);
    } else {
      throw new Error('Tipo de lote origen invalido.');
    }

    db.prepare(`
      INSERT INTO CONSUMO_LOTE
      (id_registro_fase, tipo_lote_origen, id_lote_mp_origen, id_lote_prod_origen, id_lote_prod_destino, cantidad_consumida, unidad_medida, fecha_consumo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      regResult.lastInsertRowid,
      consumo.tipo_lote_origen,
      consumo.tipo_lote_origen === 'MP' ? consumo.id_lote_mp_origen : null,
      consumo.tipo_lote_origen === 'PROD' ? consumo.id_lote_prod_origen : null,
      idLoteDestino,
      cantidad,
      consumo.unidad_medida || 'kg',
      fecha
    );
  });

  return {
    lote: db.prepare('SELECT * FROM LOTE_PRODUCCION WHERE id_lote_prod = ?').get(idLoteDestino),
    origenes: db.prepare('SELECT * FROM CONSUMO_LOTE WHERE id_lote_prod_destino = ?').all(idLoteDestino)
  };
});

router.post('/', (req, res, next) => {
  try {
    res.status(201).json(crearTransformacion(req.body));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
