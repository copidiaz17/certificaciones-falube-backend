

// routes/usuarios.js
import { Router } from "express";
import bcrypt from "bcryptjs";

import Usuario from "../models/Usuario.js";
import { authMiddleware } from "../routes/auth.js";



const router = Router();

/**
 * POST /api/usuarios
 * Crea un nuevo usuario. Solo puede hacerlo el usuario con id = 1 (isSuperAdmin).
 */
router.post(
  "/",
  authMiddleware,       // primero autenticamos
          // luego validamos que sea el superadmin (id = 1)
  async (req, res) => {
    try {
      const { nombre, email, password, rol } = req.body;

      if (!nombre || !email || !password || !rol) {
        return res.status(400).json({
          ok: false,
          error: "Nombre, email, contraseña y rol son obligatorios",
        });
      }

      // Verificar que no exista el email
      const existente = await Usuario.findOne({ where: { email } });
      if (existente) {
        return res.status(400).json({
          ok: false,
          error: "Ya existe un usuario con ese email",
        });
      }

      // Encriptar contraseña
      const hashed = await bcrypt.hash(password, 10);

      // Crear usuario
      const nuevo = await Usuario.create({
        nombre,
        email,
        password: hashed,
        rol, // "administrador" o "usuario"
      });

      return res.status(201).json({
        ok: true,
        usuario: {
          id: nuevo.id,
          nombre: nuevo.nombre,
          email: nuevo.email,
          rol: nuevo.rol,
        },
      });
    } catch (error) {
      console.error("Error creando usuario:", error);
      return res.status(500).json({
        ok: false,
        error: "Error inesperado al crear usuario",
      });
    }
  }
);

export default router;
