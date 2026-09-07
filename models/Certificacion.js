// models/Certificacion.js
import { sequelize, DataTypes } from "../database.js";

const Certificacion = sequelize.define(
  "Certificacion",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    obra_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    periodo_desde: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    periodo_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    numero_certificado: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    fecha_certificacion: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    // campo extra (existe en la tabla, lo dejamos disponible)
    numero: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    subtotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    total_neto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    deduccion_anticipo: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    fondo_reparo: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    tasa_inspeccion: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    sustitucion_fondo_reparo: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    gastos_generales: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    beneficios: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    iva: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    ingresos_brutos: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0.0,
    },

    // 🔹 Quién lo hizo. Sin esto, ante un certificado mal cargado no hay a
    // quién preguntarle qué quiso poner.
    creado_por_id: { type: DataTypes.INTEGER, allowNull: true },
    editado_por_id: { type: DataTypes.INTEGER, allowNull: true },

    // 🔹 Anulación: no se borra, se marca. Un certificado borrado se lleva
    // consigo el rastro de que existió, y del otro lado —en el sistema de
    // costos— puede haber una factura emitida contra él. Anulado queda fuera
    // del acumulado y del tope del 100%, pero sigue estando.
    anulada: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    anulada_por_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: "certificaciones",
    freezeTableName: true,
    timestamps: true, // createdAt / updatedAt ya existen en la tabla
  }
);

export default Certificacion;
