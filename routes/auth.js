// backend/routes/auth.js
import express from "express";
import Usuario from "../models/Usuario.js"; // Necesario para buscar el usuario
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();
const SECRET = "tu_clave_secreta"; 

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Usamos raw: true para simplificar la extracción de propiedades
    const user = await Usuario.findOne({ where: { email }, raw: true }); 
    
    if (!user) return res.status(400).json({ message: "Usuario no encontrado" });

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(400).json({ message: "Contraseña incorrecta" });

    // Firma el token con el rol, nombre y email
    const token = jwt.sign(
        { 
            id: user.id, 
            email: user.email,
            nombre: user.nombre, 
            rol: user.rol // Clave para el control de acceso
        }, 
        SECRET, 
        { expiresIn: "1h" }
    );

    return res.json({ token });
  } catch (error) {
    console.error("Error en /login:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Middleware para proteger rutas (debe ser exportado)
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No autorizado" });

  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Token inválido" });
    req.user = user; 
    next();
  });
};

export default router;