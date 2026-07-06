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
    WITH RECURSIVE arbol AS (
      SELECT
        r.id_receta,
        COALESCE(pci.codigo, tci.codigo) AS producto_codigo,
        COALESCE(p.nombre, tp.nombre) AS producto_descripcion,
        ci.id_item,
        ci.codigo AS insumo_codigo,
        ci.descripcion AS insumo_descripcion,
        ci.tipo_item AS tipo_insumo,
        em.cantidad_requerida AS cantidad_requerida,
        em.unidad_medida,
        1 AS nivel,
        COALESCE(pci.codigo, tci.codigo) || '>' || ci.codigo AS ruta
      FROM EXPLOSION_MATERIALES em
      JOIN RECETA r ON r.id_receta = em.id_receta
      JOIN CATALOGO_ITEM ci ON ci.id_item = em.id_item
      LEFT JOIN PRODUCTO p ON p.id_producto = r.id_producto
      LEFT JOIN CATALOGO_ITEM pci ON pci.id_item = p.id_item
      LEFT JOIN TIPO_PREPARACION tp ON tp.id_tipo_preparacion = r.id_tipo_preparacion
      LEFT JOIN CATALOGO_ITEM tci ON tci.id_item = tp.id_item
      WHERE upper(COALESCE(pci.codigo, tci.codigo)) = ?

      UNION ALL

      SELECT
        child_receta.id_receta,
        arbol.producto_codigo,
        arbol.producto_descripcion,
        child_item.id_item,
        child_item.codigo AS insumo_codigo,
        child_item.descripcion AS insumo_descripcion,
        child_item.tipo_item AS tipo_insumo,
        arbol.cantidad_requerida * child_em.cantidad_requerida AS cantidad_requerida,
        child_em.unidad_medida,
        arbol.nivel + 1 AS nivel,
        arbol.ruta || '>' || child_item.codigo AS ruta
      FROM arbol
      JOIN CATALOGO_ITEM parent_item ON parent_item.id_item = arbol.id_item
      JOIN TIPO_PREPARACION child_tipo ON child_tipo.id_item = parent_item.id_item
      JOIN RECETA child_receta ON child_receta.id_tipo_preparacion = child_tipo.id_tipo_preparacion
      JOIN EXPLOSION_MATERIALES child_em ON child_em.id_receta = child_receta.id_receta
      JOIN CATALOGO_ITEM child_item ON child_item.id_item = child_em.id_item
      WHERE arbol.nivel < 8
        AND instr(arbol.ruta, child_item.codigo) = 0
    )
    SELECT
      arbol.*,
      CASE
        WHEN arbol.tipo_insumo = 'MP' THEN COALESCE(mp_stock.disponible, 0)
        WHEN arbol.tipo_insumo IN ('SEMIELABORADO', 'RELLENO') THEN COALESCE(prep_stock.disponible, 0)
        WHEN arbol.tipo_insumo = 'PRODUCTO_TERMINADO' THEN COALESCE(prod_stock.disponible, 0)
        ELSE 0
      END AS cantidad_disponible,
      CASE
        WHEN arbol.tipo_insumo = 'MP' THEN COALESCE(mp_stock.unidad_medida, arbol.unidad_medida)
        WHEN arbol.tipo_insumo IN ('SEMIELABORADO', 'RELLENO') THEN COALESCE(prep_stock.unidad_medida, arbol.unidad_medida)
        WHEN arbol.tipo_insumo = 'PRODUCTO_TERMINADO' THEN COALESCE(prod_stock.unidad_medida, arbol.unidad_medida)
        ELSE arbol.unidad_medida
      END AS unidad_disponible
    FROM arbol
    LEFT JOIN (
      SELECT mp.id_item, SUM(l.peso_disponible) AS disponible, mp.unidad_medida
      FROM MATERIA_PRIMA mp
      JOIN LOTE_MATERIA_PRIMA l ON l.id_materia_prima = mp.id_materia_prima
      WHERE l.estado = 'DISPONIBLE'
      GROUP BY mp.id_item, mp.unidad_medida
    ) mp_stock ON mp_stock.id_item = arbol.id_item
    LEFT JOIN (
      SELECT tp.id_item, SUM(l.cantidad_actual) AS disponible, l.unidad_medida
      FROM TIPO_PREPARACION tp
      JOIN LOTE_PRODUCCION l ON l.id_tipo_preparacion = tp.id_tipo_preparacion
      WHERE l.estado = 'DISPONIBLE'
      GROUP BY tp.id_item, l.unidad_medida
    ) prep_stock ON prep_stock.id_item = arbol.id_item
    LEFT JOIN (
      SELECT p.id_item, SUM(l.cantidad_actual) AS disponible, l.unidad_medida
      FROM PRODUCTO p
      JOIN LOTE_PRODUCCION l ON l.id_producto = p.id_producto
      WHERE l.estado = 'DISPONIBLE'
      GROUP BY p.id_item, l.unidad_medida
    ) prod_stock ON prod_stock.id_item = arbol.id_item
    ORDER BY nivel, ruta
  `).all(codigo);

  if (!rows.length) return res.status(404).json({ error: 'No hay explosion de materiales para ese codigo.' });
  res.json({
    codigo: rows[0].producto_codigo,
    descripcion: rows[0].producto_descripcion,
    componentes: rows.map((row) => ({
      codigo: row.insumo_codigo,
      descripcion: row.insumo_descripcion,
      tipo_item: row.tipo_insumo,
      cantidad: Math.round(Number(row.cantidad_requerida) * 1000000) / 1000000,
      unidad: row.unidad_medida,
      disponible: Math.round(Number(row.cantidad_disponible || 0) * 1000000) / 1000000,
      unidad_disponible: row.unidad_disponible,
      nivel: row.nivel
    }))
  });
});

module.exports = router;
