// Recalcula el desglose de los certificados que YA existen y lo compara con
// lo que está guardado.
//
// Hasta ahora esos números los calculaba el navegador. Antes de confiar en el
// recálculo del servidor hay que saber si coinciden: si dan igual, el cambio
// no mueve nada y solo cierra la puerta. Si dan distinto, encontramos un error
// que estuvo facturándose.
//
// SOLO LEE. No escribe una sola fila.
//
//   node scripts/verificar-totales.mjs

import "dotenv/config";
import { sequelize } from "../database.js";

function calcularTotales(subtotal, reparticion) {
  const t = {
    subtotal, deduccion_anticipo: 0, fondo_reparo: 0, tasa_inspeccion: 0,
    sustitucion_fondo_reparo: 0, gastos_generales: 0, beneficios: 0,
    iva: 0, ingresos_brutos: 0, total_neto: subtotal,
  };
  if (reparticion === "municipalidad_sgo") {
    const deduccionAnticipo = subtotal * 0.4;
    const fondoReparo = subtotal * 0.05;
    const tasaInspeccion = subtotal * 0.03;
    const subtotal1 = subtotal - deduccionAnticipo;
    const subtotal2 = subtotal1 - fondoReparo - tasaInspeccion;
    t.deduccion_anticipo = deduccionAnticipo;
    t.fondo_reparo = fondoReparo;
    t.tasa_inspeccion = tasaInspeccion;
    t.sustitucion_fondo_reparo = fondoReparo;
    t.total_neto = subtotal2 + fondoReparo;
  } else if (reparticion === "direccion_arquitectura") {
    const gastosGenerales = subtotal * 0.15;
    const subtotal1 = subtotal + gastosGenerales;
    const beneficios = subtotal1 * 0.1;
    const subtotal2 = subtotal1 + beneficios;
    const iva = subtotal2 * 0.21;
    const ingresosBrutos = subtotal2 * 0.025;
    t.gastos_generales = gastosGenerales;
    t.beneficios = beneficios;
    t.iva = iva;
    t.ingresos_brutos = ingresosBrutos;
    t.total_neto = subtotal2 - iva - ingresosBrutos;
  }
  return t;
}

const plata = (v) =>
  Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Un peso de tolerancia: la base guarda con dos decimales y el navegador
// redondeaba a su manera. Una diferencia mayor no es redondeo.
const TOLERANCIA = 1;

const CAMPOS = [
  "deduccion_anticipo", "fondo_reparo", "tasa_inspeccion",
  "sustitucion_fondo_reparo", "gastos_generales", "beneficios",
  "iva", "ingresos_brutos", "total_neto",
];

try {
  await sequelize.authenticate();
  console.log(`Base: ${sequelize.config.database}\n`);

  const [filas] = await sequelize.query(`
    SELECT c.id, c.numero_certificado, c.subtotal, c.total_neto,
           c.deduccion_anticipo, c.fondo_reparo, c.tasa_inspeccion,
           c.sustitucion_fondo_reparo, c.gastos_generales, c.beneficios,
           c.iva, c.ingresos_brutos,
           o.nombre AS obra, o.reparticion
      FROM certificaciones c
      JOIN obras o ON o.id = c.obra_id
     ORDER BY o.nombre, c.numero_certificado
  `);

  if (filas.length === 0) {
    console.log("No hay certificados cargados: nada que verificar.");
    process.exit(0);
  }

  // Además del desglose, se comprueba que el subtotal guardado sea la suma de
  // los ítems: es la otra mitad de lo que ahora recalcula el servidor.
  const [sumas] = await sequelize.query(`
    SELECT certificacion_id AS id, SUM(importe) AS suma
      FROM certificacion_items GROUP BY certificacion_id
  `);
  const sumaDeItems = new Map(sumas.map((s) => [Number(s.id), Number(s.suma || 0)]));

  let iguales = 0;
  const distintos = [];

  for (const f of filas) {
    const sub = Number(f.subtotal || 0);
    const calc = calcularTotales(sub, f.reparticion);
    const difs = [];

    for (const c of CAMPOS) {
      const d = Number(f[c] || 0) - calc[c];
      if (Math.abs(d) > TOLERANCIA) {
        difs.push({ campo: c, guardado: Number(f[c] || 0), calculado: calc[c], dif: d });
      }
    }

    const suma = sumaDeItems.get(Number(f.id));
    if (suma !== undefined && Math.abs(suma - sub) > TOLERANCIA) {
      difs.push({ campo: "subtotal vs suma de ítems", guardado: sub, calculado: suma, dif: sub - suma });
    }

    if (difs.length === 0) iguales++;
    else distintos.push({ f, difs });
  }

  console.log(`${filas.length} certificados revisados`);
  console.log(`  ✅ ${iguales} coinciden con el recálculo del servidor`);
  console.log(`  ${distintos.length ? "⚠️ " : "✅ "}${distintos.length} con diferencias\n`);

  for (const { f, difs } of distintos) {
    console.log(`── ${f.obra} · certificado N° ${f.numero_certificado} (id ${f.id})`);
    console.log(`   repartición: ${f.reparticion || "sin definir"} · subtotal ${plata(f.subtotal)}`);
    for (const d of difs) {
      console.log(
        `   ${d.campo.padEnd(28)} guardado ${plata(d.guardado).padStart(18)}` +
        `   recalculado ${plata(d.calculado).padStart(18)}   dif ${plata(d.dif)}`
      );
    }
    console.log("");
  }

  if (distintos.length === 0) {
    console.log("El navegador venía calculando bien. El cambio no mueve ningún número:");
    console.log("solo cierra la puerta a que alguna vez calcule mal.");
  }

  await sequelize.close();
  process.exit(0);
} catch (e) {
  console.error("⛔", e.message);
  process.exit(1);
}
