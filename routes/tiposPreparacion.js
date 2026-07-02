const express = require('express');
const db = require('../db/database');
const { createCatalogItem, slug } = require('./catalogHelper');

const router = express.Router();

const listSql = `
  SELECT tp.*, ci.codigo AS codigo_item, ci.tipo_item, ci.unidad_medida, ci.familia
  FROM TIPO_PREPARACION tp
  LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = tp.id_item
  ORDER BY tp.id_tipo_preparacion DESC
`;

router.get('/', (req, res) => {
  res.json(db.prepare(listSql).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const nombre = String(data.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre de preparacion obligatorio.' });

    const idItem = data.id_item || createCatalogItem({
      codigo: `ST-${slug(data.categoria || nombre)}`,
      descripcion: data.descripcion || nombre,
      tipo_item: data.tipo_item || 'SEMIELABORADO',
      unidad_medida: data.unidad_medida || 'kg',
      familia: data.categoria || 'Semielaborado'
    });

    const result = db.prepare(`
      INSERT INTO TIPO_PREPARACION (id_item, nombre, categoria, descripcion, requiere_receta, estado)
      VALUES (@id_item, @nombre, @categoria, @descripcion, @requiere_receta, 'ACTIVO')
    `).run({
      id_item: idItem,
      nombre,
      categoria: data.categoria || null,
      descripcion: data.descripcion || null,
      requiere_receta: data.requiere_receta == null ? 0 : Number(data.requiere_receta)
    });

    res.status(201).json(db.prepare(`${listSql.replace('ORDER BY tp.id_tipo_preparacion DESC', '')} WHERE tp.id_tipo_preparacion = ?`).get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
