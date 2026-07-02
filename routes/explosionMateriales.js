const express = require('express');
const db = require('../db/database');

const router = express.Router();

const explosionSql = `
  SELECT
    r.id_receta,
    COALESCE(pci.codigo, tci.codigo) AS producto_codigo,
    COALESCE(p.nombre, tp.nombre) AS producto_descripcion,
    ci.codigo AS insumo_codigo,
    ci.descripcion AS insumo_descripcion,
    ci.tipo_item AS tipo_insumo,
    em.cantidad_requerida,
    em.unidad_medida,
    em.nivel
  FROM EXPLOSION_MATERIALES em
  JOIN RECETA r ON r.id_receta = em.id_receta
  JOIN CATALOGO_ITEM ci ON ci.id_item = em.id_item
  LEFT JOIN PRODUCTO p ON p.id_producto = r.id_producto
  LEFT JOIN CATALOGO_ITEM pci ON pci.id_item = p.id_item
  LEFT JOIN TIPO_PREPARACION tp ON tp.id_tipo_preparacion = r.id_tipo_preparacion
  LEFT JOIN CATALOGO_ITEM tci ON tci.id_item = tp.id_item
`;

router.get('/', (req, res) => {
  res.json(db.prepare(`${explosionSql} ORDER BY producto_codigo, em.id_explosion`).all());
});

router.get('/producto/:codigo', (req, res) => {
  const codigo = req.params.codigo.toUpperCase();
  const rows = db.prepare(`
    ${explosionSql}
    WHERE upper(COALESCE(pci.codigo, tci.codigo)) = ?
    ORDER BY em.id_explosion
  `).all(codigo);

  if (!rows.length) return res.status(404).json({ error: 'No hay explosion de materiales para ese codigo.' });
  res.json({
    codigo: rows[0].producto_codigo,
    descripcion: rows[0].producto_descripcion,
    componentes: rows.map((row) => ({
      codigo: row.insumo_codigo,
      descripcion: row.insumo_descripcion,
      tipo_item: row.tipo_insumo,
      cantidad: row.cantidad_requerida,
      unidad: row.unidad_medida,
      nivel: row.nivel
    }))
  });
});

module.exports = router;
