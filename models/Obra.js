// models/Obra.js
import { sequelize, DataTypes } from "../database.js";

const Obra = sequelize.define(
  "Obra",
  {
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    ubicacion: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // 👇 NUEVO CAMPO
    reparticion: {
      type: DataTypes.ENUM("municipalidad", "arquitectura"),
      allowNull: true, // IMPORTANTE: ya hay obras creadas
    },
  },
  {
    tableName: "obras",
    timestamps: true, // dejalo así si ya usás createdAt / updatedAt
  }
);

export default Obra;
