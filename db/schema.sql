PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS PROVEEDOR (
  id_proveedor INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE IF NOT EXISTS UBICACION (
  id_ubicacion INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'GENERAL',
  descripcion TEXT,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS CATALOGO_ITEM (
  id_item INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  tipo_item TEXT NOT NULL CHECK (tipo_item IN ('MP','SEMIELABORADO','PRODUCTO_TERMINADO','EMPAQUE','RELLENO','OTRO')),
  unidad_medida TEXT NOT NULL,
  familia TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS MATERIA_PRIMA (
  id_materia_prima INTEGER PRIMARY KEY AUTOINCREMENT,
  id_item INTEGER UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  unidad_medida TEXT NOT NULL,
  temperatura_objetivo REAL,
  estado TEXT NOT NULL DEFAULT 'ACTIVA',
  FOREIGN KEY (id_item) REFERENCES CATALOGO_ITEM(id_item)
);

CREATE TABLE IF NOT EXISTS LOTE_MATERIA_PRIMA (
  id_lote_mp INTEGER PRIMARY KEY AUTOINCREMENT,
  id_materia_prima INTEGER NOT NULL,
  id_proveedor INTEGER NOT NULL,
  lote_proveedor TEXT NOT NULL,
  lote_interno TEXT UNIQUE,
  fecha_recepcion TEXT NOT NULL,
  fecha_vencimiento TEXT,
  peso_recibido REAL NOT NULL,
  peso_disponible REAL NOT NULL,
  temperatura_recepcion REAL,
  id_ubicacion INTEGER,
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  observaciones TEXT,
  FOREIGN KEY (id_materia_prima) REFERENCES MATERIA_PRIMA(id_materia_prima),
  FOREIGN KEY (id_proveedor) REFERENCES PROVEEDOR(id_proveedor),
  FOREIGN KEY (id_ubicacion) REFERENCES UBICACION(id_ubicacion)
);

CREATE TABLE IF NOT EXISTS PRODUCTO (
  id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
  id_item INTEGER UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  peso_objetivo_unidad REAL,
  estado TEXT NOT NULL DEFAULT 'ACTIVO',
  FOREIGN KEY (id_item) REFERENCES CATALOGO_ITEM(id_item)
);

CREATE TABLE IF NOT EXISTS TIPO_PREPARACION (
  id_tipo_preparacion INTEGER PRIMARY KEY AUTOINCREMENT,
  id_item INTEGER UNIQUE,
  nombre TEXT NOT NULL,
  categoria TEXT,
  descripcion TEXT,
  requiere_receta INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ACTIVO',
  FOREIGN KEY (id_item) REFERENCES CATALOGO_ITEM(id_item)
);

CREATE TABLE IF NOT EXISTS RECETA (
  id_receta INTEGER PRIMARY KEY AUTOINCREMENT,
  id_producto INTEGER,
  id_tipo_preparacion INTEGER,
  nombre_receta TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  rendimiento_estimado REAL,
  activa INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
  FOREIGN KEY (id_tipo_preparacion) REFERENCES TIPO_PREPARACION(id_tipo_preparacion)
);

CREATE TABLE IF NOT EXISTS DETALLE_RECETA (
  id_detalle_receta INTEGER PRIMARY KEY AUTOINCREMENT,
  id_receta INTEGER NOT NULL,
  id_item INTEGER,
  tipo_insumo TEXT NOT NULL CHECK (tipo_insumo IN ('MP','PREPARACION')),
  id_materia_prima INTEGER,
  id_tipo_preparacion INTEGER,
  cantidad_estandar REAL NOT NULL,
  unidad_medida TEXT NOT NULL,
  tolerancia REAL DEFAULT 0,
  FOREIGN KEY (id_receta) REFERENCES RECETA(id_receta),
  FOREIGN KEY (id_item) REFERENCES CATALOGO_ITEM(id_item),
  FOREIGN KEY (id_materia_prima) REFERENCES MATERIA_PRIMA(id_materia_prima),
  FOREIGN KEY (id_tipo_preparacion) REFERENCES TIPO_PREPARACION(id_tipo_preparacion)
);

CREATE TABLE IF NOT EXISTS EXPLOSION_MATERIALES (
  id_explosion INTEGER PRIMARY KEY AUTOINCREMENT,
  id_receta INTEGER NOT NULL,
  id_item INTEGER NOT NULL,
  id_detalle_receta INTEGER,
  cantidad_requerida REAL NOT NULL,
  unidad_medida TEXT NOT NULL,
  nivel INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (id_receta) REFERENCES RECETA(id_receta),
  FOREIGN KEY (id_item) REFERENCES CATALOGO_ITEM(id_item),
  FOREIGN KEY (id_detalle_receta) REFERENCES DETALLE_RECETA(id_detalle_receta)
);

CREATE TABLE IF NOT EXISTS ORDEN_PRODUCCION (
  id_orden INTEGER PRIMARY KEY AUTOINCREMENT,
  id_producto INTEGER NOT NULL,
  id_receta INTEGER,
  codigo_orden TEXT NOT NULL UNIQUE,
  fecha_programada TEXT NOT NULL,
  cantidad_objetivo REAL NOT NULL,
  unidad_medida TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  responsable TEXT,
  observaciones TEXT,
  FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
  FOREIGN KEY (id_receta) REFERENCES RECETA(id_receta)
);

CREATE TABLE IF NOT EXISTS FASE_PRODUCCION (
  id_fase INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_fase TEXT NOT NULL,
  orden_fase INTEGER NOT NULL,
  descripcion TEXT,
  requiere_control_temperatura INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS LOTE_PRODUCCION (
  id_lote_prod INTEGER PRIMARY KEY AUTOINCREMENT,
  id_orden INTEGER NOT NULL,
  id_producto INTEGER,
  id_tipo_preparacion INTEGER,
  id_receta INTEGER,
  id_fase_actual INTEGER,
  codigo_lote TEXT NOT NULL UNIQUE,
  tipo_lote TEXT NOT NULL CHECK (tipo_lote IN ('SEMIELABORADO','PRODUCTO_TERMINADO')),
  fecha_creacion TEXT NOT NULL,
  cantidad_actual REAL NOT NULL,
  unidad_medida TEXT NOT NULL,
  id_ubicacion INTEGER,
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  observaciones TEXT,
  FOREIGN KEY (id_orden) REFERENCES ORDEN_PRODUCCION(id_orden),
  FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
  FOREIGN KEY (id_tipo_preparacion) REFERENCES TIPO_PREPARACION(id_tipo_preparacion),
  FOREIGN KEY (id_receta) REFERENCES RECETA(id_receta),
  FOREIGN KEY (id_fase_actual) REFERENCES FASE_PRODUCCION(id_fase),
  FOREIGN KEY (id_ubicacion) REFERENCES UBICACION(id_ubicacion)
);

CREATE TABLE IF NOT EXISTS OPERARIO (
  id_operario INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cargo TEXT,
  turno TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS EQUIPO (
  id_equipo INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_equipo TEXT NOT NULL,
  tipo_equipo TEXT,
  codigo_interno TEXT,
  ubicacion TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS REGISTRO_FASE (
  id_registro_fase INTEGER PRIMARY KEY AUTOINCREMENT,
  id_orden INTEGER NOT NULL,
  id_fase INTEGER NOT NULL,
  id_lote_salida INTEGER NOT NULL,
  id_operario INTEGER,
  id_equipo INTEGER,
  fecha TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  temperatura_inicial REAL,
  temperatura_final REAL,
  temperatura_masa REAL,
  peso_entrada_total REAL NOT NULL,
  peso_salida REAL NOT NULL,
  peso_por_porcion REAL,
  duracion_amasado_seg INTEGER,
  merma REAL NOT NULL,
  estado TEXT NOT NULL DEFAULT 'COMPLETADA',
  observaciones TEXT,
  FOREIGN KEY (id_orden) REFERENCES ORDEN_PRODUCCION(id_orden),
  FOREIGN KEY (id_fase) REFERENCES FASE_PRODUCCION(id_fase),
  FOREIGN KEY (id_lote_salida) REFERENCES LOTE_PRODUCCION(id_lote_prod),
  FOREIGN KEY (id_operario) REFERENCES OPERARIO(id_operario),
  FOREIGN KEY (id_equipo) REFERENCES EQUIPO(id_equipo)
);

CREATE TABLE IF NOT EXISTS CONSUMO_LOTE (
  id_consumo INTEGER PRIMARY KEY AUTOINCREMENT,
  id_registro_fase INTEGER NOT NULL,
  tipo_lote_origen TEXT NOT NULL CHECK (tipo_lote_origen IN ('MP','PROD')),
  id_lote_mp_origen INTEGER,
  id_lote_prod_origen INTEGER,
  id_lote_prod_destino INTEGER NOT NULL,
  cantidad_consumida REAL NOT NULL,
  unidad_medida TEXT NOT NULL,
  temperatura_uso REAL,
  fecha_consumo TEXT NOT NULL,
  FOREIGN KEY (id_registro_fase) REFERENCES REGISTRO_FASE(id_registro_fase),
  FOREIGN KEY (id_lote_mp_origen) REFERENCES LOTE_MATERIA_PRIMA(id_lote_mp),
  FOREIGN KEY (id_lote_prod_origen) REFERENCES LOTE_PRODUCCION(id_lote_prod),
  FOREIGN KEY (id_lote_prod_destino) REFERENCES LOTE_PRODUCCION(id_lote_prod)
);

CREATE TABLE IF NOT EXISTS MOVIMIENTO_UBICACION (
  id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_lote TEXT NOT NULL CHECK (tipo_lote IN ('MP','PROD')),
  id_lote_mp INTEGER,
  id_lote_prod INTEGER,
  id_ubicacion_origen INTEGER,
  id_ubicacion_destino INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT,
  temperatura REAL,
  responsable TEXT,
  observaciones TEXT,
  FOREIGN KEY (id_lote_mp) REFERENCES LOTE_MATERIA_PRIMA(id_lote_mp),
  FOREIGN KEY (id_lote_prod) REFERENCES LOTE_PRODUCCION(id_lote_prod),
  FOREIGN KEY (id_ubicacion_origen) REFERENCES UBICACION(id_ubicacion),
  FOREIGN KEY (id_ubicacion_destino) REFERENCES UBICACION(id_ubicacion)
);

CREATE TABLE IF NOT EXISTS CONTROL_CALIDAD (
  id_control INTEGER PRIMARY KEY AUTOINCREMENT,
  id_registro_fase INTEGER NOT NULL,
  id_lote_prod INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  parametro TEXT NOT NULL,
  valor TEXT NOT NULL,
  resultado TEXT NOT NULL,
  observaciones TEXT,
  FOREIGN KEY (id_registro_fase) REFERENCES REGISTRO_FASE(id_registro_fase),
  FOREIGN KEY (id_lote_prod) REFERENCES LOTE_PRODUCCION(id_lote_prod)
);

CREATE INDEX IF NOT EXISTS idx_lote_produccion_codigo ON LOTE_PRODUCCION(codigo_lote);
CREATE INDEX IF NOT EXISTS idx_lote_mp_proveedor ON LOTE_MATERIA_PRIMA(lote_proveedor);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_codigo ON CATALOGO_ITEM(codigo);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_tipo ON CATALOGO_ITEM(tipo_item);
CREATE INDEX IF NOT EXISTS idx_explosion_materiales_item ON EXPLOSION_MATERIALES(id_item);
CREATE INDEX IF NOT EXISTS idx_consumo_destino ON CONSUMO_LOTE(id_lote_prod_destino);
CREATE INDEX IF NOT EXISTS idx_consumo_mp_origen ON CONSUMO_LOTE(id_lote_mp_origen);
CREATE INDEX IF NOT EXISTS idx_consumo_prod_origen ON CONSUMO_LOTE(id_lote_prod_origen);
CREATE INDEX IF NOT EXISTS idx_movimiento_prod ON MOVIMIENTO_UBICACION(id_lote_prod);
CREATE INDEX IF NOT EXISTS idx_movimiento_mp ON MOVIMIENTO_UBICACION(id_lote_mp);
