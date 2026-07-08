const express = require('express');
const db = require('../db/database');

const router = express.Router();

const lotesSql = `
  SELECT l.*, o.codigo_orden, p.nombre AS producto, tp.nombre AS tipo_preparacion,
         r.nombre_receta, f.nombre_fase, u.nombre AS ubicacion, u.tipo AS tipo_ubicacion
  FROM LOTE_PRODUCCION l
  JOIN ORDEN_PRODUCCION o ON o.id_orden = l.id_orden
  LEFT JOIN PRODUCTO p ON p.id_producto = l.id_producto
  LEFT JOIN TIPO_PREPARACION tp ON tp.id_tipo_preparacion = l.id_tipo_preparacion
  LEFT JOIN RECETA r ON r.id_receta = l.id_receta
  LEFT JOIN FASE_PRODUCCION f ON f.id_fase = l.id_fase_actual
  LEFT JOIN UBICACION u ON u.id_ubicacion = l.id_ubicacion
`;

router.get('/', (req, res) => {
  res.json(db.prepare(`${lotesSql} ORDER BY l.id_lote_prod DESC`).all());
});

router.get('/codigo/:codigo', (req, res) => {
  const lote = db.prepare(`${lotesSql} WHERE l.codigo_lote = ?`).get(req.params.codigo);
  if (!lote) return res.status(404).json({ error: 'Lote no encontrado.' });
  res.json(lote);
});

router.get('/:id', (req, res) => {
  const lote = db.prepare(`${lotesSql} WHERE l.id_lote_prod = ?`).get(req.params.id);
  if (!lote) return res.status(404).json({ error: 'Lote no encontrado.' });
  const usadoEn = db.prepare(`
    SELECT c.*, d.codigo_lote AS lote_destino
    FROM CONSUMO_LOTE c
    JOIN LOTE_PRODUCCION d ON d.id_lote_prod = c.id_lote_prod_destino
    WHERE c.tipo_lote_origen = 'PROD' AND c.id_lote_prod_origen = ?
    ORDER BY c.id_consumo DESC
  `).all(req.params.id);
  const movimientos = db.prepare(`
    SELECT m.*, origen.nombre AS ubicacion_origen, destino.nombre AS ubicacion_destino
    FROM MOVIMIENTO_UBICACION m
    LEFT JOIN UBICACION origen ON origen.id_ubicacion = m.id_ubicacion_origen
    JOIN UBICACION destino ON destino.id_ubicacion = m.id_ubicacion_destino
    WHERE m.tipo_lote = 'PROD' AND m.id_lote_prod = ?
    ORDER BY m.id_movimiento DESC
  `).all(req.params.id);
  res.json({ ...lote, usado_en: usadoEn, movimientos });
});

module.exports = router;
