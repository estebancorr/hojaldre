const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const localDb = require('./database');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Falta DATABASE_URL. Copia la cadena de conexion de Neon y ejecuta:');
  console.error('$env:DATABASE_URL="postgresql://..." ; npm run sync:neon');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
});

const schemaPath = path.join(__dirname, 'schema.postgres.sql');

const tables = [
  'PROVEEDOR',
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

const sequenceColumns = {
  PROVEEDOR: 'id_proveedor',
  CATALOGO_ITEM: 'id_item',
  MATERIA_PRIMA: 'id_materia_prima',
  PRODUCTO: 'id_producto',
  TIPO_PREPARACION: 'id_tipo_preparacion',
  RECETA: 'id_receta',
  DETALLE_RECETA: 'id_detalle_receta',
  EXPLOSION_MATERIALES: 'id_explosion',
  ORDEN_PRODUCCION: 'id_orden',
  FASE_PRODUCCION: 'id_fase',
  LOTE_MATERIA_PRIMA: 'id_lote_mp',
  LOTE_PRODUCCION: 'id_lote_prod',
  OPERARIO: 'id_operario',
  EQUIPO: 'id_equipo',
  REGISTRO_FASE: 'id_registro_fase',
  CONSUMO_LOTE: 'id_consumo',
  CONTROL_CALIDAD: 'id_control'
};

function q(identifier) {
  return `"${identifier.toLowerCase()}"`;
}

function postgresTable(table) {
  return q(table);
}

function localRows(table) {
  return localDb.prepare(`SELECT * FROM ${table}`).all();
}

async function resetOperationalData(client) {
  await client.query(`
    TRUNCATE TABLE
      control_calidad,
      consumo_lote,
      registro_fase,
      lote_produccion,
      lote_materia_prima,
      operario,
      equipo,
      proveedor
    RESTART IDENTITY CASCADE
  `);
  await client.query("DELETE FROM orden_produccion WHERE codigo_orden <> 'STOCK-GENERAL'");
}

async function importTable(client, table) {
  const rows = localRows(table);
  if (!rows.length) return 0;

  const columns = Object.keys(rows[0]);
  const columnSql = columns.map(q).join(', ');
  const values = [];
  const groups = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  await client.query(
    `INSERT INTO ${postgresTable(table)} (${columnSql}) VALUES ${groups.join(', ')} ON CONFLICT DO NOTHING`,
    values
  );
  return rows.length;
}

async function syncSequences(client) {
  for (const [table, column] of Object.entries(sequenceColumns)) {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence($1, $2),
        COALESCE((SELECT MAX(${q(column)}) FROM ${postgresTable(table)}), 1),
        true
      )
    `, [table.toLowerCase(), column.toLowerCase()]);
  }
}

async function main() {
  await localDb.ready;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(schemaPath, 'utf8'));

    if (process.env.RESET_NEON === '1') {
      await resetOperationalData(client);
    }

    const imported = {};
    for (const table of tables) {
      imported[table] = await importTable(client, table);
    }
    await syncSequences(client);
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, imported }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
