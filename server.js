// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// DB
import { sequelize } from "./database.js";

// ===============================================
// 1) IMPORTAR MODELOS
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

// ===============================================
// 2) IMPORTAR RUTAS
// ===============================================
import authRoutes from "./routes/auth.js";
import obrasRoutes from "./routes/obras.js";
import pliegosRoutes from "./routes/pliegos.js";
import catalogoRoutes from "./routes/catalogo.js";
import certificacionesRoutes from "./routes/certificaciones.js";
import avanceobraRoutes from "./routes/avanceObra.js";
import usuariosRouter from "./routes/usuarios.js";

const app = express();
app.set("trust proxy", 1); // ✅ Render/Proxies

const PORT = process.env.PORT || 3000;

// ===============================================
// ✅ CORS (LOCAL + PRODUCCIÓN)
// ===============================================
// En Render poné FRONTEND_URL=https://certificaciones-falube-frontend.onrender.com
// Si no lo ponés, igual dejamos un fallback seguro.
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://certificaciones-falube-frontend.onrender.com";

const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite requests sin origin (Postman, health checks)
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);

      // Bloquear explícitamente
      return cb(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Preflight
app.options("*", cors());

// JSON
app.use(express.json());

// ===============================================
// 3) RUTAS BAJO /api
// ===============================================
app.use("/api/auth", authRoutes);
app.use("/api/obras", obrasRoutes);
app.use("/api/pliegos", pliegosRoutes);
app.use("/api/catalogo", catalogoRoutes);
app.use("/api/certificaciones", certificacionesRoutes);
app.use("/api/avanceObra", avanceobraRoutes);
app.use("/api/usuarios", usuariosRouter);

// Health
app.get("/", (req, res) => {
  res.send("✅ Backend Certificación funcionando (Render).");
});

// ===============================================
// 🟢 MANEJADOR GLOBAL DE ERRORES
// ===============================================
app.use((err, req, res, next) => {
  console.error("⛔ ERROR GLOBAL EXPRESS ⛔", err?.stack || err);
  res.status(500).json({ message: "Error interno del servidor." });
});

// ===============================================
// ✅ DB + START
// ===============================================
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Conexión a la base de datos OK");
    app.listen(PORT, () => {
      console.log(`✅ Server escuchando en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("⛔ Error de conexión DB:", err);
  });
