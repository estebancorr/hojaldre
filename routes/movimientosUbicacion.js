const express = require('express');
const db = require('../db/database');

const router = express.Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 8);
}

function num(value) {
  return Number(String(value ?? '').replace(',', '.'));
}

const moveProductionLot = db.transaction((id, data) => {
  const lote = db.prepare('SELECT * FROM LOTE_PRODUCCION WHERE id_lote_prod = ?').get(id);
  if (!lote) throw new Error('Lote de produccion no encontrado.');
  if (!data.id_ubicacion_destino) throw new Error('Debe seleccionar ubicacion destino.');

  const destino = db.prepare('SELECT * FROM UBICACION WHERE id_ubicacion = ? AND activa = 1').get(data.id_ubicacion_destino);
  if (!destino) throw new Error('Ubicacion destino no encontrada.');

  const temperatura = data.temperatura == null || data.temperatura === '' ? null : num(data.temperatura);
  db.prepare(`
    INSERT INTO MOVIMIENTO_UBICACION
    (tipo_lote, id_lote_prod, id_ubicacion_origen, id_ubicacion_destino, fecha, hora, temperatura, responsable, observaciones)
    VALUES ('PROD', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lote.id_lote_prod,
    lote.id_ubicacion || null,
    destino.id_ubicacion,
    data.fecha || today(),
    data.hora || nowTime(),
    temperatura,
    data.responsable || null,
    data.observaciones || null
  );

  db.prepare('UPDATE LOTE_PRODUCCION SET id_ubicacion = ? WHERE id_lote_prod = ?').run(destino.id_ubicacion, lote.id_lote_prod);
  return db.prepare('SELECT * FROM MOVIMIENTO_UBICACION WHERE id_movimiento = last_insert_rowid()').get();
});

router.post('/produccion/:id', (req, res, next) => {
  try {
    res.status(201).json(moveProductionLot(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
