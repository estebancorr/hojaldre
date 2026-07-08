const express = require('express');
const db = require('../db/database');

const router = express.Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function generateLotCode(prefix) {
  const base = `${String(prefix || 'STOCK').trim().toUpperCase()}-${today().replace(/-/g, '')}`;
  const existing = new Set(
    db.prepare('SELECT codigo_lote FROM LOTE_PRODUCCION WHERE codigo_lote LIKE ?').all(`${base}-%`)
      .map((row) => row.codigo_lote)
  );
  let sequence = 1;
  while (existing.has(`${base}-${String(sequence).padStart(3, '0')}`)) sequence += 1;
  return `${base}-${String(sequence).padStart(3, '0')}`;
}

function num(value) {
  return Number(String(value ?? '').replace(',', '.'));
}

function unit(value) {
  return String(value || 'kg').trim();
}

const createStockLot = db.transaction((data) => {
  const stockOrder = db.prepare(`
    SELECT o.*, p.id_producto
    FROM ORDEN_PRODUCCION o
    JOIN PRODUCTO p ON p.id_producto = o.id_producto
    WHERE o.codigo_orden = 'STOCK-GENERAL'
  `).get();
  const stockPhase = db.prepare("SELECT id_fase FROM FASE_PRODUCCION WHERE nombre_fase = 'Generacion de lote para stock'").get();
  const preparation = db.prepare('SELECT * FROM TIPO_PREPARACION WHERE id_tipo_preparacion = ?').get(data.id_tipo_preparacion);

  if (!stockOrder || !stockPhase) throw new Error('No se pudo inicializar el stock general. Reinicie el servidor.');
  if (!preparation || preparation.nombre === 'Producto terminado') throw new Error('Seleccione una preparacion intermedia valida.');
  if (!data.peso_total || num(data.peso_total) <= 0) throw new Error('La cantidad de salida debe ser mayor a cero.');
  if (!Array.isArray(data.consumos) || data.consumos.length === 0) throw new Error('Agregue al menos un lote de origen.');

  const pesoEntrada = data.consumos.reduce((sum, item) => sum + num(item.cantidad_consumida || 0), 0);
  const pesoSalida = num(data.peso_total);
  const unidadSalida = unit(data.unidad_salida);
  const unidadesEntrada = data.consumos.map((item) => unit(item.unidad_medida));
  const unidadesComparables = unidadesEntrada.length > 0 && unidadesEntrada.every((entrada) => entrada === unidadSalida);
  if (data.consumos.some((item) => num(item.cantidad_consumida) <= 0)) throw new Error('Las cantidades consumidas deben ser mayores a cero.');
  if (unidadesComparables && pesoSalida > pesoEntrada) throw new Error('La cantidad de salida no puede superar la cantidad consumida.');

  const fecha = today();
  const loteResult = db.prepare(`
    INSERT INTO LOTE_PRODUCCION
    (id_orden, id_producto, id_tipo_preparacion, id_receta, id_fase_actual, codigo_lote, tipo_lote, fecha_creacion, cantidad_actual, unidad_medida, estado, observaciones)
    VALUES (?, ?, ?, NULL, ?, ?, 'SEMIELABORADO', ?, ?, ?, 'DISPONIBLE', ?)
  `).run(
    stockOrder.id_orden,
    stockOrder.id_producto,
    preparation.id_tipo_preparacion,
    stockPhase.id_fase,
    generateLotCode(preparation.categoria || 'STOCK'),
    fecha,
    pesoSalida,
    unidadSalida,
    data.observaciones || 'Preparacion para stock general'
  );

  const merma = unidadesComparables ? Number((pesoEntrada - pesoSalida).toFixed(3)) : 0;
  const registerResult = db.prepare(`
    INSERT INTO REGISTRO_FASE
    (id_orden, id_fase, id_lote_salida, fecha, peso_entrada_total, peso_salida, merma, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETADA', ?)
  `).run(
    stockOrder.id_orden,
    stockPhase.id_fase,
    loteResult.lastInsertRowid,
    fecha,
    pesoEntrada,
    pesoSalida,
    merma,
    data.observaciones || 'Generacion de lote sin orden de produccion'
  );

  data.consumos.forEach((consumo) => {
    const cantidad = num(consumo.cantidad_consumida);
    if (consumo.tipo_lote_origen === 'MP') {
      const origin = db.prepare('SELECT * FROM LOTE_MATERIA_PRIMA WHERE id_lote_mp = ?').get(consumo.id_lote_mp_origen);
      if (!origin) throw new Error('Lote de materia prima no encontrado.');
      const codigoMp = origin.lote_proveedor || origin.lote_interno;
      if (origin.fecha_vencimiento && origin.fecha_vencimiento < fecha) throw new Error(`No se puede usar materia prima vencida: ${codigoMp}.`);
      if (Number(origin.peso_disponible) < cantidad) throw new Error(`No hay disponibilidad suficiente en ${codigoMp}.`);
      db.prepare('UPDATE LOTE_MATERIA_PRIMA SET peso_disponible = peso_disponible - ? WHERE id_lote_mp = ?').run(cantidad, origin.id_lote_mp);
    } else if (consumo.tipo_lote_origen === 'PROD') {
      const origin = db.prepare(`
        SELECT l.*, o.codigo_orden FROM LOTE_PRODUCCION l
        JOIN ORDEN_PRODUCCION o ON o.id_orden = l.id_orden
        WHERE l.id_lote_prod = ?
      `).get(consumo.id_lote_prod_origen);
      if (!origin || origin.codigo_orden !== 'STOCK-GENERAL') throw new Error('Solo se pueden reutilizar preparaciones de stock general.');
      if (Number(origin.cantidad_actual) < cantidad) throw new Error(`No hay disponibilidad suficiente en ${origin.codigo_lote}.`);
      db.prepare('UPDATE LOTE_PRODUCCION SET cantidad_actual = cantidad_actual - ? WHERE id_lote_prod = ?').run(cantidad, origin.id_lote_prod);
    } else {
      throw new Error('Tipo de lote origen invalido.');
    }

    db.prepare(`
      INSERT INTO CONSUMO_LOTE
      (id_registro_fase, tipo_lote_origen, id_lote_mp_origen, id_lote_prod_origen, id_lote_prod_destino, cantidad_consumida, unidad_medida, fecha_consumo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      registerResult.lastInsertRowid,
      consumo.tipo_lote_origen,
      consumo.tipo_lote_origen === 'MP' ? consumo.id_lote_mp_origen : null,
      consumo.tipo_lote_origen === 'PROD' ? consumo.id_lote_prod_origen : null,
      loteResult.lastInsertRowid,
      cantidad,
      unit(consumo.unidad_medida),
      fecha
    );
  });

  return db.prepare('SELECT * FROM LOTE_PRODUCCION WHERE id_lote_prod = ?').get(loteResult.lastInsertRowid);
});

router.post('/', (req, res, next) => {
  try {
    res.status(201).json(createStockLot(req.body));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
