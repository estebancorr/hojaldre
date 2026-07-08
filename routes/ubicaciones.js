const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM UBICACION WHERE activa = 1 ORDER BY nombre').all());
});

router.post('/', (req, res, next) => {
  try {
    const data = req.body;
    const nombre = String(data.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre de ubicacion obligatorio.' });

    const result = db.prepare(`
      INSERT INTO UBICACION (nombre, tipo, descripcion, activa)
      VALUES (@nombre, @tipo, @descripcion, 1)
    `).run({
      nombre,
      tipo: data.tipo || 'GENERAL',
      descripcion: data.descripcion || null
    });

    res.status(201).json(db.prepare('SELECT * FROM UBICACION WHERE id_ubicacion = ?').get(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
