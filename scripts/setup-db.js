// scripts/setup-db.js
// Crea la tabla itemgenerals si no existe en producción
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

console.log('✅ Conectado a la DB');

await conn.query(`
  CREATE TABLE IF NOT EXISTS \`itemgenerals\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`nombre\` VARCHAR(255) NOT NULL,
    \`unidadMedida\` VARCHAR(255) NOT NULL,
    \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`nombre_unique\` (\`nombre\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

console.log('✅ Tabla itemgenerals lista');

const [cols] = await conn.query('SHOW COLUMNS FROM itemgenerals');
console.log('Columnas:');
cols.forEach(c => console.log(' -', c.Field, '|', c.Type, '| NULL:', c.Null, '| Default:', c.Default));

const [rows] = await conn.query('SELECT COUNT(*) as total FROM itemgenerals');
console.log('Items existentes:', rows[0].total);

await conn.end();
