// database.js
import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME, 
    process.env.DB_USER, 
    process.env.DB_PASSWORD, 
    {
        host: process.env.DB_HOST,
        dialect: 'mysql', // Cambia a 'postgres' si es necesario
        logging: false 
    }
);

// Exportamos la instancia y DataTypes para usar en los modelos
export { sequelize, DataTypes };