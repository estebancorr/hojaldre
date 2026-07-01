const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, l.codigo_lote
    FROM CONTROL_CALIDAD c
    JOIN LOTE_PRODUCCION l ON l.id_lote_prod = c.id_lote_prod
    ORDER BY c.id_control DESC
  `).all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    if (!data.id_registro_fase || !data.id_lote_prod) return res.status(400).json({ error: 'Control de calidad necesita lote y registro de fase.' });
    if (!data.fecha) data.fecha = new Date().toISOString().slice(0, 10);
    const keys = Object.keys(data);
    const result = db.prepare(`INSERT INTO CONTROL_CALIDAD (${keys.join(',')}) VALUES (${keys.map((key) => `@${key}`).join(',')})`).run(data);
    res.status(201).json(db.prepare('SELECT * FROM CONTROL_CALIDAD WHERE id_control = ?').get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
