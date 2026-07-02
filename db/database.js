const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbPath = process.env.TRACE_DB_PATH
  ? path.resolve(process.env.TRACE_DB_PATH)
  : path.join(__dirname, 'trazabilidad.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

let sqlDb = null;
let inTransaction = false;

function ensureRegistroFaseColumns() {
  const result = sqlDb.exec('PRAGMA table_info(REGISTRO_FASE)');
  const columns = new Set((result[0]?.values || []).map((row) => row[1]));
  const additions = [
    ['temperatura_masa', 'REAL'],
    ['peso_por_porcion', 'REAL'],
    ['duracion_amasado_seg', 'INTEGER']
  ];
  additions.forEach(([name, type]) => {
    if (!columns.has(name)) sqlDb.run(`ALTER TABLE REGISTRO_FASE ADD COLUMN ${name} ${type}`);
  });
}

function tableColumns(table) {
  const result = sqlDb.exec(`PRAGMA table_info(${table})`);
  return new Set((result[0]?.values || []).map((row) => row[1]));
}

function ensureColumn(table, column, definition) {
  const columns = tableColumns(table);
  if (!columns.has(column)) sqlDb.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function slug(value, fallback) {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || fallback;
}

function ensureCatalogItem({ codigo, descripcion, tipo_item, unidad_medida, familia }) {
  const existing = rawGet('SELECT id_item FROM CATALOGO_ITEM WHERE codigo = ?', [codigo]);
  if (existing) return existing.id_item;
  sqlDb.run(`
    INSERT INTO CATALOGO_ITEM (codigo, descripcion, tipo_item, unidad_medida, familia, activo)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [codigo, descripcion, tipo_item, unidad_medida, familia || null]);
  return rawGet('SELECT last_insert_rowid() AS id').id;
}

function ensureCatalogColumns() {
  ensureColumn('MATERIA_PRIMA', 'id_item', 'INTEGER');
  ensureColumn('PRODUCTO', 'id_item', 'INTEGER');
  ensureColumn('TIPO_PREPARACION', 'id_item', 'INTEGER');
  ensureColumn('DETALLE_RECETA', 'id_item', 'INTEGER');

  const materias = sqlDb.exec('SELECT id_materia_prima, nombre, descripcion, unidad_medida FROM MATERIA_PRIMA WHERE id_item IS NULL')[0]?.values || [];
  materias.forEach(([id, nombre, descripcion, unidad]) => {
    const idItem = ensureCatalogItem({
      codigo: `MP-${slug(nombre, id)}`,
      descripcion: descripcion || nombre,
      tipo_item: 'MP',
      unidad_medida: unidad || 'kg',
      familia: 'Materia prima'
    });
    sqlDb.run('UPDATE MATERIA_PRIMA SET id_item = ? WHERE id_materia_prima = ?', [idItem, id]);
  });

  const productos = sqlDb.exec('SELECT id_producto, nombre, descripcion, categoria FROM PRODUCTO WHERE id_item IS NULL')[0]?.values || [];
  productos.forEach(([id, nombre, descripcion, categoria]) => {
    const idItem = ensureCatalogItem({
      codigo: `PT-${slug(nombre, id)}`,
      descripcion: descripcion || nombre,
      tipo_item: 'PRODUCTO_TERMINADO',
      unidad_medida: 'kg',
      familia: categoria || 'Producto terminado'
    });
    sqlDb.run('UPDATE PRODUCTO SET id_item = ? WHERE id_producto = ?', [idItem, id]);
  });

  const tipos = sqlDb.exec('SELECT id_tipo_preparacion, nombre, categoria, descripcion FROM TIPO_PREPARACION WHERE id_item IS NULL')[0]?.values || [];
  tipos.forEach(([id, nombre, categoria, descripcion]) => {
    const idItem = ensureCatalogItem({
      codigo: `ST-${slug(categoria || nombre, id)}`,
      descripcion: descripcion || nombre,
      tipo_item: 'SEMIELABORADO',
      unidad_medida: 'kg',
      familia: categoria || 'Semielaborado'
    });
    sqlDb.run('UPDATE TIPO_PREPARACION SET id_item = ? WHERE id_tipo_preparacion = ?', [idItem, id]);
  });

  sqlDb.run(`
    UPDATE DETALLE_RECETA
    SET id_item = (
      SELECT id_item FROM MATERIA_PRIMA mp WHERE mp.id_materia_prima = DETALLE_RECETA.id_materia_prima
    )
    WHERE id_item IS NULL AND id_materia_prima IS NOT NULL
  `);
  sqlDb.run(`
    UPDATE DETALLE_RECETA
    SET id_item = (
      SELECT id_item FROM TIPO_PREPARACION tp WHERE tp.id_tipo_preparacion = DETALLE_RECETA.id_tipo_preparacion
    )
    WHERE id_item IS NULL AND id_tipo_preparacion IS NOT NULL
  `);
  sqlDb.run('CREATE INDEX IF NOT EXISTS idx_detalle_receta_item ON DETALLE_RECETA(id_item)');
}

function rawGet(sql, params = []) {
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  try {
    return stmt.step() ? stmt.getAsObject() : undefined;
  } finally {
    stmt.free();
  }
}

function ensureSystemData() {
  ensureReady();
  sqlDb.run(`
    INSERT INTO PRODUCTO (nombre, descripcion, categoria, peso_objetivo_unidad, estado)
    SELECT 'Stock general de preparaciones', 'Producto interno para lotes sin orden comercial', 'INTERNO', NULL, 'ACTIVO'
    WHERE NOT EXISTS (SELECT 1 FROM PRODUCTO WHERE nombre = 'Stock general de preparaciones')
  `);
  sqlDb.run(`
    INSERT INTO TIPO_PREPARACION (nombre, categoria, descripcion, requiere_receta, estado)
    SELECT 'Lote consolidado', 'CONS-MP', 'Agrupacion trazable de uno o varios lotes', 0, 'ACTIVO'
    WHERE NOT EXISTS (SELECT 1 FROM TIPO_PREPARACION WHERE nombre = 'Lote consolidado')
  `);
  sqlDb.run(`
    INSERT INTO FASE_PRODUCCION (nombre_fase, orden_fase, descripcion, requiere_control_temperatura, activa)
    SELECT 'Generacion de lote para stock', 0, 'Registro interno para preparaciones sin orden', 0, 1
    WHERE NOT EXISTS (SELECT 1 FROM FASE_PRODUCCION WHERE nombre_fase = 'Generacion de lote para stock')
  `);

  const product = rawGet("SELECT id_producto FROM PRODUCTO WHERE nombre = 'Stock general de preparaciones'");
  sqlDb.run(`
    INSERT INTO ORDEN_PRODUCCION
    (id_producto, id_receta, codigo_orden, fecha_programada, cantidad_objetivo, unidad_medida, estado, responsable, observaciones)
    SELECT ?, NULL, 'STOCK-GENERAL', date('now'), 0, 'kg', 'ABIERTA', 'Sistema', 'Orden tecnica para stock no asociado a produccion'
    WHERE NOT EXISTS (SELECT 1 FROM ORDEN_PRODUCCION WHERE codigo_orden = 'STOCK-GENERAL')
  `, [product.id_producto]);
  ensureCatalogColumns();
  persist();
}

function normalizeParams(args) {
  if (!args.length) return undefined;
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return Object.fromEntries(Object.entries(args[0]).map(([key, value]) => {
      const bindKey = key.startsWith('@') || key.startsWith(':') || key.startsWith('$') ? key : `@${key}`;
      return [bindKey, value === undefined ? null : value];
    }));
  }
  return args.map((value) => value === undefined ? null : value);
}

function ensureReady() {
  if (!sqlDb) throw new Error('La base de datos aun no esta lista.');
}

function persist() {
  ensureReady();
  if (inTransaction) return;
  fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()));
}

class PreparedStatement {
  constructor(sql) {
    this.sql = sql;
  }

  _withStatement(args, reader) {
    ensureReady();
    const stmt = sqlDb.prepare(this.sql);
    const params = normalizeParams(args);
    if (params) stmt.bind(params);
    try {
      return reader(stmt);
    } finally {
      stmt.free();
    }
  }

  all(...args) {
    return this._withStatement(args, (stmt) => {
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    });
  }

  get(...args) {
    return this._withStatement(args, (stmt) => stmt.step() ? stmt.getAsObject() : undefined);
  }

  run(...args) {
    this._withStatement(args, (stmt) => {
      stmt.step();
    });
    const lastInsertRowid = sqlDb.exec('SELECT last_insert_rowid() AS id')[0]?.values?.[0]?.[0] || 0;
    const changes = sqlDb.exec('SELECT changes() AS n')[0]?.values?.[0]?.[0] || 0;
    persist();
    return { lastInsertRowid, changes };
  }
}

const api = {
  ready: initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  }).then((SQL) => {
    const existing = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
    sqlDb = existing ? new SQL.Database(existing) : new SQL.Database();
    sqlDb.run('PRAGMA foreign_keys = ON');
    sqlDb.run(fs.readFileSync(schemaPath, 'utf8'));
    ensureRegistroFaseColumns();
    ensureCatalogColumns();
    ensureSystemData();
    ensureCatalogColumns();
    persist();
    return api;
  }),

  pragma(sql) {
    ensureReady();
    sqlDb.run(`PRAGMA ${sql}`);
    persist();
  },

  exec(sql) {
    ensureReady();
    const result = sqlDb.exec(sql);
    persist();
    return result;
  },

  prepare(sql) {
    ensureReady();
    return new PreparedStatement(sql);
  },

  ensureSystemData,

  transaction(fn) {
    return (...args) => {
      ensureReady();
      inTransaction = true;
      sqlDb.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        sqlDb.run('COMMIT');
        inTransaction = false;
        persist();
        return result;
      } catch (error) {
        try {
          sqlDb.run('ROLLBACK');
        } catch (rollbackError) {
          error.message = `${error.message} (rollback tambien fallo: ${rollbackError.message})`;
        }
        inTransaction = false;
        persist();
        throw error;
      }
    };
  }
};

module.exports = api;
