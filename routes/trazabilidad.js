const express = require('express');
const db = require('../db/database');

const router = express.Router();

function prodNode(id) {
  const lote = db.prepare(`
    SELECT l.*, p.nombre AS producto, tp.nombre AS tipo_preparacion, r.nombre_receta, f.nombre_fase, o.codigo_orden
    FROM LOTE_PRODUCCION l
    JOIN ORDEN_PRODUCCION o ON o.id_orden = l.id_orden
    LEFT JOIN PRODUCTO p ON p.id_producto = l.id_producto
    LEFT JOIN TIPO_PREPARACION tp ON tp.id_tipo_preparacion = l.id_tipo_preparacion
    LEFT JOIN RECETA r ON r.id_receta = l.id_receta
    LEFT JOIN FASE_PRODUCCION f ON f.id_fase = l.id_fase_actual
    WHERE l.id_lote_prod = ?
  `).get(id);
  if (!lote) return null;

  const consumos = db.prepare('SELECT * FROM CONSUMO_LOTE WHERE id_lote_prod_destino = ? ORDER BY id_consumo ASC').all(id);
  const origenes = consumos.map((consumo) => {
    if (consumo.tipo_lote_origen === 'MP') {
      const mp = db.prepare(`
        SELECT l.*, m.nombre AS materia_prima
        FROM LOTE_MATERIA_PRIMA l
        JOIN MATERIA_PRIMA m ON m.id_materia_prima = l.id_materia_prima
        WHERE l.id_lote_mp = ?
      `).get(consumo.id_lote_mp_origen);
      return { tipo: 'MP', lote: mp?.lote_proveedor || mp?.lote_interno, datos: mp, consumo, origenes: [] };
    }
    return prodNode(consumo.id_lote_prod_origen);
  }).filter(Boolean);

  return { tipo: 'PROD', lote: lote.codigo_lote, datos: lote, origenes };
}

router.get('/codigo/:codigo', (req, res) => {
  const lote = db.prepare('SELECT id_lote_prod FROM LOTE_PRODUCCION WHERE codigo_lote = ?').get(req.params.codigo);
  if (!lote) return res.status(404).json({ error: 'Lote no encontrado.' });
  res.json(prodNode(lote.id_lote_prod));
});

router.get('/:id', (req, res) => {
  const tree = prodNode(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Lote no encontrado.' });
  res.json(tree);
});

module.exports = router;
