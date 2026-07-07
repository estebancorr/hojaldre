const express = require('express');
const db = require('../db/database');
const { createCatalogItem, slug } = require('./catalogHelper');

const router = express.Router();

const listSql = `
  SELECT p.*, ci.codigo AS codigo_item, ci.tipo_item, ci.unidad_medida, ci.familia
  FROM PRODUCTO p
  LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = p.id_item
  ORDER BY p.id_producto DESC
`;

router.get('/', (req, res) => {
  res.json(db.prepare(listSql).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const nombre = String(data.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre de producto obligatorio.' });

    const idItem = data.id_item || createCatalogItem({
      codigo: `PT-${slug(nombre)}`,
      descripcion: data.descripcion || nombre,
      tipo_item: 'PRODUCTO_TERMINADO',
      unidad_medida: data.unidad_medida || 'kg',
      familia: data.categoria || 'Producto terminado'
    });

    const result = db.prepare(`
      INSERT INTO PRODUCTO (id_item, nombre, descripcion, categoria, peso_objetivo_unidad, estado)
      VALUES (@id_item, @nombre, @descripcion, @categoria, @peso_objetivo_unidad, 'ACTIVO')
    `).run({
      id_item: idItem,
      nombre,
      descripcion: data.descripcion || null,
      categoria: data.categoria || null,
      peso_objetivo_unidad: data.peso_objetivo_unidad == null ? null : Number(data.peso_objetivo_unidad)
    });

    res.status(201).json(db.prepare(`${listSql.replace('ORDER BY p.id_producto DESC', '')} WHERE p.id_producto = ?`).get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
