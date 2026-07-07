const express = require('express');
const db = require('../db/database');

const router = express.Router();

function yyyymmdd(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function nextOrderCode(fecha) {
  const day = (fecha || yyyymmdd()).replace(/-/g, '');
  const prefix = `OP-${day}`;
  const row = db.prepare('SELECT COUNT(*) AS total FROM ORDEN_PRODUCCION WHERE codigo_orden LIKE ?').get(`${prefix}-%`);
  return `${prefix}-${String(row.total + 1).padStart(3, '0')}`;
}

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, p.nombre AS producto, r.nombre_receta
    FROM ORDEN_PRODUCCION o
    JOIN PRODUCTO p ON p.id_producto = o.id_producto
    LEFT JOIN RECETA r ON r.id_receta = o.id_receta
    WHERE o.codigo_orden <> 'STOCK-GENERAL'
    ORDER BY o.id_orden DESC
  `).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = { ...req.body };
    if (!data.id_producto) return res.status(400).json({ error: 'La orden necesita producto.' });
    const receta = db.prepare(`
      SELECT id_receta FROM RECETA
      WHERE id_producto = ? AND activa = 1
      ORDER BY id_receta DESC LIMIT 1
    `).get(data.id_producto);
    if (!receta) return res.status(400).json({ error: 'El producto seleccionado no tiene una receta activa.' });
    data.id_receta = receta.id_receta;
    if (!data.fecha_programada) data.fecha_programada = new Date().toISOString().slice(0, 10);
    if (!data.codigo_orden) data.codigo_orden = nextOrderCode(data.fecha_programada);
    if (!data.unidad_medida) {
      const product = db.prepare(`
        SELECT ci.unidad_medida
        FROM PRODUCTO p
        LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = p.id_item
        WHERE p.id_producto = ?
      `).get(data.id_producto);
      data.unidad_medida = product?.unidad_medida || 'kg';
    }
    const keys = Object.keys(data);
    const result = db.prepare(`INSERT INTO ORDEN_PRODUCCION (${keys.join(',')}) VALUES (${keys.map((key) => `@${key}`).join(',')})`).run(data);
    res.status(201).json(db.prepare('SELECT * FROM ORDEN_PRODUCCION WHERE id_orden = ?').get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
