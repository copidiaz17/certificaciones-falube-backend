// server.js (PRODUCCIÓN - RENDER READY)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Importación de la conexión a la DB
import { sequelize } from "./database.js";

// ===============================================
// 1. IMPORTAR MODELOS (SOLO BACKEND)
// ===============================================
import "./models/Usuario.js";
import "./models/Obra.js";
import "./models/PliegoItem.js";
import "./models/Certificacion.js";
import "./models/CertificacionItem.js";
import "./models/Associations.js";
import "./models/planificacion.js";
import "./models/planificacionItem.js";
import "./models/AvanceObra.js";
import "./models/AvanceObraItem.js";

// Importar rutas
import authRoutes from "./routes/auth.js";
import obrasRoutes from "./routes/obras.js";
import pliegosRoutes from "./routes/pliegos.js";
import catalogoRoutes from "./routes/catalogo.js";
import certificacionesRoutes from "./routes/certificaciones.js";
import avanceobraRoutes from "./routes/avanceObra.js";
import usuariosRouter from "./routes/usuarios.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Render.com (y proxies en general) añaden X-Forwarded-For.
// Sin esto, express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set("trust proxy", 1);

// ===============================================
// 2. CORS (PRODUCCIÓN)
// ===============================================
// Render / browsers mandan preflight OPTIONS.
// NO uses app.options('*', ...) porque en algunas combinaciones rompe con path-to-regexp.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite requests sin Origin (health checks, Postman, etc.)
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ===============================================
// 3. MIDDLEWARES
// ===============================================
app.use(express.json());

// ===============================================
// 4. RUTAS
// ===============================================
app.use("/api/auth", authRoutes);
app.use("/api/obras", obrasRoutes);
app.use("/api/obras", pliegosRoutes); // pliego-item CRUD bajo /api/obras
app.use("/api/pliegos", pliegosRoutes);
app.use("/api/catalogo", catalogoRoutes);
app.use("/api/certificaciones", certificacionesRoutes);
app.use("/api/avanceObra", avanceobraRoutes);
app.use("/api/usuarios", usuariosRouter);

// Health / ping
app.get("/", (req, res) => {
  res.send("Servidor de Certificación Backend funcionando.");
});

// ===============================================
// 5. MANEJADOR GLOBAL DE ERRORES
// ===============================================
app.use((err, req, res, next) => {
  console.error("⛔ ERROR EN EXPRESS ⛔", err);
  res.status(500).json({ message: "Error interno del servidor." });
});

// ===============================================
// 6. VALIDACIONES DE ENTORNO (AVISO)
// ===============================================
if (!process.env.JWT_SECRET) {
  console.error("⛔ JWT_SECRET no está definido. El servidor no puede arrancar de forma segura.");
  process.exit(1);
}
if (!process.env.FRONTEND_URL) {
  console.warn("⚠️ FRONTEND_URL no está definido. En producción debe estar en ENV.");
}

// ===============================================
// 7. MIGRACIONES DE ESQUEMA (seguras, idempotentes)
// ===============================================
async function runMigrations() {
  try {
    // Hacer nullable periodo_desde y periodo_hasta en avance_obras
    await sequelize.query(`ALTER TABLE avance_obras MODIFY COLUMN periodo_desde DATE NULL DEFAULT NULL`).catch(() => {});
    await sequelize.query(`ALTER TABLE avance_obras MODIFY COLUMN periodo_hasta DATE NULL DEFAULT NULL`).catch(() => {});
    // Agregar DEFAULT a timestamps si existen
    await sequelize.query(`ALTER TABLE avance_obras MODIFY COLUMN createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`).catch(() => {});
    await sequelize.query(`ALTER TABLE avance_obras MODIFY COLUMN updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`).catch(() => {});
    // Agregar avance_porcentaje si falta en avance_obra_items
    const [checkCol] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avance_obra_items' AND COLUMN_NAME = 'avance_porcentaje'`
    );
    if (checkCol.length === 0) {
      await sequelize.query(`ALTER TABLE avance_obra_items ADD COLUMN avance_porcentaje DECIMAL(7,2) NOT NULL DEFAULT 0`);
      console.log("✅ Columna avance_porcentaje agregada");
    }
    // Hacer nullable las columnas legacy (cantidad, precio_unitario, importe) para que puedan omitirse en INSERT
    await sequelize.query(`ALTER TABLE avance_obra_items MODIFY COLUMN cantidad DECIMAL(12,2) NULL DEFAULT NULL`).catch(() => {});
    await sequelize.query(`ALTER TABLE avance_obra_items MODIFY COLUMN precio_unitario DECIMAL(12,2) NULL DEFAULT NULL`).catch(() => {});
    await sequelize.query(`ALTER TABLE avance_obra_items MODIFY COLUMN importe DECIMAL(14,2) NULL DEFAULT NULL`).catch(() => {});
    // Phase 3: origen y fecha_incorporacion en pliegoitems
    const [checkOrigen] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pliegoitems' AND COLUMN_NAME = 'origen'`
    );
    if (checkOrigen.length === 0) {
      await sequelize.query(`ALTER TABLE pliegoitems ADD COLUMN origen ENUM('original','adicional') NOT NULL DEFAULT 'original'`);
      console.log("✅ Columna origen agregada a pliegoitems");
    }
    const [checkFechaInc] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pliegoitems' AND COLUMN_NAME = 'fecha_incorporacion'`
    );
    if (checkFechaInc.length === 0) {
      await sequelize.query(`ALTER TABLE pliegoitems ADD COLUMN fecha_incorporacion DATE NULL DEFAULT NULL`);
      console.log("✅ Columna fecha_incorporacion agregada a pliegoitems");
    }
    // Phase 3: tipo, motivo, planificacion_padre_id, avance_corte_id en planificaciones
    const [checkTipo] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planificaciones' AND COLUMN_NAME = 'tipo'`
    );
    if (checkTipo.length === 0) {
      await sequelize.query(`ALTER TABLE planificaciones ADD COLUMN tipo ENUM('original','replanteo') NOT NULL DEFAULT 'original'`);
      console.log("✅ Columna tipo agregada a planificaciones");
    }
    const [checkMotivo] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planificaciones' AND COLUMN_NAME = 'motivo'`
    );
    if (checkMotivo.length === 0) {
      await sequelize.query(`ALTER TABLE planificaciones ADD COLUMN motivo VARCHAR(50) NULL DEFAULT NULL`);
      console.log("✅ Columna motivo agregada a planificaciones");
    }
    const [checkPadreId] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planificaciones' AND COLUMN_NAME = 'planificacion_padre_id'`
    );
    if (checkPadreId.length === 0) {
      await sequelize.query(`ALTER TABLE planificaciones ADD COLUMN planificacion_padre_id INT NULL DEFAULT NULL`);
      console.log("✅ Columna planificacion_padre_id agregada a planificaciones");
    }
    const [checkCorteId] = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planificaciones' AND COLUMN_NAME = 'avance_corte_id'`
    );
    if (checkCorteId.length === 0) {
      await sequelize.query(`ALTER TABLE planificaciones ADD COLUMN avance_corte_id INT NULL DEFAULT NULL`);
      console.log("✅ Columna avance_corte_id agregada a planificaciones");
    }
    console.log("✅ Migraciones de esquema OK");
  } catch (err) {
    console.error("⚠️ Error en migración (no crítico):", err.message);
  }
}

// ===============================================
// 8. CONECTAR DB + LEVANTAR SERVIDOR
// ===============================================
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Conexión a la base de datos OK");
    return sequelize.sync();
  })
  .then(() => runMigrations())
  .then(() => {
    console.log("✅ Tablas sincronizadas");
    app.listen(PORT, () => {
      console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("⛔ Error de conexión DB:", err);
    process.exit(1);
  });
