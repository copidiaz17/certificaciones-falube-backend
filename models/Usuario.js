// models/Usuario.js
import { sequelize, DataTypes } from "../database.js";

const Usuario = sequelize.define("Usuario", {
    nombre: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    rol: { type: DataTypes.STRING, allowNull: false, defaultValue: "usuario" },

    {
    tableName: "usuarios",   // 🔥 CLAVE
    freezeTableName: true,   // 🔥 evita pluralización
  },
});

export default Usuario;