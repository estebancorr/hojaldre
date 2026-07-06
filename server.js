const express = require('express');
const path = require('path');
const db = require('./db/database');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(async (req, res, next) => {
  try {
    await db.ready;
    next();
  } catch (error) {
    next(error);
  }
});

app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/catalogo-items', require('./routes/catalogoItems'));
app.use('/api/materias-primas', require('./routes/materiasPrimas'));
app.use('/api/lotes-materia-prima', require('./routes/lotesMateriaPrima'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/tipos-preparacion', require('./routes/tiposPreparacion'));
app.use('/api/recetas', require('./routes/recetas'));
app.use('/api/explosion-materiales', require('./routes/explosionMateriales'));
app.use('/api/ordenes', require('./routes/ordenes'));
app.use('/api/fases', require('./routes/fases'));
app.use('/api/lotes-produccion', require('./routes/lotesProduccion'));
app.use('/api/transformaciones', require('./routes/transformaciones'));
app.use('/api/lotes-stock', require('./routes/lotesStock'));
app.use('/api/trazabilidad', require('./routes/trazabilidad'));
app.use('/api/control-calidad', require('./routes/controlCalidad'));

app.get('/api/operarios', (req, res) => {
  res.json(db.prepare('SELECT * FROM OPERARIO ORDER BY id_operario DESC').all());
});

app.get('/api/equipos', (req, res) => {
  res.json(db.prepare('SELECT * FROM EQUIPO ORDER BY id_equipo DESC').all());
});

app.get('/api/registros-fase', (req, res) => {
  res.json(db.prepare(`
    SELECT rf.*, o.codigo_orden, f.nombre_fase, l.codigo_lote, l.tipo_lote
    FROM REGISTRO_FASE rf
    JOIN ORDEN_PRODUCCION o ON o.id_orden = rf.id_orden
    JOIN FASE_PRODUCCION f ON f.id_fase = rf.id_fase
    JOIN LOTE_PRODUCCION l ON l.id_lote_prod = rf.id_lote_salida
    WHERE o.codigo_orden <> 'STOCK-GENERAL'
    ORDER BY rf.id_registro_fase DESC
  `).all());
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Error inesperado.' });
});

if (require.main === module) {
  db.ready
    .then(() => {
    app.listen(port, () => {
      console.log(`Pan de Tata trazabilidad disponible en http://localhost:${port}`);
    });
    })
    .catch((error) => {
      console.error('No se pudo iniciar la base de datos:', error);
      process.exit(1);
    });
}

module.exports = app;
