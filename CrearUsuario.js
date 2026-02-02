// certificacion-backend/crearUsuario.js

import bcrypt from "bcryptjs";
import Usuario from "./models/Usuario.js"; // Importa tu modelo de Usuario
import { sequelize } from "./database.js"; // Importa la conexión a la DB

async function crearUsuario() {
    // 🛑 VALORES DE ACCESO: ÚSALOS PARA INICIAR SESIÓN 🛑
    const passwordPlana = 'admin123'; 
    const email = "admin@certificacion.com"; 
    const nombre = "Administrador Principal"; 
    
    // El 'rol' debe ser 'usuario' para ver los botones de modificación
    const rol = "usuario"; 
    const saltRounds = 10; 

    console.log("Iniciando creación de usuario...");
    try {
        await sequelize.sync({ alter: true }); // Sincroniza la DB antes de usar

        // 1. Hashear la contraseña
        const hash = await bcrypt.hash(passwordPlana, saltRounds);
        console.log("Contraseña hasheada correctamente.");

        // 2. Crear usuario en la DB
        const [user, created] = await Usuario.findOrCreate({
            where: { email }, // Busca por email
            defaults: {
                nombre: nombre,
                email: email,
                password: hash, // Guarda el hash
                rol: rol // Guarda el rol
            }
        });

        if (created) {
            console.log(`✅ Usuario creado: ${user.nombre} | Email: ${user.email} | ROL: ${user.rol}`);
        } else {
            console.log(`⚠️ Usuario con email '${email}' ya existe. No se creó.`);
        }
        process.exit(0);
    } catch (err) {
        console.error("⛔ Error al crear usuario:", err.message);
        process.exit(1);
    }
}

crearUsuario();