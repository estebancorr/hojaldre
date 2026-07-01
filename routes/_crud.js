const express = require('express');
const db = require('../db/database');

function crud(table, idColumn, searchableSql = null) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const sql = searchableSql || `SELECT * FROM ${table} ORDER BY ${idColumn} DESC`;
    res.json(db.prepare(sql).all());
  });

  router.post('/', (req, res, next) => {
    try {
      const data = req.body;
      const keys = Object.keys(data).filter((key) => key !== idColumn);
      if (!keys.length) return res.status(400).json({ error: 'No hay datos para guardar.' });
      const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((key) => `@${key}`).join(',')})`);
      const result = stmt.run(data);
      res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).get(result.lastInsertRowid));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = crud;
