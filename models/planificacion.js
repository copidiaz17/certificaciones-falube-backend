// models/Planificacion.js
import { sequelize, DataTypes } from "../database.js";

const Planificacion = sequelize.define(
  "Planificacion",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    obraId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "obra_id",
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    fecha_desde: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    fecha_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    estado: {
      type: DataTypes.ENUM("abierta", "cerrada"),
      allowNull: false,
      defaultValue: "abierta",
    },

    tipo: {
      type: DataTypes.ENUM("original", "replanteo"),
      allowNull: false,
      defaultValue: "original",
    },

    motivo: {
      type: DataTypes.ENUM("tiempo", "adicional_item"),
      allowNull: true,
    },

    planificacion_padre_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    avance_corte_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "planificaciones",
    timestamps: true,
  }
);

export default Planificacion;
