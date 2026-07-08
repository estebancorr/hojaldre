const express = require('express');
const db = require('../db/database');

const router = express.Router();

const listSql = `
  SELECT l.*, mp.nombre AS materia_prima, mp.unidad_medida, ci.codigo AS codigo_item, p.nombre AS proveedor,
         u.nombre AS ubicacion, u.tipo AS tipo_ubicacion
  FROM LOTE_MATERIA_PRIMA l
  JOIN MATERIA_PRIMA mp ON mp.id_materia_prima = l.id_materia_prima
  LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
  JOIN PROVEEDOR p ON p.id_proveedor = l.id_proveedor
  LEFT JOIN UBICACION u ON u.id_ubicacion = l.id_ubicacion
  ORDER BY l.id_lote_mp DESC
`;

router.get('/', (req, res) => {
  res.json(db.prepare(listSql).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const loteProveedor = String(data.lote_proveedor || '').trim();
    const pesoRecibido = Number(data.peso_recibido);

    if (!data.id_materia_prima || !data.id_proveedor) {
      return res.status(400).json({ error: 'Debe seleccionar materia prima y proveedor.' });
    }
    if (!loteProveedor) return res.status(400).json({ error: 'Debe indicar el lote del proveedor.' });
    if (!data.fecha_recepcion) return res.status(400).json({ error: 'Debe indicar la fecha de recepcion.' });
    if (!Number.isFinite(pesoRecibido) || pesoRecibido <= 0) {
      return res.status(400).json({ error: 'El peso recibido debe ser mayor a cero.' });
    }

    const result = db.prepare(`
      INSERT INTO LOTE_MATERIA_PRIMA
      (id_materia_prima, id_proveedor, lote_proveedor, lote_interno, fecha_recepcion, fecha_vencimiento, peso_recibido, peso_disponible, id_ubicacion, estado, observaciones)
      VALUES
      (@id_materia_prima, @id_proveedor, @lote_proveedor, @lote_interno, @fecha_recepcion, @fecha_vencimiento, @peso_recibido, @peso_disponible, @id_ubicacion, 'DISPONIBLE', @observaciones)
    `).run({
      id_materia_prima: Number(data.id_materia_prima),
      id_proveedor: Number(data.id_proveedor),
      lote_proveedor: loteProveedor,
      lote_interno: loteProveedor,
      fecha_recepcion: data.fecha_recepcion,
      fecha_vencimiento: data.fecha_vencimiento || null,
      peso_recibido: pesoRecibido,
      peso_disponible: pesoRecibido,
      id_ubicacion: data.id_ubicacion || null,
      observaciones: data.observaciones || null
    });

    res.status(201).json(db.prepare(`${listSql.replace('ORDER BY l.id_lote_mp DESC', '')} WHERE l.id_lote_mp = ?`).get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
