const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const initSqlJs = require('sql.js');
const { Pool } = require('pg');
const { pdfProducts, pdfExplosions } = require('./pdfCatalogData');

const dbPath = process.env.TRACE_DB_PATH
  ? path.resolve(process.env.TRACE_DB_PATH)
  : path.join(__dirname, 'trazabilidad.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

let sqlDb = null;
let inTransaction = false;
const shouldHydrateFromNeon = Boolean(process.env.DATABASE_URL && (process.env.VERCEL || process.env.USE_NEON_RUNTIME === '1'));
const disablePersist = Boolean(process.env.VERCEL || process.env.DISABLE_SQLITE_PERSIST === '1');

const hydrateTables = [
  'PROVEEDOR',
  'UBICACION',
  'CATALOGO_ITEM',
  'MATERIA_PRIMA',
  'PRODUCTO',
  'TIPO_PREPARACION',
  'RECETA',
  'DETALLE_RECETA',
  'EXPLOSION_MATERIALES',
  'ORDEN_PRODUCCION',
  'FASE_PRODUCCION',
  'LOTE_MATERIA_PRIMA',
  'LOTE_PRODUCCION',
  'OPERARIO',
  'EQUIPO',
  'REGISTRO_FASE',
  'CONSUMO_LOTE',
  'CONTROL_CALIDAD'
];

function pgPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
  });
}

function sqliteColumns(table) {
  const result = sqlDb.exec(`PRAGMA table_info(${table})`);
  return (result[0]?.values || []).map((row) => row[1]);
}

function insertSqliteRow(table, row) {
  const columns = sqliteColumns(table).filter((column) => Object.prototype.hasOwnProperty.call(row, column));
  if (!columns.length) return;
  sqlDb.run(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    columns.map((column) => row[column])
  );
}

async function hydrateFromNeon() {
  if (!shouldHydrateFromNeon) return;

  const pool = pgPool();
  const client = await pool.connect();
  try {
    sqlDb.run('PRAGMA foreign_keys = OFF');
    [...hydrateTables].reverse().forEach((table) => sqlDb.run(`DELETE FROM ${table}`));

    for (const table of hydrateTables) {
      try {
        const result = await client.query(`SELECT * FROM ${table.toLowerCase()} ORDER BY 1 ASC`);
        result.rows.forEach((row) => insertSqliteRow(table, row));
      } catch (error) {
        if (error.code !== '42P01') throw error;
      }
    }
    sqlDb.run('PRAGMA foreign_keys = ON');
  } finally {
    client.release();
    await pool.end();
  }
}

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

function ensureLocationColumns() {
  ensureColumn('LOTE_MATERIA_PRIMA', 'id_ubicacion', 'INTEGER');
  ensureColumn('LOTE_PRODUCCION', 'id_ubicacion', 'INTEGER');
  ensureColumn('CONSUMO_LOTE', 'temperatura_uso', 'REAL');
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

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const knownRawMaterials = [
  ['MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL', 'kg', ['HARINA DE TRIGO ESPECIAL']],
  ['MDMP0263', 'LECHE LIQUIDA ENTERA', 'L', ['LECHE LIQUIDA']],
  ['MDMP0029', 'MANTEQUILLA TIPO A CON SAL', 'kg'],
  ['MDMP0002', 'AZUCAR BLANCA REFINADA', 'kg'],
  ['MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION', 'kg'],
  ['MDMP0026', 'LEVADURA SECA INSTANTANEA MASA SALADA', 'kg'],
  ['MDMP0260', 'BOLSA DE HIELO GRANDE', 'kg', ['BOLSA DE HIELO']],
  ['STMP0002', 'HUEVO LIQUIDO 1 KG', 'kg', ['HUEVOS', 'HUEVO LIQUIDO']],
  ['STMP0016', 'MANTEQUILLA PDT 1 UND', 'UND'],
  ['MDMP0179', 'QUESO BLANCO DURO', 'kg'],
  ['MDMP0012', 'LECHE EN POLVO', 'kg'],
  ['MDMP0153', 'COCO RALLADO', 'kg'],
  ['MDMP0037', 'MEJORADOR PURATOS', 'kg'],
  ['MDMP0034', 'MARGARINA CON SAL 5 KG', 'kg'],
  ['MDMP0150', 'CACAO EN POLVO', 'kg'],
  ['MDMP0251', 'CHOCOLATE CON LECHE EN MINI BARRAS', 'kg'],
  ['MDMP0252', 'CHOCOLATE OSCURO AL 60 % EN MINI BARRAS', 'kg'],
  ['MDMP0267', 'CREMA DE PISTACHO', 'kg']
];

const legacyRawMaterialLotLinks = [
  ['MP-HARINA', 'MDMP0214'],
  ['MP-MANTEQUILLA', 'MDMP0029'],
  ['MP-AZUCAR', 'MDMP0002'],
  ['MP-SAL', 'MDMP0003'],
  ['MP-LEVADURA', 'MDMP0026'],
  ['MP-HIELO', 'MDMP0260'],
  ['MP-LECHE', 'MDMP0263']
];

function ensureCatalogItem({ codigo, descripcion, tipo_item, unidad_medida, familia }) {
  const existing = rawGet('SELECT id_item FROM CATALOGO_ITEM WHERE codigo = ?', [codigo]);
  if (existing) {
    sqlDb.run(`
      UPDATE CATALOGO_ITEM
      SET descripcion = ?, tipo_item = ?, unidad_medida = ?, familia = COALESCE(familia, ?), activo = 1
      WHERE id_item = ?
    `, [descripcion, tipo_item, unidad_medida, familia || null, existing.id_item]);
    return existing.id_item;
  }
  sqlDb.run(`
    INSERT INTO CATALOGO_ITEM (codigo, descripcion, tipo_item, unidad_medida, familia, activo)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [codigo, descripcion, tipo_item, unidad_medida, familia || null]);
  return rawGet('SELECT last_insert_rowid() AS id').id;
}

function ensureKnownRawMaterials() {
  const materias = sqlDb.exec(`
    SELECT mp.id_materia_prima, mp.nombre, mp.descripcion, ci.codigo
    FROM MATERIA_PRIMA mp
    LEFT JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
  `)[0]?.values || [];
  const byName = new Map();
  materias.forEach(([id, nombre, descripcion, codigo]) => {
    [nombre, descripcion, codigo].forEach((value) => {
      const key = normalizeName(value);
      if (key && !byName.has(key)) byName.set(key, id);
    });
  });

  knownRawMaterials.forEach(([codigo, descripcion, unidad, aliases = []]) => {
    const idItem = ensureCatalogItem({
      codigo,
      descripcion,
      tipo_item: 'MP',
      unidad_medida: unidad,
      familia: 'INSUMO'
    });
    const keys = [codigo, descripcion, ...aliases].map(normalizeName);
    const existingId = keys.map((key) => byName.get(key)).find(Boolean);
    const byItem = rawGet('SELECT id_materia_prima FROM MATERIA_PRIMA WHERE id_item = ?', [idItem]);

    if (byItem) {
      sqlDb.run(`
        UPDATE MATERIA_PRIMA
        SET nombre = ?, descripcion = ?, unidad_medida = ?, estado = 'ACTIVA'
        WHERE id_materia_prima = ?
      `, [descripcion, descripcion, unidad, byItem.id_materia_prima]);
      return;
    }

    if (existingId) {
      sqlDb.run(`
        UPDATE MATERIA_PRIMA
        SET id_item = ?, nombre = ?, descripcion = ?, unidad_medida = ?, estado = 'ACTIVA'
        WHERE id_materia_prima = ?
      `, [idItem, descripcion, descripcion, unidad, existingId]);
      return;
    }

    sqlDb.run(`
      INSERT INTO MATERIA_PRIMA (id_item, nombre, descripcion, unidad_medida, temperatura_objetivo, estado)
      VALUES (?, ?, ?, ?, NULL, 'ACTIVA')
    `, [idItem, descripcion, descripcion, unidad]);
  });
}

function relinkLegacyRawMaterialLots() {
  legacyRawMaterialLotLinks.forEach(([legacyCode, targetCode]) => {
    const legacy = rawGet(`
      SELECT mp.id_materia_prima
      FROM MATERIA_PRIMA mp
      JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
      WHERE ci.codigo = ?
    `, [legacyCode]);
    const target = rawGet(`
      SELECT mp.id_materia_prima
      FROM MATERIA_PRIMA mp
      JOIN CATALOGO_ITEM ci ON ci.id_item = mp.id_item
      WHERE ci.codigo = ?
    `, [targetCode]);
    if (!legacy || !target || legacy.id_materia_prima === target.id_materia_prima) return;

    sqlDb.run(`
      UPDATE LOTE_MATERIA_PRIMA
      SET id_materia_prima = ?
      WHERE id_materia_prima = ?
    `, [target.id_materia_prima, legacy.id_materia_prima]);
    sqlDb.run(`
      UPDATE MATERIA_PRIMA
      SET estado = 'INACTIVA'
      WHERE id_materia_prima = ?
        AND NOT EXISTS (
          SELECT 1 FROM LOTE_MATERIA_PRIMA l
          WHERE l.id_materia_prima = MATERIA_PRIMA.id_materia_prima
        )
    `, [legacy.id_materia_prima]);
  });
}

function tipoItemPorCodigo(code) {
  const overrides = {
    STMP0002: 'MP',
    STMP0016: 'MP'
  };
  if (overrides[code]) return overrides[code];
  if (code.startsWith('PT')) return 'PRODUCTO_TERMINADO';
  if (code.startsWith('MDME')) return 'EMPAQUE';
  if (code.startsWith('MDMP') || code.startsWith('MEDMP')) return 'MP';
  if (code.startsWith('STMZ')) return 'RELLENO';
  if (code.startsWith('GSGE')) return 'OTRO';
  if (code.startsWith('ST')) return 'SEMIELABORADO';
  return 'OTRO';
}

function unidadPorDescripcion(desc, fallback = 'UND') {
  if (/\bKG\b/i.test(desc)) return 'kg';
  if (/\bGR\b/i.test(desc)) return 'gr';
  if (/\bCAJ\b/i.test(desc)) return 'CAJ';
  if (/\bPAQ\b/i.test(desc)) return 'PAQ';
  return fallback;
}

function ensureProductFromCatalog(code, desc, unidad = 'UND', familia = 'HOJALDRE') {
  const idItem = ensureCatalogItem({ codigo: code, descripcion: desc, tipo_item: 'PRODUCTO_TERMINADO', unidad_medida: unidad, familia });
  const existing = rawGet('SELECT id_producto FROM PRODUCTO WHERE id_item = ?', [idItem]);
  if (existing) return existing.id_producto;
  sqlDb.run(`
    INSERT INTO PRODUCTO (id_item, nombre, descripcion, categoria, peso_objetivo_unidad, estado)
    VALUES (?, ?, ?, ?, NULL, 'ACTIVO')
  `, [idItem, desc, desc, familia]);
  return rawGet('SELECT last_insert_rowid() AS id').id;
}

function ensureTipoPreparacionFromCatalog(code, desc) {
  const type = tipoItemPorCodigo(code);
  if (['MP', 'EMPAQUE', 'OTRO', 'PRODUCTO_TERMINADO'].includes(type)) return null;
  const idItem = ensureCatalogItem({
    codigo: code,
    descripcion: desc,
    tipo_item: type,
    unidad_medida: unidadPorDescripcion(desc, 'kg'),
    familia: type === 'RELLENO' ? 'RELLENO' : 'HOJALDRE'
  });
  const existing = rawGet('SELECT id_tipo_preparacion FROM TIPO_PREPARACION WHERE id_item = ?', [idItem]);
  if (existing) return existing.id_tipo_preparacion;
  sqlDb.run(`
    INSERT INTO TIPO_PREPARACION (id_item, nombre, categoria, descripcion, requiere_receta, estado)
    VALUES (?, ?, ?, ?, 0, 'ACTIVO')
  `, [idItem, desc, code, desc]);
  return rawGet('SELECT last_insert_rowid() AS id').id;
}

function ensureMateriaPrimaFromCatalog(code, desc) {
  const idItem = ensureCatalogItem({
    codigo: code,
    descripcion: desc,
    tipo_item: 'MP',
    unidad_medida: unidadPorDescripcion(desc, 'kg'),
    familia: 'INSUMO'
  });
  const existing = rawGet('SELECT id_materia_prima FROM MATERIA_PRIMA WHERE id_item = ?', [idItem]);
  if (existing) return existing.id_materia_prima;
  sqlDb.run(`
    INSERT INTO MATERIA_PRIMA (id_item, nombre, descripcion, unidad_medida, temperatura_objetivo, estado)
    VALUES (?, ?, ?, ?, NULL, 'ACTIVA')
  `, [idItem, desc, desc, unidadPorDescripcion(desc, 'kg')]);
  return rawGet('SELECT last_insert_rowid() AS id').id;
}

function ensureRecipeForCode(code, desc) {
  const item = rawGet('SELECT tipo_item FROM CATALOGO_ITEM WHERE codigo = ?', [code]);
  if (item?.tipo_item === 'PRODUCTO_TERMINADO') {
    const productId = ensureProductFromCatalog(code, desc, unidadPorDescripcion(desc, 'UND'), 'HOJALDRE');
    const existing = rawGet('SELECT id_receta FROM RECETA WHERE id_producto = ? AND nombre_receta = ?', [productId, `${code} v1`]);
    if (existing) return existing.id_receta;
    sqlDb.run(`
      INSERT INTO RECETA (id_producto, id_tipo_preparacion, nombre_receta, version, rendimiento_estimado, activa)
      VALUES (?, NULL, ?, '1', NULL, 1)
    `, [productId, `${code} v1`]);
    return rawGet('SELECT last_insert_rowid() AS id').id;
  }

  const tipoId = ensureTipoPreparacionFromCatalog(code, desc);
  const existing = rawGet('SELECT id_receta FROM RECETA WHERE id_tipo_preparacion = ? AND nombre_receta = ?', [tipoId, `${code} v1`]);
  if (existing) return existing.id_receta;
  sqlDb.run(`
    INSERT INTO RECETA (id_producto, id_tipo_preparacion, nombre_receta, version, rendimiento_estimado, activa)
    VALUES (NULL, ?, ?, '1', NULL, 1)
  `, [tipoId, `${code} v1`]);
  return rawGet('SELECT last_insert_rowid() AS id').id;
}

function linkRecipe(parentCode, parentDesc, childCode, childDesc) {
  ensureCatalogItem({
    codigo: parentCode,
    descripcion: parentDesc,
    tipo_item: tipoItemPorCodigo(parentCode),
    unidad_medida: unidadPorDescripcion(parentDesc, 'UND'),
    familia: 'HOJALDRE'
  });
  const childType = tipoItemPorCodigo(childCode);
  const childItemId = ensureCatalogItem({
    codigo: childCode,
    descripcion: childDesc,
    tipo_item: childType,
    unidad_medida: unidadPorDescripcion(childDesc, childType === 'EMPAQUE' ? 'UND' : 'kg'),
    familia: childType === 'RELLENO' ? 'RELLENO' : childType === 'EMPAQUE' ? 'EMPAQUE' : 'HOJALDRE'
  });
  if (childType === 'MP') ensureMateriaPrimaFromCatalog(childCode, childDesc);
  if (['SEMIELABORADO', 'RELLENO'].includes(childType)) ensureTipoPreparacionFromCatalog(childCode, childDesc);
  const recetaId = ensureRecipeForCode(parentCode, parentDesc);
  const exists = rawGet('SELECT id_detalle_receta FROM DETALLE_RECETA WHERE id_receta = ? AND id_item = ?', [recetaId, childItemId]);
  if (exists) return;
  sqlDb.run(`
    INSERT INTO DETALLE_RECETA
    (id_receta, id_item, tipo_insumo, id_materia_prima, id_tipo_preparacion, cantidad_estandar, unidad_medida, tolerancia)
    VALUES (?, ?, ?, NULL, NULL, 1, ?, 0)
  `, [
    recetaId,
    childItemId,
    ['SEMIELABORADO', 'RELLENO', 'PRODUCTO_TERMINADO'].includes(childType) ? 'PREPARACION' : 'MP',
    unidadPorDescripcion(childDesc, 'UND')
  ]);
  const detalleId = rawGet('SELECT last_insert_rowid() AS id').id;
  sqlDb.run(`
    INSERT INTO EXPLOSION_MATERIALES
    (id_receta, id_item, id_detalle_receta, cantidad_requerida, unidad_medida, nivel, activo)
    VALUES (?, ?, ?, 1, ?, 1, 1)
  `, [recetaId, childItemId, detalleId, unidadPorDescripcion(childDesc, 'UND')]);
}

function ensurePdfCatalogData() {
  pdfProducts.forEach(([code, desc, unidad, familia]) => {
    if (code.startsWith('PT')) ensureProductFromCatalog(code, desc, unidad, familia);
    else ensureTipoPreparacionFromCatalog(code, desc);
  });
  pdfExplosions.forEach(([parentCode, parentDesc, childCode, childDesc]) => {
    linkRecipe(parentCode, parentDesc, childCode, childDesc);
  });
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
  ensureKnownRawMaterials();
  relinkLegacyRawMaterialLots();
  ensurePdfCatalogData();
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
  [
    ['Almacen seco', 'SECO', 'Materia prima o empaque a temperatura ambiente'],
    ['Nevera', 'REFRIGERADO', 'Preparaciones o materia prima refrigerada'],
    ['Congelador', 'CONGELADO', 'Producto o semiterminado congelado'],
    ['Produccion', 'PROCESO', 'Lote en proceso de produccion']
  ].forEach(([nombre, tipo, descripcion]) => {
    sqlDb.run(`
      INSERT INTO UBICACION (nombre, tipo, descripcion, activa)
      SELECT ?, ?, ?, 1
      WHERE NOT EXISTS (SELECT 1 FROM UBICACION WHERE nombre = ?)
    `, [nombre, tipo, descripcion, nombre]);
  });
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
  if (disablePersist) return;
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
  }).then(async (SQL) => {
    const existing = !shouldHydrateFromNeon && fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
    sqlDb = existing ? new SQL.Database(existing) : new SQL.Database();
    sqlDb.run('PRAGMA foreign_keys = ON');
    sqlDb.run(fs.readFileSync(schemaPath, 'utf8'));
    ensureRegistroFaseColumns();
    ensureLocationColumns();
    await hydrateFromNeon();
    ensureLocationColumns();
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
