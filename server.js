// server.js
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
import "./models/associations.js";
import "./models/planificacion.js";
import "./models/PlanificacionItem.js";
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

// ===============================================
// MIDDLEWARES
// ===============================================
app.use(express.json());

// ✅ CORS: dev + prod (Render)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.FRONTEND_URL, // Ej: https://tu-frontend.onrender.com
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Permitir herramientas sin origin (Postman, curl, etc.)
      if (!origin) return cb(null, true);

      // Permitir origins listados
      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// ===============================================
// 2. MONTAJE DE RUTAS BAJO EL PREFIJO /API
// ===============================================
app.use("/api/auth", authRoutes);
app.use("/api/obras", obrasRoutes);
app.use("/api/pliegos", pliegosRoutes);
app.use("/api/catalogo", catalogoRoutes);
app.use("/api/certificaciones", certificacionesRoutes);
app.use("/api/avanceObra", avanceobraRoutes);
app.use("/api/usuarios", usuariosRouter);

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("Servidor de Certificación Backend funcionando.");
});

// 🟢 MANEJADOR GLOBAL DE ERRORES
app.use((err, req, res, next) => {
  console.error("⛔ UNHANDLED ERROR EN EXPRESS ⛔", err);
  res.status(500).send({ message: "Error interno del servidor." });
});

// ===============================================
// INICIAR SERVER
// ===============================================
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Conexión a la base de datos OK");
    app.listen(PORT, () => {
      console.log(`🚀 Backend corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("⛔ Error de conexión DB:", err);
  });
