module.exports = require('./_crud')(
  'RECETA',
  'id_receta',
  `SELECT r.*, p.nombre AS producto, tp.nombre AS tipo_preparacion
   FROM RECETA r
   LEFT JOIN PRODUCTO p ON p.id_producto = r.id_producto
   LEFT JOIN TIPO_PREPARACION tp ON tp.id_tipo_preparacion = r.id_tipo_preparacion
   ORDER BY r.id_receta DESC`
);
