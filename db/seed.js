const fs = require('fs');
const path = require('path');

const dbFile = process.env.TRACE_DB_PATH
  ? path.resolve(process.env.TRACE_DB_PATH)
  : path.join(__dirname, 'trazabilidad.sqlite');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const db = require('./database');

const today = new Date().toISOString().slice(0, 10);
const future = '2027-12-31';

function insert(table, data) {
  const keys = Object.keys(data);
  const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => `@${k}`).join(',')})`);
  return stmt.run(data).lastInsertRowid;
}

function get(table, column, value) {
  return db.prepare(`SELECT * FROM ${table} WHERE ${column} = ?`).get(value);
}

function lote(prefix, seq = '001') {
  return `${prefix}-${today.replace(/-/g, '')}-${seq}`;
}

function codigo(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function ensureCatalogItem(code, desc, options = {}) {
  const existing = get('CATALOGO_ITEM', 'codigo', code);
  if (existing) return existing.id_item;
  return insert('CATALOGO_ITEM', {
    codigo: code,
    descripcion: desc,
    tipo_item: options.tipo_item || tipoItemPorCodigo(code),
    unidad_medida: options.unidad_medida || unidadPorDescripcion(desc, 'UND'),
    familia: options.familia || 'HOJALDRE',
    activo: 1
  });
}

function ensureProductFromCatalog(code, desc, unidad = 'UND', familia = 'HOJALDRE') {
  const idItem = ensureCatalogItem(code, desc, { tipo_item: 'PRODUCTO_TERMINADO', unidad_medida: unidad, familia });
  const existing = db.prepare('SELECT id_producto FROM PRODUCTO WHERE id_item = ?').get(idItem);
  if (existing) return existing.id_producto;
  return insert('PRODUCTO', {
    id_item: idItem,
    nombre: desc,
    descripcion: desc,
    categoria: familia,
    peso_objetivo_unidad: null,
    estado: 'ACTIVO'
  });
}

function ensureTipoPreparacionFromCatalog(code, desc) {
  const tipo = tipoItemPorCodigo(code);
  if (tipo === 'MP' || tipo === 'EMPAQUE' || tipo === 'OTRO') return null;
  const idItem = ensureCatalogItem(code, desc, { tipo_item: tipo, unidad_medida: unidadPorDescripcion(desc, 'kg'), familia: tipo === 'RELLENO' ? 'RELLENO' : 'HOJALDRE' });
  const existing = db.prepare('SELECT id_tipo_preparacion FROM TIPO_PREPARACION WHERE id_item = ?').get(idItem);
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

function ensureMateriaPrimaFromCatalog(code, desc) {
  const idItem = ensureCatalogItem(code, desc, { tipo_item: tipoItemPorCodigo(code), unidad_medida: unidadPorDescripcion(desc, 'kg'), familia: 'INSUMO' });
  const existing = db.prepare('SELECT id_materia_prima FROM MATERIA_PRIMA WHERE id_item = ?').get(idItem);
  if (existing) return existing.id_materia_prima;
  return insert('MATERIA_PRIMA', {
    id_item: idItem,
    nombre: desc,
    descripcion: desc,
    unidad_medida: unidadPorDescripcion(desc, 'kg'),
    temperatura_objetivo: null,
    estado: 'ACTIVA'
  });
}

function ensureRecipeForCode(code, desc) {
  const item = get('CATALOGO_ITEM', 'codigo', code);
  if (item?.tipo_item === 'PRODUCTO_TERMINADO') {
    const productId = ensureProductFromCatalog(code, desc, unidadPorDescripcion(desc, 'UND'), 'HOJALDRE');
    const existing = db.prepare('SELECT id_receta FROM RECETA WHERE id_producto = ? AND nombre_receta = ?').get(productId, `${code} v1`);
    if (existing) return existing.id_receta;
    return insert('RECETA', {
      id_producto: productId,
      id_tipo_preparacion: null,
      nombre_receta: `${code} v1`,
      version: '1',
      rendimiento_estimado: null,
      activa: 1
    });
  }

  const tipoId = ensureTipoPreparacionFromCatalog(code, desc);
  const existing = db.prepare('SELECT id_receta FROM RECETA WHERE id_tipo_preparacion = ? AND nombre_receta = ?').get(tipoId, `${code} v1`);
  if (existing) return existing.id_receta;
  return insert('RECETA', {
    id_producto: null,
    id_tipo_preparacion: tipoId,
    nombre_receta: `${code} v1`,
    version: '1',
    rendimiento_estimado: null,
    activa: 1
  });
}

function linkRecipe(parentCode, parentDesc, childCode, childDesc) {
  ensureCatalogItem(parentCode, parentDesc, { tipo_item: tipoItemPorCodigo(parentCode), unidad_medida: unidadPorDescripcion(parentDesc, 'UND'), familia: 'HOJALDRE' });
  const childType = tipoItemPorCodigo(childCode);
  const childItemId = ensureCatalogItem(childCode, childDesc, {
    tipo_item: childType,
    unidad_medida: unidadPorDescripcion(childDesc, childType === 'EMPAQUE' ? 'UND' : 'kg'),
    familia: childType === 'RELLENO' ? 'RELLENO' : childType === 'EMPAQUE' ? 'EMPAQUE' : 'HOJALDRE'
  });
  if (childType === 'MP') ensureMateriaPrimaFromCatalog(childCode, childDesc);
  if (['SEMIELABORADO', 'RELLENO'].includes(childType)) ensureTipoPreparacionFromCatalog(childCode, childDesc);
  const recetaId = ensureRecipeForCode(parentCode, parentDesc);
  const exists = db.prepare('SELECT id_detalle_receta FROM DETALLE_RECETA WHERE id_receta = ? AND id_item = ?').get(recetaId, childItemId);
  if (exists) return;
  const detalleId = insert('DETALLE_RECETA', {
    id_receta: recetaId,
    id_item: childItemId,
    tipo_insumo: ['SEMIELABORADO', 'RELLENO', 'PRODUCTO_TERMINADO'].includes(childType) ? 'PREPARACION' : 'MP',
    id_materia_prima: null,
    id_tipo_preparacion: null,
    cantidad_estandar: 1,
    unidad_medida: unidadPorDescripcion(childDesc, 'UND'),
    tolerancia: 0
  });
  insert('EXPLOSION_MATERIALES', {
    id_receta: recetaId,
    id_item: childItemId,
    id_detalle_receta: detalleId,
    cantidad_requerida: 1,
    unidad_medida: unidadPorDescripcion(childDesc, 'UND'),
    nivel: 1,
    activo: 1
  });
}

const seed = db.transaction(() => {
  db.exec(`
    DELETE FROM CONTROL_CALIDAD;
    DELETE FROM CONSUMO_LOTE;
    DELETE FROM REGISTRO_FASE;
    DELETE FROM LOTE_PRODUCCION;
    DELETE FROM ORDEN_PRODUCCION;
    DELETE FROM EXPLOSION_MATERIALES;
    DELETE FROM DETALLE_RECETA;
    DELETE FROM RECETA;
    DELETE FROM LOTE_MATERIA_PRIMA;
    DELETE FROM EQUIPO;
    DELETE FROM OPERARIO;
    DELETE FROM FASE_PRODUCCION;
    DELETE FROM TIPO_PREPARACION;
    DELETE FROM PRODUCTO;
    DELETE FROM MATERIA_PRIMA;
    DELETE FROM CATALOGO_ITEM;
    DELETE FROM PROVEEDOR;
  `);

  const proveedor = insert('PROVEEDOR', {
    nombre: 'Proveedor Demo',
    contacto: 'Compras',
    telefono: '0000-0000',
    email: 'demo@pandetadata.local',
    direccion: 'Caracas',
    estado: 'ACTIVO'
  });

  const mp = {};
  [
    ['MDMP0029', 'MANTEQUILLA TIPO A CON SAL', 'kg', 25, 'Mantequilla'],
    ['MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL', 'kg', 50, 'Harina'],
    ['MDMP0263', 'LECHE LIQUIDA ENTERA', 'L', 30, 'Leche'],
    ['MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION', 'kg', 10, 'Sal'],
    ['MDMP0002', 'AZUCAR BLANCA REFINADA', 'kg', 15, 'Azucar'],
    ['MDMP0026', 'LEVADURA SECA INSTANTANEA MASA SALADA', 'kg', 5, 'Levadura'],
    ['MDMP0260', 'BOLSA DE HIELO GRANDE', 'kg', 20, 'Hielo'],
    ['STMP0002', 'HUEVO LIQUIDO 1 KG', 'kg', 12, 'Huevo liquido'],
    ['STMP0016', 'MANTEQUILLA PDT 1 UND', 'UND', 12, 'Mantequilla pdt'],
    ['MDMP0179', 'QUESO BLANCO DURO', 'kg', 20, 'Queso blanco duro'],
    ['MDMP0012', 'LECHE EN POLVO', 'kg', 10, 'Leche en polvo'],
    ['MDMP0153', 'COCO RALLADO', 'kg', 8, 'Coco rallado'],
    ['MDMP0037', 'MEJORADOR PURATOS', 'kg', 5, 'Mejorador'],
    ['MDMP0034', 'MARGARINA CON SAL 5 KG', 'kg', 20, 'Margarina'],
    ['MDMP0150', 'CACAO EN POLVO', 'kg', 5, 'Cacao'],
    ['MDMP0251', 'CHOCOLATE CON LECHE EN MINI BARRAS', 'kg', 8, 'Chocolate leche'],
    ['MDMP0252', 'CHOCOLATE OSCURO AL 60 % EN MINI BARRAS', 'kg', 8, 'Chocolate oscuro'],
    ['MDMP0267', 'CREMA DE PISTACHO', 'kg', 8, 'Crema pistacho']
  ].forEach(([codigoItem, nombre, unidad, peso, alias]) => {
    const idItem = ensureCatalogItem(codigoItem, nombre, {
      tipo_item: tipoItemPorCodigo(codigoItem),
      unidad_medida: unidad,
      familia: 'INSUMO'
    });
    const id = insert('MATERIA_PRIMA', { id_item: idItem, nombre, descripcion: nombre, unidad_medida: unidad, temperatura_objetivo: null, estado: 'ACTIVA' });
    const loteId = insert('LOTE_MATERIA_PRIMA', {
      id_materia_prima: id,
      id_proveedor: proveedor,
      lote_proveedor: `PROV-${codigoItem}-001`,
      lote_interno: `PROV-${codigoItem}-001`,
      fecha_recepcion: today,
      fecha_vencimiento: future,
      peso_recibido: peso,
      peso_disponible: peso,
      temperatura_recepcion: 6,
      estado: 'DISPONIBLE',
      observaciones: 'Seed inicial'
    });
    mp[alias] = { id, loteId };
  });

  const itemProducto = insert('CATALOGO_ITEM', {
    codigo: 'PT-CROISSANT-CONGELADO-SIMPLE',
    descripcion: 'Croissant congelado simple',
    tipo_item: 'PRODUCTO_TERMINADO',
    unidad_medida: 'kg',
    familia: 'Hojaldre',
    activo: 1
  });

  const producto = insert('PRODUCTO', {
    id_item: itemProducto,
    nombre: 'Croissant congelado simple',
    descripcion: 'Croissant de hojaldre congelado',
    categoria: 'Hojaldre',
    peso_objetivo_unidad: 0.09,
    estado: 'ACTIVO'
  });

  const tipos = {};
  [
    ['Mantequilla empastada', 'EMP-MANT'],
    ['Masa tipo B', 'MASA-B'],
    ['Masa empastada', 'MASA-EMP'],
    ['Masa laminada', 'LAM-HOJ'],
    ['Masa reposada', 'REP-HOJ'],
    ['Croissant formado', 'FORM-CROI'],
    ['Croissant congelado', 'CONG-CROI'],
    ['Producto terminado', 'PT-CROI']
  ].forEach(([nombre, prefijo]) => {
    const tipoItem = nombre === 'Producto terminado' ? 'PRODUCTO_TERMINADO' : 'SEMIELABORADO';
    const idItem = insert('CATALOGO_ITEM', {
      codigo: prefijo,
      descripcion: nombre,
      tipo_item: tipoItem,
      unidad_medida: 'kg',
      familia: tipoItem === 'PRODUCTO_TERMINADO' ? 'Producto terminado' : 'Semielaborado',
      activo: 1
    });
    tipos[nombre] = {
      id: insert('TIPO_PREPARACION', { id_item: idItem, nombre, categoria: prefijo, descripcion: nombre, requiere_receta: 0, estado: 'ACTIVO' }),
      prefijo
    };
  });

  const receta = insert('RECETA', {
    id_producto: producto,
    id_tipo_preparacion: tipos['Producto terminado'].id,
    nombre_receta: 'Croissant congelado simple v1',
    version: '1',
    rendimiento_estimado: 20,
    activa: 1
  });

  const orden = insert('ORDEN_PRODUCCION', {
    id_producto: producto,
    id_receta: receta,
    codigo_orden: `OP-${today.replace(/-/g, '')}-001`,
    fecha_programada: today,
    cantidad_objetivo: 20,
    unidad_medida: 'kg',
    estado: 'ABIERTA',
    responsable: 'Pan de Tata',
    observaciones: 'Orden demo con flujo completo'
  });

  const fases = {};
  [
    'Recepcion materia prima',
    'Preparacion mantequilla empastada',
    'Preparacion de masa',
    'Empaste',
    'Laminado',
    'Reposo',
    'Formado',
    'Congelado',
    'Horneado',
    'Empaque'
  ].forEach((nombre, index) => {
    fases[nombre] = insert('FASE_PRODUCCION', { nombre_fase: nombre, orden_fase: index + 1, descripcion: nombre, requiere_control_temperatura: 1, activa: 1 });
  });

  const operario = insert('OPERARIO', { nombre: 'Operario Demo', cargo: 'Panadero', turno: 'Manana', activo: 1 });
  const equipo = insert('EQUIPO', { nombre_equipo: 'Mesa de trabajo demo', tipo_equipo: 'Mesa', codigo_interno: 'EQ-001', ubicacion: 'Produccion', activo: 1 });

  function crearLote({ prefijo, tipoNombre, fase, cantidad, origenes, obs }) {
    const tipo = tipos[tipoNombre];
    const codigo = lote(prefijo);
    const loteId = insert('LOTE_PRODUCCION', {
      id_orden: orden,
      id_producto: producto,
      id_tipo_preparacion: tipo.id,
      id_receta: receta,
      id_fase_actual: fases[fase],
      codigo_lote: codigo,
      tipo_lote: tipoNombre === 'Producto terminado' ? 'PRODUCTO_TERMINADO' : 'SEMIELABORADO',
      fecha_creacion: today,
      cantidad_actual: cantidad,
      unidad_medida: 'kg',
      estado: 'DISPONIBLE',
      observaciones: obs
    });
    const regId = insert('REGISTRO_FASE', {
      id_orden: orden,
      id_fase: fases[fase],
      id_lote_salida: loteId,
      id_operario: operario,
      id_equipo: equipo,
      fecha: today,
      hora_inicio: '08:00',
      hora_fin: '08:30',
      temperatura_inicial: 6,
      temperatura_final: 8,
      peso_entrada_total: origenes.reduce((sum, o) => sum + o.cantidad, 0),
      peso_salida: cantidad,
      merma: origenes.reduce((sum, o) => sum + o.cantidad, 0) - cantidad,
      estado: 'COMPLETADA',
      observaciones: obs
    });
    origenes.forEach((o) => {
      insert('CONSUMO_LOTE', {
        id_registro_fase: regId,
        tipo_lote_origen: o.tipo,
        id_lote_mp_origen: o.tipo === 'MP' ? o.id : null,
        id_lote_prod_origen: o.tipo === 'PROD' ? o.id : null,
        id_lote_prod_destino: loteId,
        cantidad_consumida: o.cantidad,
        unidad_medida: o.unidad || 'kg',
        fecha_consumo: today
      });
      if (o.tipo === 'MP') db.prepare('UPDATE LOTE_MATERIA_PRIMA SET peso_disponible = peso_disponible - ? WHERE id_lote_mp = ?').run(o.cantidad, o.id);
      if (o.tipo === 'PROD') db.prepare('UPDATE LOTE_PRODUCCION SET cantidad_actual = cantidad_actual - ? WHERE id_lote_prod = ?').run(o.cantidad, o.id);
    });
    return loteId;
  }

  const empMant = crearLote({ prefijo: 'EMP-MANT', tipoNombre: 'Mantequilla empastada', fase: 'Preparacion mantequilla empastada', cantidad: 5, origenes: [{ tipo: 'MP', id: mp.Mantequilla.loteId, cantidad: 5 }], obs: 'Mantequilla empastada demo' });
  const masaB = crearLote({ prefijo: 'MASA-B', tipoNombre: 'Masa tipo B', fase: 'Preparacion de masa', cantidad: 15, origenes: [
    { tipo: 'MP', id: mp.Harina.loteId, cantidad: 10 },
    { tipo: 'MP', id: mp.Leche.loteId, cantidad: 5, unidad: 'L' },
    { tipo: 'MP', id: mp.Sal.loteId, cantidad: 0.2 },
    { tipo: 'MP', id: mp.Azucar.loteId, cantidad: 1 },
    { tipo: 'MP', id: mp.Levadura.loteId, cantidad: 0.2 }
  ], obs: 'Masa tipo B demo' });
  const masaEmp = crearLote({ prefijo: 'MASA-EMP', tipoNombre: 'Masa empastada', fase: 'Empaste', cantidad: 20, origenes: [{ tipo: 'PROD', id: masaB, cantidad: 15 }, { tipo: 'PROD', id: empMant, cantidad: 5 }], obs: 'Empaste demo' });
  const lam = crearLote({ prefijo: 'LAM-HOJ', tipoNombre: 'Masa laminada', fase: 'Laminado', cantidad: 20, origenes: [{ tipo: 'PROD', id: masaEmp, cantidad: 20 }], obs: 'Laminado demo' });
  const rep = crearLote({ prefijo: 'REP-HOJ', tipoNombre: 'Masa reposada', fase: 'Reposo', cantidad: 20, origenes: [{ tipo: 'PROD', id: lam, cantidad: 20 }], obs: 'Reposo demo' });
  const form = crearLote({ prefijo: 'FORM-CROI', tipoNombre: 'Croissant formado', fase: 'Formado', cantidad: 20, origenes: [{ tipo: 'PROD', id: rep, cantidad: 20 }], obs: 'Formado demo' });
  const cong = crearLote({ prefijo: 'CONG-CROI', tipoNombre: 'Croissant congelado', fase: 'Congelado', cantidad: 20, origenes: [{ tipo: 'PROD', id: form, cantidad: 20 }], obs: 'Congelado demo' });
  crearLote({ prefijo: 'PT-CROI', tipoNombre: 'Producto terminado', fase: 'Empaque', cantidad: 20, origenes: [{ tipo: 'PROD', id: cong, cantidad: 20 }], obs: 'Producto terminado demo' });

  const pdfProducts = [
    ['PTEM0104', 'CAJA DE PALMERITAS 120 GR 8 UND', 'CAJ', 'HOJALDRE'],
    ['PTEM0135', 'TEQUENOS 30 UND', 'PAQ', 'HOJALDRE'],
    ['PTEM0136', 'TEQUENOS 15 UND', 'PAQ', 'HOJALDRE'],
    ['PTSU0028', 'MINI CROISSANT SIMPLE 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0046', 'CROISSANT SIMPLE 120 GR 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0047', 'CROISSANT CHOCO-LECHE 160 GR 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0048', 'CROISSANT CHOCO-OSCURO 160 GR 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0049', 'HOJALDRE DE MANZANA 160 GR 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0077', 'MINI CROISSANT CON PISTACHO', 'UND', 'HOJALDRE'],
    ['PTSU0082', 'CRUFFIN DE PISTACHOS 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0083', 'CRUFFIN DE CAFE Y AVELLANAS 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0091', 'PASTELITO DE HOJALDRE DE POLLO 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0092', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0093', 'PASTELITO DE HOJALDRE RICOTA Y ESPINACA 1 UND', 'UND', 'HOJALDRE'],
    ['PTSU0095', 'PASTELITO DE HOJALDRE DE JAMON', 'UND', 'HOJALDRE'],
    ['STPC0013', 'CROISSANT SIMPLE 120 GR CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0014', 'CROISSANT CHOCO LECHE 160 GR CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0015', 'CROISSANT CHOCO OSCURO 160 GR CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0016', 'HOJALDRE DE MANZANA 160 GR CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0022', 'MINI CROISSANT CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0024', 'CRUFFIN CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0025', 'PASTELITO DE HOJALDRE DE RICOTA Y ESPINACA CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0026', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0027', 'PASTELITO DE HOJALDRE DE POLLO CONGELADO 1 UND ST', 'UND', 'HOJALDRE'],
    ['STPC0028', 'PASTELITO DE HOJALDRE DE JAMON CONGELADO 1 UND', 'UND', 'HOJALDRE'],
    ['STPC0029', 'TEQUENOS 1 UND', 'UND', 'HOJALDRE']
  ];

  pdfProducts.forEach(([code, desc, unidad, familia]) => {
    if (code.startsWith('PT')) ensureProductFromCatalog(code, desc, unidad, familia);
    else ensureTipoPreparacionFromCatalog(code, desc);
  });

  const pdfExplosions = [
    ['PTEM0104', 'CAJA DE PALMERITAS 120 GR 8 UND', 'STMS0009', 'ROLLO PARA FORMAR PALMERITAS 1 KG'],
    ['PTEM0104', 'CAJA DE PALMERITAS 120 GR 8 UND', 'MDME0016', 'CONTENEDOR CIERRE PLUS 12 OZ 200 UND'],
    ['PTEM0104', 'CAJA DE PALMERITAS 120 GR 8 UND', 'MDME0129', 'ETIQUETA ZEBRA 57X19 MM 2000 UND'],
    ['PTEM0104', 'CAJA DE PALMERITAS 120 GR 8 UND', 'MDME0121', 'FAJA DE CARTON PARA PALMERITAS'],
    ['PTEM0104', 'CAJA DE PALMERITAS 120 GR 8 UND', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['PTEM0135', 'TEQUENOS 30 UND', 'STPC0029', 'TEQUENOS 1 UND'],
    ['PTEM0135', 'TEQUENOS 30 UND', 'MDME0053', 'BOLSA AL VACIO TRANSPARENTE 28X70CM 1000 UND'],
    ['PTEM0135', 'TEQUENOS 30 UND', 'MDME0094', 'BANDEJA DE ANIME TIPO P'],
    ['PTEM0135', 'TEQUENOS 30 UND', 'MDME0105', 'ETIQUETA DE PRODUCTO'],
    ['PTSU0083', 'CRUFFIN DE CAFE Y AVELLANAS 1 UND', 'STPC0024', 'CRUFFIN CONGELADO 1 UND ST'],
    ['PTSU0083', 'CRUFFIN DE CAFE Y AVELLANAS 1 UND', 'STMZ0084', 'RELLENO DE CREMA DE AVELLANA Y CAFE'],
    ['PTSU0082', 'CRUFFIN DE PISTACHOS 1 UND', 'STPC0024', 'CRUFFIN CONGELADO 1 UND ST'],
    ['PTSU0082', 'CRUFFIN DE PISTACHOS 1 UND', 'STMZ0082', 'RELLENO DE CREMA DE PISTACHO'],
    ['PTSU0028', 'MINI CROISSANT SIMPLE 1 UND', 'STPC0022', 'MINI CROISSANT CONGELADO 1 UND ST'],
    ['PTSU0046', 'CROISSANT SIMPLE 120 GR 1 UND', 'STPC0013', 'CROISSANT SIMPLE 120 GR CONGELADO 1 UND ST'],
    ['PTSU0047', 'CROISSANT CHOCO-LECHE 160 GR 1 UND', 'STPC0014', 'CROISSANT CHOCO LECHE 160 GR CONGELADO 1 UND ST'],
    ['PTSU0048', 'CROISSANT CHOCO-OSCURO 160 GR 1 UND', 'STPC0015', 'CROISSANT CHOCO OSCURO 160 GR CONGELADO 1 UND ST'],
    ['PTSU0049', 'HOJALDRE DE MANZANA 160 GR 1 UND', 'STPC0016', 'HOJALDRE DE MANZANA 160 GR CONGELADO 1 UND ST'],
    ['PTSU0077', 'MINI CROISSANT CON PISTACHO', 'STPC0022', 'MINI CROISSANT CONGELADO 1 UND ST'],
    ['PTSU0077', 'MINI CROISSANT CON PISTACHO', 'MDMP0267', 'CREMA DE PISTACHO'],
    ['PTSU0091', 'PASTELITO DE HOJALDRE DE POLLO 1 UND', 'STPC0027', 'PASTELITO DE HOJALDRE DE POLLO CONGELADO 1 UND ST'],
    ['PTSU0092', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA 1 UND', 'STPC0026', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA CONGELADO 1 UND ST'],
    ['PTSU0093', 'PASTELITO DE HOJALDRE RICOTA Y ESPINACA 1 UND', 'STPC0025', 'PASTELITO DE HOJALDRE DE RICOTA Y ESPINACA CONGELADO 1 UND ST'],
    ['PTSU0095', 'PASTELITO DE HOJALDRE DE JAMON', 'STPC0028', 'PASTELITO DE HOJALDRE DE JAMON CONGELADO 1 UND'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'GSGE0006', 'GASTOS DE AGUA'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0025', 'LEVADURA SECA INSTANTANEA MASA DULCE'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'STMP0016', 'MANTEQUILLA PDT 1 UND'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0153', 'COCO RALLADO'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'STMP0002', 'HUEVO LIQUIDO 1 KG'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0012', 'LECHE EN POLVO'],
    ['STMS0031', 'MASA PAN DE DIOS 1 KG', 'MDMP0037', 'MEJORADOR PURATOS'],
    ['STMS0014', 'MASA PARA PALMERITA CONGELADA 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0014', 'MASA PARA PALMERITA CONGELADA 1 KG', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0014', 'MASA PARA PALMERITA CONGELADA 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0014', 'MASA PARA PALMERITA CONGELADA 1 KG', 'MDMP0029', 'MANTEQUILLA TIPO A CON SAL'],
    ['STMS0014', 'MASA PARA PALMERITA CONGELADA 1 KG', 'GSGE0006', 'GASTOS DE AGUA'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'STMP0016', 'MANTEQUILLA PDT 1 UND'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'MDMP0260', 'BOLSA DE HIELO GRANDE'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'GSGE0006', 'GASTOS DE AGUA'],
    ['STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG', 'MDMP0029', 'MANTEQUILLA TIPO A CON SAL'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0263', 'LECHE LIQUIDA ENTERA'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0029', 'MANTEQUILLA TIPO A CON SAL'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0026', 'LEVADURA SECA INSTANTANEA MASA SALADA'],
    ['STMS0013', 'MASA PARA CROISSANT TIPO A', 'MDMP0260', 'BOLSA DE HIELO GRANDE'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'MDMP0263', 'LECHE LIQUIDA ENTERA'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'STMP0016', 'MANTEQUILLA PDT 1 UND'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'MDMP0026', 'LEVADURA SECA INSTANTANEA MASA SALADA'],
    ['STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG', 'MDMP0260', 'BOLSA DE HIELO GRANDE'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0263', 'LECHE LIQUIDA ENTERA'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0034', 'MARGARINA CON SAL 5 KG'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0026', 'LEVADURA SECA INSTANTANEA MASA SALADA'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0260', 'BOLSA DE HIELO GRANDE'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'MDMP0150', 'CACAO EN POLVO'],
    ['STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG', 'GSGE0006', 'GASTOS DE AGUA'],
    ['STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG', 'GSGE0006', 'GASTOS DE AGUA'],
    ['STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG', 'MDMP0260', 'BOLSA DE HIELO GRANDE'],
    ['STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG', 'MDMP0003', 'SAL INDUSTRIAL PARA PRODUCCION'],
    ['STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG', 'STMP0016', 'MANTEQUILLA PDT 1 UND'],
    ['STMS0009', 'ROLLO PARA FORMAR PALMERITAS 1 KG', 'STMS0014', 'MASA PARA PALMERITA CONGELADA 1 KG'],
    ['STMS0009', 'ROLLO PARA FORMAR PALMERITAS 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0012', 'MASA COMPUESTA PARA PANETTONE 1 KG', 'MDMP0214', 'HARINA DE TRIGO EXTRA ESPECIAL'],
    ['STMS0012', 'MASA COMPUESTA PARA PANETTONE 1 KG', 'STMP0016', 'MANTEQUILLA PDT 1 UND'],
    ['STMS0012', 'MASA COMPUESTA PARA PANETTONE 1 KG', 'STMP0002', 'HUEVO LIQUIDO 1 KG'],
    ['STMS0012', 'MASA COMPUESTA PARA PANETTONE 1 KG', 'MDMP0002', 'AZUCAR BLANCA REFINADA'],
    ['STMS0012', 'MASA COMPUESTA PARA PANETTONE 1 KG', 'STMS0027', 'PREFERMENTO PANETTONE 1 KG'],
    ['STPC0029', 'TEQUENOS 1 UND', 'STMS0008', 'MASA PARA TEQUENOS DE HOJALDRE 1 KG'],
    ['STPC0029', 'TEQUENOS 1 UND', 'MDMP0179', 'QUESO BLANCO DURO'],
    ['STPC0024', 'CRUFFIN CONGELADO 1 UND ST', 'STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG'],
    ['STPC0024', 'CRUFFIN CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0022', 'MINI CROISSANT CONGELADO 1 UND ST', 'STMS0013', 'MASA PARA CROISSANT TIPO A'],
    ['STPC0022', 'MINI CROISSANT CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0013', 'CROISSANT SIMPLE 120 GR CONGELADO 1 UND ST', 'STMS0013', 'MASA PARA CROISSANT TIPO A'],
    ['STPC0013', 'CROISSANT SIMPLE 120 GR CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0014', 'CROISSANT CHOCO LECHE 160 GR CONGELADO 1 UND ST', 'STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG'],
    ['STPC0014', 'CROISSANT CHOCO LECHE 160 GR CONGELADO 1 UND ST', 'STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG'],
    ['STPC0014', 'CROISSANT CHOCO LECHE 160 GR CONGELADO 1 UND ST', 'MDMP0251', 'CHOCOLATE CON LECHE EN MINI BARRAS'],
    ['STPC0014', 'CROISSANT CHOCO LECHE 160 GR CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0015', 'CROISSANT CHOCO OSCURO 160 GR CONGELADO 1 UND ST', 'STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG'],
    ['STPC0015', 'CROISSANT CHOCO OSCURO 160 GR CONGELADO 1 UND ST', 'STMS0024', 'MASA PARA CROISSANT PINTADA TIPO B 1 KG'],
    ['STPC0015', 'CROISSANT CHOCO OSCURO 160 GR CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0015', 'CROISSANT CHOCO OSCURO 160 GR CONGELADO 1 UND ST', 'MDMP0252', 'CHOCOLATE OSCURO AL 60 % EN MINI BARRAS'],
    ['STPC0016', 'HOJALDRE DE MANZANA 160 GR CONGELADO 1 UND ST', 'STMS0023', 'MASA PARA CROISSANT TIPO B 1 KG'],
    ['STPC0016', 'HOJALDRE DE MANZANA 160 GR CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0016', 'HOJALDRE DE MANZANA 160 GR CONGELADO 1 UND ST', 'STMZ0031', 'RELLENO DULCE DE MANZANA KG'],
    ['STPC0027', 'PASTELITO DE HOJALDRE DE POLLO CONGELADO 1 UND ST', 'STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG'],
    ['STPC0027', 'PASTELITO DE HOJALDRE DE POLLO CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0027', 'PASTELITO DE HOJALDRE DE POLLO CONGELADO 1 UND ST', 'STMZ0090', 'RELLENO DE POLLO 1 KG'],
    ['STPC0026', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA CONGELADO 1 UND ST', 'STMZ0092', 'RELLENO DE CARNE MOLIDA 1 KG'],
    ['STPC0026', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0026', 'PASTELITO DE HOJALDRE DE CARNE MOLIDA CONGELADO 1 UND ST', 'STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG'],
    ['STPC0025', 'PASTELITO DE HOJALDRE DE RICOTA Y ESPINACA CONGELADO 1 UND ST', 'STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG'],
    ['STPC0025', 'PASTELITO DE HOJALDRE DE RICOTA Y ESPINACA CONGELADO 1 UND ST', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0025', 'PASTELITO DE HOJALDRE DE RICOTA Y ESPINACA CONGELADO 1 UND ST', 'STMZ0091', 'RELLENO DE RICOTA Y ESPINACA 1 KG'],
    ['STPC0028', 'PASTELITO DE HOJALDRE DE JAMON CONGELADO 1 UND', 'STMZ0004', 'MEZCLA DE JAMON PARA CACHITO 1 KG'],
    ['STPC0028', 'PASTELITO DE HOJALDRE DE JAMON CONGELADO 1 UND', 'STMP0037', 'EMPASTE PARA HOJALDRE 1 UND'],
    ['STPC0028', 'PASTELITO DE HOJALDRE DE JAMON CONGELADO 1 UND', 'STMS0022', 'MASA PARA PASTELITOS DE HOJALDRE 1 KG']
  ];

  pdfExplosions.forEach(([parentCode, parentDesc, childCode, childDesc]) => {
    linkRecipe(parentCode, parentDesc, childCode, childDesc);
  });
});

db.ready
  .then(() => {
    seed();
    db.ensureSystemData();
    console.log('Seed cargado correctamente.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
