// backend/routes/auth.js
import express from "express";
import Usuario from "../models/Usuario.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

// ✅ NO hardcodear secretos en prod
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn("⚠️ JWT_SECRET no está definido. En producción esto debe estar en ENV.");
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email y password son requeridos" });
    }

    const user = await Usuario.findOne({ where: { email }, raw: true });
    if (!user) return res.status(400).json({ message: "Usuario no encontrado" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
      SECRET || "DEV_ONLY_FALLBACK_SECRET",
      { expiresIn: "1h" }
    );

    return res.json({ token });
  } catch (error) {
    console.error("Error en /login:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
});

// Middleware auth
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No autorizado" });

  jwt.verify(token, SECRET || "DEV_ONLY_FALLBACK_SECRET", (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token inválido" });
    req.user = decoded;
    next();
  });
};

export default router;
