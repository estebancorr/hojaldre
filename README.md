# Pan de Tata - Trazabilidad de hojaldre

Aplicacion web local para simular lotes, transformaciones y trazabilidad hacia atras del proceso de produccion de hojaldre.

La navegacion principal se divide en `Inicio`, `MP`, `Preparaciones`, `Ordenes`, `Trazabilidad` y `Control de calidad`. En `Ordenes > Registrar fase`, el sistema genera automaticamente el lote ST o PT segun la fase seleccionada. Los campos cambian por fase y el cronometro aparece unicamente durante `Preparacion de masa`.

El modulo `Preparaciones` permite consolidar lotes o generar preparaciones para stock general sin seleccionar una orden. Esos lotes conservan su trazabilidad y quedan disponibles como origen para cualquier orden posterior.

## Requisitos

- Node.js instalado.
- npm instalado.

## Instalacion

```bash
npm install
```

## Cargar datos de ejemplo

```bash
npm run seed
```

En PowerShell, si aparece una politica de ejecucion bloqueando `npm.ps1`, usar:

```bash
npm.cmd run seed
```

El seed crea proveedores, materias primas, una orden de produccion, fases, operario, equipo y un flujo completo:

`MP -> Mantequilla empastada -> Masa tipo B -> Masa empastada -> Laminado -> Reposo -> Formado -> Congelado -> Producto terminado`

## Ejecutar

```bash
npm run dev
```

En PowerShell, si aparece el mismo bloqueo:

```bash
npm.cmd run dev
```

Abrir:

```text
http://localhost:3000
```

## Flujo rapido de prueba

1. Entrar a `Trazabilidad`.
2. Buscar el lote final creado por seed, con formato `PT-CROI-YYYYMMDD-001`.
3. Revisar el arbol completo hacia atras.
4. Entrar a `Registrar fase` para crear nuevas transformaciones usando lotes disponibles.

## API principal

- `GET /api/proveedores`
- `POST /api/proveedores`
- `GET /api/materias-primas`
- `POST /api/materias-primas`
- `GET /api/lotes-materia-prima`
- `POST /api/lotes-materia-prima`
- `GET /api/productos`
- `POST /api/productos`
- `GET /api/tipos-preparacion`
- `POST /api/tipos-preparacion`
- `GET /api/recetas`
- `POST /api/recetas`
- `GET /api/ordenes`
- `POST /api/ordenes`
- `GET /api/fases`
- `POST /api/fases`
- `GET /api/lotes-produccion`
- `GET /api/lotes-produccion/:id`
- `GET /api/lotes-produccion/codigo/:codigo`
- `POST /api/transformaciones`
- `GET /api/trazabilidad/:id_lote_prod`
- `GET /api/trazabilidad/codigo/:codigo_lote`

## Base de datos

La base SQLite se crea automaticamente en:

```text
db/trazabilidad.sqlite
```

El esquema esta en:

```text
db/schema.sql
```

Para reiniciar los datos de demo, ejecutar nuevamente:

```bash
npm run seed
```
