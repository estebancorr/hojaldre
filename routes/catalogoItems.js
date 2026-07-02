const express = require('express');
const db = require('../db/database');
const { validTypes } = require('./catalogHelper');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM CATALOGO_ITEM ORDER BY id_item DESC').all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const codigo = String(data.codigo || '').trim().toUpperCase();
    const descripcion = String(data.descripcion || '').trim();
    const unidad = String(data.unidad_medida || '').trim();

    if (!codigo || !descripcion || !unidad) {
      return res.status(400).json({ error: 'Codigo, descripcion y unidad son obligatorios.' });
    }
    if (!validTypes.has(data.tipo_item)) return res.status(400).json({ error: 'Tipo de item invalido.' });

    const result = db.prepare(`
      INSERT INTO CATALOGO_ITEM (codigo, descripcion, tipo_item, unidad_medida, familia, activo)
      VALUES (@codigo, @descripcion, @tipo_item, @unidad_medida, @familia, @activo)
    `).run({
      codigo,
      descripcion,
      tipo_item: data.tipo_item,
      unidad_medida: unidad,
      familia: data.familia || null,
      activo: data.activo == null ? 1 : Number(data.activo)
    });

    res.status(201).json(db.prepare('SELECT * FROM CATALOGO_ITEM WHERE id_item = ?').get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
