const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'trazabilidad.sqlite');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const db = require('./database');

const today = new Date().toISOString().slice(0, 10);
const future = '2027-12-31';

function insert(table, data) {
  const keys = Object.keys(data);
  const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => `@${k}`).join(',')})`);
  return stmt.run(data).lastInsertRowid;
}

function lote(prefix, seq = '001') {
  return `${prefix}-${today.replace(/-/g, '')}-${seq}`;
}

const seed = db.transaction(() => {
  db.exec(`
    DELETE FROM CONTROL_CALIDAD;
    DELETE FROM CONSUMO_LOTE;
    DELETE FROM REGISTRO_FASE;
    DELETE FROM LOTE_PRODUCCION;
    DELETE FROM ORDEN_PRODUCCION;
    DELETE FROM DETALLE_RECETA;
    DELETE FROM RECETA;
    DELETE FROM LOTE_MATERIA_PRIMA;
    DELETE FROM EQUIPO;
    DELETE FROM OPERARIO;
    DELETE FROM FASE_PRODUCCION;
    DELETE FROM TIPO_PREPARACION;
    DELETE FROM PRODUCTO;
    DELETE FROM MATERIA_PRIMA;
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
    ['Mantequilla', 'kg', 'MP-MANT-001', 25],
    ['Harina', 'kg', 'MP-HAR-001', 50],
    ['Agua', 'L', 'MP-AGUA-001', 100],
    ['Sal', 'kg', 'MP-SAL-001', 10],
    ['Azucar', 'kg', 'MP-AZU-001', 15]
  ].forEach(([nombre, unidad, loteInterno, peso]) => {
    const id = insert('MATERIA_PRIMA', { nombre, descripcion: nombre, unidad_medida: unidad, temperatura_objetivo: null, estado: 'ACTIVA' });
    const loteId = insert('LOTE_MATERIA_PRIMA', {
      id_materia_prima: id,
      id_proveedor: proveedor,
      lote_proveedor: `PROV-${loteInterno}`,
      lote_interno: loteInterno,
      fecha_recepcion: today,
      fecha_vencimiento: future,
      peso_recibido: peso,
      peso_disponible: peso,
      temperatura_recepcion: 6,
      estado: 'DISPONIBLE',
      observaciones: 'Seed inicial'
    });
    mp[nombre] = { id, loteId };
  });

  const producto = insert('PRODUCTO', {
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
    tipos[nombre] = {
      id: insert('TIPO_PREPARACION', { nombre, categoria: prefijo, descripcion: nombre, requiere_receta: 0, estado: 'ACTIVO' }),
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
    { tipo: 'MP', id: mp.Agua.loteId, cantidad: 5, unidad: 'L' },
    { tipo: 'MP', id: mp.Sal.loteId, cantidad: 0.2 },
    { tipo: 'MP', id: mp.Azucar.loteId, cantidad: 1 }
  ], obs: 'Masa tipo B demo' });
  const masaEmp = crearLote({ prefijo: 'MASA-EMP', tipoNombre: 'Masa empastada', fase: 'Empaste', cantidad: 20, origenes: [{ tipo: 'PROD', id: masaB, cantidad: 15 }, { tipo: 'PROD', id: empMant, cantidad: 5 }], obs: 'Empaste demo' });
  const lam = crearLote({ prefijo: 'LAM-HOJ', tipoNombre: 'Masa laminada', fase: 'Laminado', cantidad: 20, origenes: [{ tipo: 'PROD', id: masaEmp, cantidad: 20 }], obs: 'Laminado demo' });
  const rep = crearLote({ prefijo: 'REP-HOJ', tipoNombre: 'Masa reposada', fase: 'Reposo', cantidad: 20, origenes: [{ tipo: 'PROD', id: lam, cantidad: 20 }], obs: 'Reposo demo' });
  const form = crearLote({ prefijo: 'FORM-CROI', tipoNombre: 'Croissant formado', fase: 'Formado', cantidad: 20, origenes: [{ tipo: 'PROD', id: rep, cantidad: 20 }], obs: 'Formado demo' });
  const cong = crearLote({ prefijo: 'CONG-CROI', tipoNombre: 'Croissant congelado', fase: 'Congelado', cantidad: 20, origenes: [{ tipo: 'PROD', id: form, cantidad: 20 }], obs: 'Congelado demo' });
  crearLote({ prefijo: 'PT-CROI', tipoNombre: 'Producto terminado', fase: 'Empaque', cantidad: 20, origenes: [{ tipo: 'PROD', id: cong, cantidad: 20 }], obs: 'Producto terminado demo' });
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
