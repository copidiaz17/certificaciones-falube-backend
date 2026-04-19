/**
 * Migración: soporte para ítems adicionales y replanteo de planificación
 * Segura para producción — verifica si cada columna existe antes de agregarla
 */

import { sequelize } from "./database.js";

const DB = process.env.DB_NAME || "defaultdb";

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) as cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = '${DB}'
       AND TABLE_NAME   = '${table}'
       AND COLUMN_NAME  = '${column}'`
  );
  return rows[0].cnt > 0;
}

async function addColumnIfMissing(table, column, definition) {
  const exists = await columnExists(table, column);
  if (exists) {
    console.log(`  ⏭  ${table}.${column} ya existe, se omite`);
    return;
  }
  await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  ✅ ${table}.${column} agregada`);
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a la base de datos exitosa\n");

    // ── pliegoitems ──────────────────────────────────────────────────────────
    console.log("📋 Tabla: pliegoitems");
    await addColumnIfMissing(
      "pliegoitems",
      "origen",
      `ENUM('original','adicional') NOT NULL DEFAULT 'original'`
    );
    await addColumnIfMissing(
      "pliegoitems",
      "fecha_incorporacion",
      `DATE NULL`
    );

    // ── planificaciones ──────────────────────────────────────────────────────
    console.log("\n📋 Tabla: planificaciones");
    await addColumnIfMissing(
      "planificaciones",
      "tipo",
      `ENUM('original','replanteo') NOT NULL DEFAULT 'original'`
    );
    await addColumnIfMissing(
      "planificaciones",
      "motivo",
      `ENUM('tiempo','adicional_item') NULL`
    );
    await addColumnIfMissing(
      "planificaciones",
      "planificacion_padre_id",
      `INTEGER NULL`
    );
    await addColumnIfMissing(
      "planificaciones",
      "avance_corte_id",
      `INTEGER NULL`
    );

    console.log("\n✅ Migración completada exitosamente.");
  } catch (err) {
    console.error("❌ Error en la migración:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
