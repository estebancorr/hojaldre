const express = require('express');
const db = require('../db/database');
const { createCatalogItem } = require('./catalogHelper');

const router = express.Router();

const listSql = `
  SELECT mp.*, ci.codigo AS codigo_item, ci.tipo_item, ci.familia
  FROM MATERIA_PRIMA mp
  LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
  WHERE COALESCE(ci.tipo_item, 'MP') = 'MP'
    AND mp.estado <> 'INACTIVA'
  ORDER BY mp.id_materia_prima DESC
`;

router.get('/', (req, res) => {
  res.json(db.prepare(listSql).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const nombre = String(data.nombre || '').trim();
    const codigo = String(data.codigo || '').trim().toUpperCase();
    const unidad = String(data.unidad_medida || '').trim();
    if (!codigo || !nombre || !unidad) return res.status(400).json({ error: 'Codigo, nombre y unidad son obligatorios.' });

    const existingItem = db.prepare('SELECT id_item FROM CATALOGO_ITEM WHERE codigo = ?').get(codigo);
    const idItem = data.id_item || existingItem?.id_item || createCatalogItem({
      codigo,
      descripcion: data.descripcion || nombre,
      tipo_item: 'MP',
      unidad_medida: unidad,
      familia: data.familia || 'Materia prima'
    });

    const result = db.prepare(`
      INSERT INTO MATERIA_PRIMA (id_item, nombre, descripcion, unidad_medida, temperatura_objetivo, estado)
      VALUES (@id_item, @nombre, @descripcion, @unidad_medida, @temperatura_objetivo, 'ACTIVA')
    `).run({
      id_item: idItem,
      nombre,
      descripcion: data.descripcion || null,
      unidad_medida: unidad,
      temperatura_objetivo: data.temperatura_objetivo == null ? null : Number(data.temperatura_objetivo)
    });

    res.status(201).json(db.prepare(`
      SELECT mp.*, ci.codigo AS codigo_item, ci.tipo_item, ci.familia
      FROM MATERIA_PRIMA mp
      LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
      WHERE mp.id_materia_prima = ?
    `).get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
