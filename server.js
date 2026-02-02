// server.js (VERSIÓN FINAL Y FUNCIONAL)
import express from "express";
import cors from "cors";

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
//import planificacionesRoutes from "./routes/planificaciones.js";
import avanceobraRoutes from "./routes/avanceObra.js";
import usuariosRouter from "./routes/usuarios.js";


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ===============================================
// 2. MONTAJE DE RUTAS BAJO EL PREFIJO /API
// ===============================================
app.use("/api/auth", authRoutes); 
app.use("/api/obras", obrasRoutes); 
app.use("/api/pliegos", pliegosRoutes); 
app.use("/api/catalogo", catalogoRoutes);
app.use("/api/certificaciones", certificacionesRoutes);
//app.use("/api/planificaciones", planificacionesRoutes);
app.use("/api/avanceObra", avanceobraRoutes);
app.use("/api/usuarios", usuariosRouter);
// Ruta de prueba
app.get("/", (req, res) => {
  res.send("Servidor de Certificación Backend funcionando.");
});

// 🟢 MANEJADOR GLOBAL DE ERRORES (Captura errores 500 no atrapados)
app.use((err, req, res, next) => {
    console.error("⛔ UNHANDLED ERROR EN EXPRESS ⛔", err.stack);
    res.status(500).send({ message: "Error interno del servidor no manejado." });
});


// 🔥 SINCRONIZAR DB Y LEVANTAR SERVIDOR
sequelize.authenticate()
  .then(() => {
    console.log("Conexión a la base de datos OK");
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("Error de conexión DB:", err);
  });
