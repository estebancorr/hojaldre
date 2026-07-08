CREATE TABLE IF NOT EXISTS PROVEEDOR (
  id_proveedor BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE IF NOT EXISTS UBICACION (
  id_ubicacion BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'GENERAL',
  descripcion TEXT,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS CATALOGO_ITEM (
  id_item BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  tipo_item TEXT NOT NULL CHECK (tipo_item IN ('MP','SEMIELABORADO','PRODUCTO_TERMINADO','EMPAQUE','RELLENO','OTRO')),
  unidad_medida TEXT NOT NULL,
  familia TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS MATERIA_PRIMA (
  id_materia_prima BIGSERIAL PRIMARY KEY,
  id_item BIGINT UNIQUE REFERENCES CATALOGO_ITEM(id_item),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  unidad_medida TEXT NOT NULL,
  temperatura_objetivo DOUBLE PRECISION,
  estado TEXT NOT NULL DEFAULT 'ACTIVA'
);

CREATE TABLE IF NOT EXISTS LOTE_MATERIA_PRIMA (
  id_lote_mp BIGSERIAL PRIMARY KEY,
  id_materia_prima BIGINT NOT NULL REFERENCES MATERIA_PRIMA(id_materia_prima),
  id_proveedor BIGINT NOT NULL REFERENCES PROVEEDOR(id_proveedor),
  lote_proveedor TEXT NOT NULL,
  lote_interno TEXT UNIQUE,
  fecha_recepcion TEXT NOT NULL,
  fecha_vencimiento TEXT,
  peso_recibido DOUBLE PRECISION NOT NULL,
  peso_disponible DOUBLE PRECISION NOT NULL,
  temperatura_recepcion DOUBLE PRECISION,
  id_ubicacion BIGINT REFERENCES UBICACION(id_ubicacion),
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS PRODUCTO (
  id_producto BIGSERIAL PRIMARY KEY,
  id_item BIGINT UNIQUE REFERENCES CATALOGO_ITEM(id_item),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  peso_objetivo_unidad DOUBLE PRECISION,
  estado TEXT NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE IF NOT EXISTS TIPO_PREPARACION (
  id_tipo_preparacion BIGSERIAL PRIMARY KEY,
  id_item BIGINT UNIQUE REFERENCES CATALOGO_ITEM(id_item),
  nombre TEXT NOT NULL,
  categoria TEXT,
  descripcion TEXT,
  requiere_receta INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ACTIVO'
);

CREATE TABLE IF NOT EXISTS RECETA (
  id_receta BIGSERIAL PRIMARY KEY,
  id_producto BIGINT REFERENCES PRODUCTO(id_producto),
  id_tipo_preparacion BIGINT REFERENCES TIPO_PREPARACION(id_tipo_preparacion),
  nombre_receta TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  rendimiento_estimado DOUBLE PRECISION,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS DETALLE_RECETA (
  id_detalle_receta BIGSERIAL PRIMARY KEY,
  id_receta BIGINT NOT NULL REFERENCES RECETA(id_receta),
  id_item BIGINT REFERENCES CATALOGO_ITEM(id_item),
  tipo_insumo TEXT NOT NULL CHECK (tipo_insumo IN ('MP','PREPARACION')),
  id_materia_prima BIGINT REFERENCES MATERIA_PRIMA(id_materia_prima),
  id_tipo_preparacion BIGINT REFERENCES TIPO_PREPARACION(id_tipo_preparacion),
  cantidad_estandar DOUBLE PRECISION NOT NULL,
  unidad_medida TEXT NOT NULL,
  tolerancia DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS EXPLOSION_MATERIALES (
  id_explosion BIGSERIAL PRIMARY KEY,
  id_receta BIGINT NOT NULL REFERENCES RECETA(id_receta),
  id_item BIGINT NOT NULL REFERENCES CATALOGO_ITEM(id_item),
  id_detalle_receta BIGINT REFERENCES DETALLE_RECETA(id_detalle_receta),
  cantidad_requerida DOUBLE PRECISION NOT NULL,
  unidad_medida TEXT NOT NULL,
  nivel INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ORDEN_PRODUCCION (
  id_orden BIGSERIAL PRIMARY KEY,
  id_producto BIGINT NOT NULL REFERENCES PRODUCTO(id_producto),
  id_receta BIGINT REFERENCES RECETA(id_receta),
  codigo_orden TEXT NOT NULL UNIQUE,
  fecha_programada TEXT NOT NULL,
  cantidad_objetivo DOUBLE PRECISION NOT NULL,
  unidad_medida TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  responsable TEXT,
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS FASE_PRODUCCION (
  id_fase BIGSERIAL PRIMARY KEY,
  nombre_fase TEXT NOT NULL,
  orden_fase INTEGER NOT NULL,
  descripcion TEXT,
  requiere_control_temperatura INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS LOTE_PRODUCCION (
  id_lote_prod BIGSERIAL PRIMARY KEY,
  id_orden BIGINT NOT NULL REFERENCES ORDEN_PRODUCCION(id_orden),
  id_producto BIGINT REFERENCES PRODUCTO(id_producto),
  id_tipo_preparacion BIGINT REFERENCES TIPO_PREPARACION(id_tipo_preparacion),
  id_receta BIGINT REFERENCES RECETA(id_receta),
  id_fase_actual BIGINT REFERENCES FASE_PRODUCCION(id_fase),
  codigo_lote TEXT NOT NULL UNIQUE,
  tipo_lote TEXT NOT NULL CHECK (tipo_lote IN ('SEMIELABORADO','PRODUCTO_TERMINADO')),
  fecha_creacion TEXT NOT NULL,
  cantidad_actual DOUBLE PRECISION NOT NULL,
  unidad_medida TEXT NOT NULL,
  id_ubicacion BIGINT REFERENCES UBICACION(id_ubicacion),
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS OPERARIO (
  id_operario BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  cargo TEXT,
  turno TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS EQUIPO (
  id_equipo BIGSERIAL PRIMARY KEY,
  nombre_equipo TEXT NOT NULL,
  tipo_equipo TEXT,
  codigo_interno TEXT,
  ubicacion TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS REGISTRO_FASE (
  id_registro_fase BIGSERIAL PRIMARY KEY,
  id_orden BIGINT NOT NULL REFERENCES ORDEN_PRODUCCION(id_orden),
  id_fase BIGINT NOT NULL REFERENCES FASE_PRODUCCION(id_fase),
  id_lote_salida BIGINT NOT NULL REFERENCES LOTE_PRODUCCION(id_lote_prod),
  id_operario BIGINT REFERENCES OPERARIO(id_operario),
  id_equipo BIGINT REFERENCES EQUIPO(id_equipo),
  fecha TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  temperatura_inicial DOUBLE PRECISION,
  temperatura_final DOUBLE PRECISION,
  temperatura_masa DOUBLE PRECISION,
  peso_entrada_total DOUBLE PRECISION NOT NULL,
  peso_salida DOUBLE PRECISION NOT NULL,
  peso_por_porcion DOUBLE PRECISION,
  duracion_amasado_seg INTEGER,
  merma DOUBLE PRECISION NOT NULL,
  estado TEXT NOT NULL DEFAULT 'COMPLETADA',
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS CONSUMO_LOTE (
  id_consumo BIGSERIAL PRIMARY KEY,
  id_registro_fase BIGINT NOT NULL REFERENCES REGISTRO_FASE(id_registro_fase),
  tipo_lote_origen TEXT NOT NULL CHECK (tipo_lote_origen IN ('MP','PROD')),
  id_lote_mp_origen BIGINT REFERENCES LOTE_MATERIA_PRIMA(id_lote_mp),
  id_lote_prod_origen BIGINT REFERENCES LOTE_PRODUCCION(id_lote_prod),
  id_lote_prod_destino BIGINT NOT NULL REFERENCES LOTE_PRODUCCION(id_lote_prod),
  cantidad_consumida DOUBLE PRECISION NOT NULL,
  unidad_medida TEXT NOT NULL,
  temperatura_uso DOUBLE PRECISION,
  fecha_consumo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS CONTROL_CALIDAD (
  id_control BIGSERIAL PRIMARY KEY,
  id_registro_fase BIGINT NOT NULL REFERENCES REGISTRO_FASE(id_registro_fase),
  id_lote_prod BIGINT NOT NULL REFERENCES LOTE_PRODUCCION(id_lote_prod),
  fecha TEXT NOT NULL,
  parametro TEXT NOT NULL,
  valor TEXT NOT NULL,
  resultado TEXT NOT NULL,
  observaciones TEXT
);

CREATE INDEX IF NOT EXISTS idx_lote_produccion_codigo ON LOTE_PRODUCCION(codigo_lote);
CREATE INDEX IF NOT EXISTS idx_lote_mp_proveedor ON LOTE_MATERIA_PRIMA(lote_proveedor);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_codigo ON CATALOGO_ITEM(codigo);
CREATE INDEX IF NOT EXISTS idx_catalogo_item_tipo ON CATALOGO_ITEM(tipo_item);
CREATE INDEX IF NOT EXISTS idx_explosion_materiales_item ON EXPLOSION_MATERIALES(id_item);
CREATE INDEX IF NOT EXISTS idx_detalle_receta_item ON DETALLE_RECETA(id_item);
CREATE INDEX IF NOT EXISTS idx_consumo_destino ON CONSUMO_LOTE(id_lote_prod_destino);
CREATE INDEX IF NOT EXISTS idx_consumo_mp_origen ON CONSUMO_LOTE(id_lote_mp_origen);
CREATE INDEX IF NOT EXISTS idx_consumo_prod_origen ON CONSUMO_LOTE(id_lote_prod_origen);

ALTER TABLE lote_materia_prima ADD COLUMN IF NOT EXISTS id_ubicacion BIGINT REFERENCES ubicacion(id_ubicacion);
ALTER TABLE lote_produccion ADD COLUMN IF NOT EXISTS id_ubicacion BIGINT REFERENCES ubicacion(id_ubicacion);
ALTER TABLE consumo_lote ADD COLUMN IF NOT EXISTS temperatura_uso DOUBLE PRECISION;
