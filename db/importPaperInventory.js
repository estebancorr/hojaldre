const db = require('./database');

const reportDate = '2026-07-07';
const defaultReceptionDate = '2026-07-06';

const rawMaterials = [
  { code: 'MDMP0252', qty: 17.680, unit: 'kg', note: 'Chocolate oscuro' },
  { code: 'MDMP0251', qty: 20.370, unit: 'kg', note: 'Chocolate leche' },
  { code: 'MDMP0002', qty: 50, unit: 'kg', note: 'Azucar' },
  { code: 'MDMP0003', qty: 3.740, unit: 'kg', note: 'Sal' },
  { code: 'MDMP0026', qty: 14, unit: 'kg', note: 'Levadura' },
  { code: 'MDMP0263', qty: 26, unit: 'L', note: 'Leche' },
  { code: 'MDMP0214', qty: 150, unit: 'kg', note: 'Harina - reporte: 3 sacos, calculado como 50 kg/saco' },
  { code: 'MDMP0029', qty: 36, unit: 'kg', note: 'Mantequilla Tunal' },
  { code: 'STMP0016', qty: 15.2, unit: 'kg', note: 'Mantequilla laminada - 19 x 800 g' },
  { code: 'MDMP0179', qty: 22.8, unit: 'kg', note: 'Queso' },
  { code: 'MDMP0341', qty: 10.4, unit: 'kg', note: 'Ricota' },
  { code: 'PTRE0005', qty: 8.2, unit: 'kg', note: 'Carne molida' },
  { code: 'MDMP0051', qty: 8.9, unit: 'kg', note: 'Pollo' },
  { code: 'MDMP0150', qty: 2.52, unit: 'kg', note: 'Cacao' }
];

const intermediateLots = [
  { code: 'STMZ0031', qty: 26, unit: 'kg', made: '2026-07-06', note: 'Dulce de manzana' },
  { code: 'STMS0013', qty: 4, unit: 'receta', made: '2026-07-02', note: 'Masa tipo A' },
  { code: 'STMS0023', qty: 7, unit: 'receta', made: '2026-07-03', note: 'Masa tipo B' },
  { code: 'ST-MASA-HOJALDRE', desc: 'MASA HOJALDRE', qty: 6, unit: 'receta', made: '2026-07-03', note: 'Masa hojaldre' },
  { code: 'STMS0008', qty: 6, unit: 'receta', made: '2026-06-29', note: 'Masa tequeno - fecha escrita 29/07/26, interpretada como 29/06/26' },
  { code: 'STMS0014', qty: 2, unit: 'receta', made: '2026-07-01', note: 'Masa palmera' },
  { code: 'ST-MASA-GALLETAS', desc: 'MASA PARA GALLETAS', qty: 18, unit: 'kg', made: '2026-07-06', note: 'Masa para galletas - 1 bandeja' }
];

const finishedLots = [
  { code: 'PTSU0046', qty: 195, made: '2026-07-04', note: 'Croissant simple' },
  { code: 'PTSU0047', qty: 63, made: '2026-07-04', note: 'Croissant leche' },
  { code: 'PTSU0048', qty: 60, made: '2026-07-04', note: 'Croissant oscuro - fecha escrita 04/06/07/26' },
  { code: 'PTSU0028', qty: 70, made: '2026-07-02', note: 'Croissant mini' },
  { code: 'PTSU0049', qty: 73, made: '2026-07-02', note: 'Pastel de manzana' },
  { code: 'PT-CRUFFIN-GENERICO', desc: 'CRUFFIN', qty: 42, made: '2026-06-29', note: 'Cruffin - fecha escrita 29/07/26, interpretada como 29/06/26' },
  { code: 'PTSU0092', qty: 135, made: '2026-07-01', note: 'Pastel de pollo' },
  { code: 'PTSU0091', qty: 157, made: '2026-07-04', note: 'Pastel de molida' },
  { code: 'PTSU0093', qty: 30, made: '2026-07-02', note: 'Pastel de ricota' },
  { code: 'PTSU0095', qty: 34, made: '2026-07-03', note: 'Pastel de jamon' },
  { code: 'PT-TEQUENOS-UND', desc: 'TEQUENOS 1 UND PT', qty: 100, made: '2026-06-27', note: 'Tequenos' },
  { code: 'PT-DEMI-BAGUETTE', desc: 'DEMI BAGUETTE', qty: 155, made: '2026-06-30', note: 'Demi baguette' },
  { code: 'PT-PAN-DE-DIOS', desc: 'PAN DE DIOS', qty: 346, made: '2026-07-02', note: 'Pan de dios' }
];

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function insert(table, data) {
  const keys = Object.keys(data);
  return db.prepare(`
    INSERT INTO ${table} (${keys.join(',')})
    VALUES (${keys.map((key) => `@${key}`).join(',')})
  `).run(data).lastInsertRowid;
}

function safeCode(value) {
  return String(value).replace(/[^A-Z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toUpperCase();
}

function ensureCatalogItem(code, desc, type, unit, family) {
  const existing = get('SELECT id_item FROM CATALOGO_ITEM WHERE codigo = ?', [code]);
  if (existing) return existing.id_item;
  return insert('CATALOGO_ITEM', {
    codigo: code,
    descripcion: desc,
    tipo_item: type,
    unidad_medida: unit,
    familia: family,
    activo: 1
  });
}

function ensureProduct(code, desc, unit = 'UND') {
  const idItem = ensureCatalogItem(code, desc, 'PRODUCTO_TERMINADO', unit, 'INVENTARIO');
  const existing = get('SELECT id_producto FROM PRODUCTO WHERE id_item = ?', [idItem]);
  if (existing) return existing.id_producto;
  return insert('PRODUCTO', {
    id_item: idItem,
    nombre: desc,
    descripcion: desc,
    categoria: 'INVENTARIO',
    peso_objetivo_unidad: null,
    estado: 'ACTIVO'
  });
}

function ensurePreparation(code, desc, unit = 'kg') {
  const idItem = ensureCatalogItem(code, desc, 'SEMIELABORADO', unit, 'INVENTARIO');
  const existing = get('SELECT id_tipo_preparacion FROM TIPO_PREPARACION WHERE id_item = ?', [idItem]);
  if (existing) return existing.id_tipo_preparacion;
  return insert('TIPO_PREPARACION', {
    id_item: idItem,
    nombre: desc,
    categoria: code,
    descripcion: desc,
    requiere_receta: 0,
    estado: 'ACTIVO'
  });
}

function ensureProvider() {
  const existing = get('SELECT id_proveedor FROM PROVEEDOR WHERE nombre = ?', ['Inventario papel']);
  if (existing) return existing.id_proveedor;
  return insert('PROVEEDOR', {
    nombre: 'Inventario papel',
    contacto: 'Reporte manual',
    telefono: null,
    email: null,
    direccion: null,
    estado: 'ACTIVO'
  });
}

function ensureStockOrder() {
  const existing = get("SELECT id_orden FROM ORDEN_PRODUCCION WHERE codigo_orden = 'STOCK-GENERAL'");
  if (existing) return existing.id_orden;

  const product = get("SELECT id_producto FROM PRODUCTO WHERE nombre = 'Stock general de preparaciones'");
  if (!product) throw new Error('No existe el producto tecnico STOCK-GENERAL.');
  return insert('ORDEN_PRODUCCION', {
    id_producto: product.id_producto,
    id_receta: null,
    codigo_orden: 'STOCK-GENERAL',
    fecha_programada: reportDate,
    cantidad_objetivo: 0,
    unidad_medida: 'kg',
    estado: 'ABIERTA',
    responsable: 'Sistema',
    observaciones: 'Orden tecnica para inventario inicial'
  });
}

function stockPhase() {
  const row = get("SELECT id_fase FROM FASE_PRODUCCION WHERE nombre_fase = 'Generacion de lote para stock'");
  if (!row) throw new Error('No existe la fase tecnica de stock.');
  return row.id_fase;
}

function lotExists(code) {
  return get('SELECT id_lote_prod FROM LOTE_PRODUCCION WHERE codigo_lote = ?', [code])
    || get('SELECT id_lote_mp FROM LOTE_MATERIA_PRIMA WHERE lote_proveedor = ?', [code]);
}

function importRawMaterials(providerId) {
  rawMaterials.forEach((row) => {
    const item = get('SELECT id_item, descripcion FROM CATALOGO_ITEM WHERE codigo = ?', [row.code]);
    if (!item) throw new Error(`No existe CATALOGO_ITEM ${row.code}.`);
    const mp = get('SELECT id_materia_prima FROM MATERIA_PRIMA WHERE id_item = ?', [item.id_item]);
    if (!mp) throw new Error(`No existe MATERIA_PRIMA para ${row.code}.`);

    const lotCode = `INV-${row.code}-${safeCode(row.note)}-${reportDate.replace(/-/g, '')}`;
    if (lotExists(lotCode)) return;
    insert('LOTE_MATERIA_PRIMA', {
      id_materia_prima: mp.id_materia_prima,
      id_proveedor: providerId,
      lote_proveedor: lotCode,
      lote_interno: lotCode,
      fecha_recepcion: defaultReceptionDate,
      fecha_vencimiento: null,
      peso_recibido: row.qty,
      peso_disponible: row.qty,
      temperatura_recepcion: null,
      estado: 'DISPONIBLE',
      observaciones: `Inventario papel ${reportDate}. ${row.note}. Unidad reportada: ${row.unit}`
    });
  });
}

function importIntermediateLots(orderId, phaseId) {
  intermediateLots.forEach((row) => {
    const item = get('SELECT id_item, descripcion FROM CATALOGO_ITEM WHERE codigo = ?', [row.code]);
    const desc = row.desc || item?.descripcion;
    if (!desc) throw new Error(`No existe descripcion para ${row.code}.`);
    const idTipoPreparacion = ensurePreparation(row.code, desc, row.unit);
    const lotCode = `INV-${row.code}-${row.made.replace(/-/g, '')}`;
    if (lotExists(lotCode)) return;
    insert('LOTE_PRODUCCION', {
      id_orden: orderId,
      id_producto: null,
      id_tipo_preparacion: idTipoPreparacion,
      id_receta: null,
      id_fase_actual: phaseId,
      codigo_lote: lotCode,
      tipo_lote: 'SEMIELABORADO',
      fecha_creacion: row.made,
      cantidad_actual: row.qty,
      unidad_medida: row.unit,
      estado: 'DISPONIBLE',
      observaciones: `Inventario papel ${reportDate}. ${row.note}`
    });
  });
}

function importFinishedLots(orderId, phaseId) {
  finishedLots.forEach((row) => {
    const item = get('SELECT id_item, descripcion, unidad_medida FROM CATALOGO_ITEM WHERE codigo = ?', [row.code]);
    const desc = row.desc || item?.descripcion;
    if (!desc) throw new Error(`No existe descripcion para ${row.code}.`);
    const idProducto = ensureProduct(row.code, desc, item?.unidad_medida || 'UND');
    const recipe = get('SELECT id_receta FROM RECETA WHERE id_producto = ? AND activa = 1 ORDER BY id_receta DESC LIMIT 1', [idProducto]);
    const lotCode = `INV-${row.code}-${row.made.replace(/-/g, '')}`;
    if (lotExists(lotCode)) return;
    insert('LOTE_PRODUCCION', {
      id_orden: orderId,
      id_producto: idProducto,
      id_tipo_preparacion: null,
      id_receta: recipe?.id_receta || null,
      id_fase_actual: phaseId,
      codigo_lote: lotCode,
      tipo_lote: 'PRODUCTO_TERMINADO',
      fecha_creacion: row.made,
      cantidad_actual: row.qty,
      unidad_medida: 'UND',
      estado: 'DISPONIBLE',
      observaciones: `Inventario papel ${reportDate}. ${row.note}`
    });
  });
}

db.ready
  .then(() => {
    db.transaction(() => {
      const providerId = ensureProvider();
      const orderId = ensureStockOrder();
      const phaseId = stockPhase();
      importRawMaterials(providerId);
      importIntermediateLots(orderId, phaseId);
      importFinishedLots(orderId, phaseId);
    })();

    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM LOTE_MATERIA_PRIMA) AS lotes_mp,
        (SELECT COUNT(*) FROM LOTE_PRODUCCION WHERE tipo_lote = 'SEMIELABORADO') AS lotes_st,
        (SELECT COUNT(*) FROM LOTE_PRODUCCION WHERE tipo_lote = 'PRODUCTO_TERMINADO') AS lotes_pt
    `).get();
    console.log(JSON.stringify(counts, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
