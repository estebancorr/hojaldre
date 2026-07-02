const db = require('../db/database');

const validTypes = new Set(['MP', 'SEMIELABORADO', 'PRODUCTO_TERMINADO', 'EMPAQUE', 'RELLENO', 'OTRO']);

function slug(value, fallback = 'ITEM') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || fallback;
}

function uniqueCode(base) {
  let code = base;
  let index = 2;
  while (db.prepare('SELECT id_item FROM CATALOGO_ITEM WHERE codigo = ?').get(code)) {
    code = `${base}-${index}`;
    index += 1;
  }
  return code;
}

function createCatalogItem({ codigo, descripcion, tipo_item, unidad_medida, familia }) {
  if (!validTypes.has(tipo_item)) throw new Error('Tipo de item de catalogo invalido.');
  const finalCode = uniqueCode(slug(codigo || descripcion, 'ITEM'));
  const result = db.prepare(`
    INSERT INTO CATALOGO_ITEM (codigo, descripcion, tipo_item, unidad_medida, familia, activo)
    VALUES (@codigo, @descripcion, @tipo_item, @unidad_medida, @familia, 1)
  `).run({
    codigo: finalCode,
    descripcion,
    tipo_item,
    unidad_medida,
    familia: familia || null
  });
  return result.lastInsertRowid;
}

module.exports = {
  createCatalogItem,
  slug,
  validTypes
};
