// Migraciones de esquema — ÚNICA definición.
//
// Antes esto estaba duplicado en dos lugares (`server.js` y `migrate_replanteo.mjs`)
// y con tipos distintos: `motivo` era ENUM en uno y VARCHAR(50) en el otro, así que
// la columna quedaba de un tipo o de otro según qué se ejecutara primero.
//
// Además el arranque se tragaba los errores con `.catch(() => {})` y un
// "Error en migración (no crítico)", de modo que el servidor levantaba igual con
// el esquema desactualizado. Así se llegó a tener una base con datos que la
// aplicación no podía leer. Ahora un fallo real corta el arranque.
//
// Todo lo de acá es idempotente: se puede correr las veces que haga falta.

import { sequelize } from "./database.js";

async function columnaExiste(tabla, columna) {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } }
  );
  return filas.length > 0;
}

async function tablaExiste(tabla) {
  const [filas] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla`,
    { replacements: { tabla } }
  );
  return filas.length > 0;
}

// Agrega la columna solo si falta. Si falla de verdad, el error sube.
async function agregarColumna(tabla, columna, definicion, log) {
  if (!(await tablaExiste(tabla))) {
    log(`   ↷ ${tabla} no existe todavía (la crea sync) — se omite ${columna}`);
    return;
  }
  if (await columnaExiste(tabla, columna)) return;
  await sequelize.query(`ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${definicion}`);
  log(`   ✅ ${tabla}.${columna} agregada`);
}

// Ajusta el tipo de una columna que ya existe (para arreglar definiciones viejas).
async function ajustarColumna(tabla, columna, definicion, log) {
  if (!(await tablaExiste(tabla))) return;
  if (!(await columnaExiste(tabla, columna))) return;
  await sequelize.query(`ALTER TABLE \`${tabla}\` MODIFY COLUMN \`${columna}\` ${definicion}`);
}

export async function migrar({ silencioso = false } = {}) {
  const log = silencioso ? () => {} : (m) => console.log(m);
  log("🔧 Migraciones de esquema");

  // ── avance_obras ─────────────────────────────────────────────────────────
  await ajustarColumna("avance_obras", "periodo_desde", "DATE NULL DEFAULT NULL", log);
  await ajustarColumna("avance_obras", "periodo_hasta", "DATE NULL DEFAULT NULL", log);
  await ajustarColumna("avance_obras", "createdAt", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", log);
  await ajustarColumna("avance_obras", "updatedAt", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", log);

  // ── avance_obra_items ────────────────────────────────────────────────────
  await agregarColumna("avance_obra_items", "avance_porcentaje", "DECIMAL(7,2) NOT NULL DEFAULT 0", log);
  // Columnas heredadas: se dejan nulas para poder omitirlas al insertar.
  await ajustarColumna("avance_obra_items", "cantidad", "DECIMAL(12,2) NULL DEFAULT NULL", log);
  await ajustarColumna("avance_obra_items", "precio_unitario", "DECIMAL(12,2) NULL DEFAULT NULL", log);
  await ajustarColumna("avance_obra_items", "importe", "DECIMAL(14,2) NULL DEFAULT NULL", log);

  // ── pliegoitems: ítems adicionales ───────────────────────────────────────
  await agregarColumna("pliegoitems", "origen", "ENUM('original','adicional') NOT NULL DEFAULT 'original'", log);
  await agregarColumna("pliegoitems", "fecha_incorporacion", "DATE NULL DEFAULT NULL", log);

  // ── planificaciones: replanteo ───────────────────────────────────────────
  // Las planificaciones que ya existían quedan como 'original' por el default,
  // que es exactamente lo que corresponde.
  await agregarColumna("planificaciones", "tipo", "ENUM('original','replanteo') NOT NULL DEFAULT 'original'", log);
  await agregarColumna("planificaciones", "motivo", "ENUM('tiempo','adicional_item') NULL DEFAULT NULL", log);
  await agregarColumna("planificaciones", "planificacion_padre_id", "INT NULL DEFAULT NULL", log);
  await agregarColumna("planificaciones", "avance_corte_id", "INT NULL DEFAULT NULL", log);

  // Si una base vieja quedó con `motivo` como VARCHAR (lo definía así el arranque),
  // se lo lleva al ENUM para que las dos bases digan lo mismo.
  const [tipoMotivo] = await sequelize.query(
    `SELECT COLUMN_TYPE t FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planificaciones' AND COLUMN_NAME = 'motivo'`
  );
  if (tipoMotivo.length && !String(tipoMotivo[0].t).startsWith("enum")) {
    await sequelize.query(
      `ALTER TABLE planificaciones MODIFY COLUMN motivo ENUM('tiempo','adicional_item') NULL DEFAULT NULL`
    );
    log("   ✅ planificaciones.motivo unificada a ENUM");
  }

  // ── Excedentes: ejecutar por encima de lo presupuestado ──────────────
  //
  // El avance de obra registra lo que se ejecutó DE VERDAD. En una obra puede
  // haber 50 m3 de excavación presupuestados y excavarse 200: eso hay que
  // poder anotarlo. La certificación sigue topada al pliego —ahí no se puede
  // cobrar de más— pero el avance no.
  //
  // Por eso el porcentaje pasa a DECIMAL(9,2): con (7,2) el tope era 99999,99
  // y un ítem al 400% entraba, pero uno con un pliego chico y mucha ejecución
  // podía no entrar. Nueve dígitos alcanzan para cualquier caso real.
  await ajustarColumna("avance_obra_items", "avance_porcentaje", "DECIMAL(9,2) NOT NULL DEFAULT 0", log);

  // La cantidad ejecutada en la unidad del ítem. El excedente se discute en
  // obra en metros cúbicos, no en porcentaje: "150 m3 de más" se entiende,
  // "400% de avance" no. Va NULL: los avances ya cargados no la tienen y no
  // hay forma de inventarla hacia atrás.
  await agregarColumna("avance_obra_items", "cantidad_ejecutada", "DECIMAL(15,5) NULL DEFAULT NULL", log);

  // El excedente reconocido entra como un ÍTEM NUEVO del pliego, sin precio:
  // cuánto vale se negocia después con el comitente. `item_origen_id` dice de
  // qué ítem salió, que es lo que lo hace rastreable.
  //
  // El ENUM ya existía con ('original','adicional'): se le agrega el valor sin
  // tocar las filas, que quedan como estaban.
  await ajustarColumna(
    "pliegoitems", "origen",
    "ENUM('original','adicional','excedente') NOT NULL DEFAULT 'original'", log
  );
  await agregarColumna("pliegoitems", "item_origen_id", "INT NULL DEFAULT NULL", log);

  log("✅ Esquema al día");
}

export default migrar;
