const db = require('./database');

db.ready
  .then(() => {
    db.transaction(() => {
      db.exec(`
        DELETE FROM CONTROL_CALIDAD;
        DELETE FROM CONSUMO_LOTE;
        DELETE FROM REGISTRO_FASE;
        DELETE FROM LOTE_PRODUCCION;
        DELETE FROM LOTE_MATERIA_PRIMA;
        DELETE FROM ORDEN_PRODUCCION WHERE codigo_orden <> 'STOCK-GENERAL';
        DELETE FROM OPERARIO;
        DELETE FROM EQUIPO;
        DELETE FROM PROVEEDOR;
      `);
      db.ensureSystemData();
    })();

    console.log('Datos operativos limpiados. Catalogo, recetas y explosion se conservaron.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
