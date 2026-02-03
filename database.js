// database.js
import { Sequelize, DataTypes } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),   // ✅ Aiven usa puerto distinto
    dialect: "mysql",
    logging: false,
    dialectOptions: process.env.DB_SSL === "true"
      ? { ssl: { rejectUnauthorized: false } }   // ✅ SSL para Aiven/Render
      : {},
  }
);

export { sequelize, DataTypes };
