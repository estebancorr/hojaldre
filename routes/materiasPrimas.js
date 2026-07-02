const express = require('express');
const db = require('../db/database');
const { createCatalogItem, slug } = require('./catalogHelper');

const router = express.Router();

const listSql = `
  SELECT mp.*, ci.codigo AS codigo_item, ci.tipo_item, ci.familia
  FROM MATERIA_PRIMA mp
  LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
  ORDER BY mp.id_materia_prima DESC
`;

router.get('/', (req, res) => {
  res.json(db.prepare(listSql).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const nombre = String(data.nombre || '').trim();
    const unidad = String(data.unidad_medida || '').trim();
    if (!nombre || !unidad) return res.status(400).json({ error: 'Nombre y unidad son obligatorios.' });

    const idItem = data.id_item || createCatalogItem({
      codigo: `MP-${slug(nombre)}`,
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

    res.status(201).json(db.prepare(`${listSql.replace('ORDER BY mp.id_materia_prima DESC', '')} WHERE mp.id_materia_prima = ?`).get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
