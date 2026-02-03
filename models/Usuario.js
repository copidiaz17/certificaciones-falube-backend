import { sequelize, DataTypes } from "../database.js";

const Usuario = sequelize.define(
  "Usuario",
  {
    nombre: DataTypes.STRING,
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    rol: DataTypes.STRING,
  },
  {
    tableName: "usuarios",   // 🔥 CLAVE
    freezeTableName: true,   // 🔥 evita pluralización
  }
);

export default Usuario;
