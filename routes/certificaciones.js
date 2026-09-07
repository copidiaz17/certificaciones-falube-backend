// backend/routes/certificaciones.js
import express from "express";
import { Op } from "sequelize";
import { sequelize } from "../database.js";

import Certificacion from "../models/Certificacion.js";
import CertificacionItem from "../models/CertificacionItem.js";
import Obra from "../models/Obra.js";
import PliegoItem from "../models/PliegoItem.js";

import { authMiddleware } from "./auth.js";
import { hasRole, ROLES } from "../middlewares/authorization.js";
import { avisarSinEsperar } from "../utils/avisarCostos.js";

const router = express.Router();

/**
 * El desglose financiero de un certificado, según la repartición.
 *
 * Antes esto lo mandaba el navegador y el servidor lo guardaba tal cual. Dejó
 * de ser aceptable cuando el certificado empezó a viajar al sistema de costos
 * y convertirse en una factura a un organismo público: un redondeo distinto,
 * una versión vieja en caché o alguien tocando la petición se transformaban en
 * un importe facturado.
 *
 * Ahora lo recalcula el servidor y lo que manda el front se ignora. Los
 * porcentajes viven acá, en un solo lugar, porque cuando cambien va a haber
 * que cambiarlos una sola vez.
 */
function calcularTotales(subtotal, reparticion) {
  const t = {
    subtotal,
    deduccion_anticipo: 0,
    fondo_reparo: 0,
    tasa_inspeccion: 0,
    sustitucion_fondo_reparo: 0,
    gastos_generales: 0,
    beneficios: 0,
    iva: 0,
    ingresos_brutos: 0,
    total_neto: subtotal,
  };

  if (reparticion === "municipalidad_sgo") {
    const deduccionAnticipo = subtotal * 0.4;  // 40%
    const fondoReparo = subtotal * 0.05;       // 5%
    const tasaInspeccion = subtotal * 0.03;    // 3%
    const subtotal1 = subtotal - deduccionAnticipo;
    const subtotal2 = subtotal1 - fondoReparo - tasaInspeccion;
    const sustitucionFondoReparo = fondoReparo; // se re-suma
    t.deduccion_anticipo = deduccionAnticipo;
    t.fondo_reparo = fondoReparo;
    t.tasa_inspeccion = tasaInspeccion;
    t.sustitucion_fondo_reparo = sustitucionFondoReparo;
    t.total_neto = subtotal2 + sustitucionFondoReparo;
  } else if (reparticion === "direccion_arquitectura") {
    const gastosGenerales = subtotal * 0.15;   // 15%
    const subtotal1 = subtotal + gastosGenerales;
    const beneficios = subtotal1 * 0.1;        // 10%
    const subtotal2 = subtotal1 + beneficios;
    const iva = subtotal2 * 0.21;              // 21%
    const ingresosBrutos = subtotal2 * 0.025;  // 2,5%
    t.gastos_generales = gastosGenerales;
    t.beneficios = beneficios;
    t.iva = iva;
    t.ingresos_brutos = ingresosBrutos;
    t.total_neto = subtotal2 - iva - ingresosBrutos;
  }
  // Sin repartición definida no se deduce nada: total_neto = subtotal. Es
  // preferible a aplicar la fórmula de una repartición que no es.

  return t;
}


/*==========================================================
   🔹 LISTAR CERTIFICACIONES DE UNA OBRA
   GET /obras/:obraId/certificaciones
   (usado por ObraDetalleView para el historial)
========================================================== */
router.get(
  "/obras/:obraId/certificaciones",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]),
  async (req, res) => {
    try {
      const { obraId } = req.params;

      // Acá SÍ van las anuladas: es el historial, y un certificado que
      // desaparece de la lista es un certificado que nadie puede explicar.
      // Van marcadas para que la pantalla las muestre distinto.
      const certs = await Certificacion.findAll({
        where: { obra_id: obraId }, // 👈 importante: obra_id como en la DB
        order: [
          ["fecha_certificacion", "ASC"],
          ["id", "ASC"],
        ],
        attributes: [
          "id",
          "numero_certificado",
          "periodo_desde",
          "periodo_hasta",
          "fecha_certificacion",
          "subtotal",
          "total_neto",
          "anulada",
        ],
      });

      return res.json(certs);
    } catch (error) {
      console.error("Error listando certificaciones:", error);
      return res.status(500).json({
        ok: false,
        message: "Error al obtener las certificaciones de la obra",
      });
    }
  }
);

/* ==========================================================
   🔹 ACUMULADO CERTIFICADO POR ÍTEM
   GET /obras/:obraId/certificaciones/acumulado
========================================================== */
router.get(
  "/obras/:obraId/certificaciones/acumulado",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR]),
  async (req, res) => {
    try {
      const { obraId } = req.params;

      // 1️⃣ Las certificaciones NO anuladas de esa obra: una anulada no
      //    ocupa lugar en el acumulado, si no el ítem quedaría bloqueado al
      //    100% por un certificado que ya no vale.
      const certs = await Certificacion.findAll({
        where: { obra_id: obraId, anulada: false },
        attributes: ["id"],
        raw: true,
      });

      const certIds = certs.map((c) => c.id);

      if (certIds.length === 0) {
        return res.json({ ok: true, data: {} });
      }

      // 2️⃣ Agrupar por ítem sumando el avance_porcentaje
      const rows = await CertificacionItem.findAll({
        attributes: [
          "PliegoItemId",
          [
            sequelize.fn("SUM", sequelize.col("avance_porcentaje")),
            "acumulado",
          ],
        ],
        where: {
          CertificacionId: certIds, // IN (...)
        },
        group: ["PliegoItemId"],
        raw: true,
      });

      const acumulados = {};
      rows.forEach((r) => {
        acumulados[r.PliegoItemId] = Number(r.acumulado);
      });

      res.json({ ok: true, data: acumulados });
    } catch (error) {
      console.error("Error acumulado certificaciones:", error);
      res.status(500).json({
        ok: false,
        error: "Error al calcular acumulados certificados",
      });
    }
  }
);




/* ==========================================================
   🔹 CREAR CERTIFICACIÓN
   POST /obras/:obraId/certificaciones
========================================================== */
router.post(
  "/obras/:obraId/certificaciones",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR]),
  async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { obraId } = req.params;
      const {
        numero_certificado,
        fecha_certificacion,
        periodo_desde,
        periodo_hasta,
        items,
        // `totales` e `importe` por ítem llegan del front, pero YA NO SE USAN:
        // el servidor los recalcula desde el pliego, que es la fuente de
        // verdad. Se siguen aceptando en el cuerpo para no romper la pantalla
        // que todavía los manda.
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("La certificación debe contener ítems");
      }

      // La obra define la repartición, y la repartición define la fórmula.
      const obra = await Obra.findByPk(obraId, { transaction });
      if (!obra) throw new Error("Obra no encontrada");

      // Los ítems del pliego: de acá salen la cantidad y el costo unitario.
      const pliegoIds = items.map((it) => it.pliego_item_id);
      const pliegoItems = await PliegoItem.findAll({
        where: { id: pliegoIds, obraId },
        transaction,
        raw: true,
      });
      const pliegoMap = {};
      pliegoItems.forEach((p) => (pliegoMap[p.id] = p));

      // Las anuladas no cuentan para el tope del 100%.
      const certs = await Certificacion.findAll({
        where: { obra_id: obraId, anulada: false },
        attributes: ["id"],
        raw: true,
        transaction,
      });

      const certIds = certs.map((c) => c.id);

      /* =========================================
         🔒 Recalcular el importe de cada ítem en el servidor,
            validar que pertenezca a la obra y que el acumulado
            no pase del 100%
      ========================================== */
      const itemsCalculados = [];
      let subtotal = 0;

      for (const item of items) {
        const { pliego_item_id, avance_porcentaje } = item;
        const pct = Number(avance_porcentaje);

        if (!pct || pct <= 0) {
          throw new Error(
            `El avance del ítem ${pliego_item_id} debe ser mayor a 0`
          );
        }

        // Que el ítem sea de ESTA obra. Sin esta comprobación se podría
        // certificar contra el pliego de otra.
        const pliego = pliegoMap[pliego_item_id];
        if (!pliego) {
          throw new Error(`El ítem ${pliego_item_id} no pertenece a esta obra`);
        }

        let totalCertificado = 0;

        if (certIds.length > 0) {
          totalCertificado = await CertificacionItem.sum(
            "avance_porcentaje",
            {
              where: {
                PliegoItemId: pliego_item_id,
                CertificacionId: certIds, // IN (...) sobre certificaciones de esa obra
              },
              transaction,
            }
          );
        }

        const acumuladoPrevio = Number(totalCertificado || 0);

        if (acumuladoPrevio + pct > 100) {
          throw new Error(
            `El ítem ${pliego_item_id} supera el 100% certificado (acumulado previo ${acumuladoPrevio}%, nuevo ${pct}%).`
          );
        }

        // Importe = cantidad × costo unitario × avance%, DESDE EL PLIEGO.
        const importe =
          (Number(pliego.cantidad) * Number(pliego.costoUnitario) * pct) / 100;
        subtotal += importe;
        itemsCalculados.push({ pliego_item_id, avance_porcentaje: pct, importe });
      }

      // 🔒 El desglose, calculado acá y no en el navegador.
      const t = calcularTotales(subtotal, obra.reparticion);
      const totalNeto = t.total_neto;

      /* =========================================
         1️⃣ Crear CABECERA de certificación
         Usando los nombres que tenés en la tabla:
         obra_id, periodo_desde, periodo_hasta, etc.
      ========================================== */
      const certificacion = await Certificacion.create(
        {
          obra_id: obraId,
          periodo_desde,
          periodo_hasta,
          numero_certificado,
          fecha_certificacion,

          // 🔹 El desglose, tal como lo calculó el servidor
          subtotal: t.subtotal,
          total_neto: totalNeto,
          deduccion_anticipo: t.deduccion_anticipo,
          fondo_reparo: t.fondo_reparo,
          tasa_inspeccion: t.tasa_inspeccion,
          sustitucion_fondo_reparo: t.sustitucion_fondo_reparo,
          gastos_generales: t.gastos_generales,
          beneficios: t.beneficios,
          iva: t.iva,
          ingresos_brutos: t.ingresos_brutos,

          creado_por_id: req.user?.id || null,
        },
        { transaction }
      );

      /* =========================================
         2️⃣ Crear ÍTEMS de certificación
         Usar SIEMPRE los nombres de atributo
         del modelo: CertificacionId / PliegoItemId
      ========================================== */
      // Los recalculados, no los que llegaron del navegador.
      for (const item of itemsCalculados) {
        await CertificacionItem.create(
          {
            CertificacionId: certificacion.id,     // 👈 atributo de modelo
            PliegoItemId: item.pliego_item_id,     // 👈 atributo de modelo
            avance_porcentaje: item.avance_porcentaje,
            importe: item.importe,
          },
          { transaction }
        );
      }

      await transaction.commit();

      // El certificado ya existe: recien ahora se le avisa al sistema de
      // costos, para que arme la factura con el importe, el periodo y el CUIT
      // del receptor precargados. Va DESPUES del commit y sin esperar: si
      // costos esta caido, el certificado se emitio igual.
      avisarSinEsperar({
        obraId, evento: "certificado_emitido", certificadoId: certificacion.id,
      });

      res.status(201).json({
        ok: true,
        certificacion_id: certificacion.id,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Error creando certificación:", error);
      res.status(400).json({ ok: false, error: error.message });
    }
  }
);

/* ==========================================================
   🔹 EDITAR CABECERA DE UNA CERTIFICACIÓN
   PUT /api/certificaciones/:certId
   Solo edita: numero_certificado, fecha_certificacion,
               periodo_desde, periodo_hasta
   ========================================================== */
router.put(
  "/:certId",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR]),
  async (req, res) => {
    try {
      const { certId } = req.params;
      const { numero_certificado, fecha_certificacion, periodo_desde, periodo_hasta } = req.body;

      if (!numero_certificado || !fecha_certificacion || !periodo_desde || !periodo_hasta) {
        return res.status(400).json({ ok: false, error: "Todos los campos de cabecera son requeridos." });
      }

      const cert = await Certificacion.findByPk(certId);
      if (!cert) {
        return res.status(404).json({ ok: false, error: "Certificación no encontrada." });
      }

      if (cert.anulada) {
        return res.status(400).json({
          ok: false,
          error: "La certificación está anulada; no se puede editar. Reactivala primero.",
        });
      }

      await cert.update({
        numero_certificado, fecha_certificacion, periodo_desde, periodo_hasta,
        editado_por_id: req.user?.id || null,
      });

      // Si cambio algo del certificado, la factura pendiente del otro lado
      // quedo vieja.
      avisarSinEsperar({
        obraId: cert.obra_id, evento: "certificado_editado", certificadoId: cert.id,
      });

      return res.json({ ok: true, message: "Certificación actualizada correctamente." });
    } catch (error) {
      console.error("Error editando certificación:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);

/* ==========================================================
   🔹 DETALLE DE UNA CERTIFICACIÓN
   GET /api/certificaciones/:id/detalle
   ========================================================== */
router.get(
  "/:id/detalle",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const certificacion = await Certificacion.findByPk(id, {
        include: [
          {
            model: Obra,
            as: "obra",
            attributes: ["id", "nombre", "reparticion"],
          },
          {
            model: CertificacionItem,
            as: "items",
            include: [
              {
                model: PliegoItem,
                as: "pliegoItem",
                attributes: [
                  "id",
                  "numeroItem",
                  "descripcionItem",
                  "unidadMedida",
                  "cantidad",
                  "costoUnitario",
                  "costoParcial",
                ],
              },
            ],
          },
        ],
      });

      if (!certificacion) {
        return res.status(404).json({
          ok: false,
          error: "Certificación no encontrada",
        });
      }

      // Total del proyecto para calcular % del certificado
      const pliegoItems = await PliegoItem.findAll({
        where: { obraId: certificacion.obra_id },
        attributes: ["costoParcial"],
        raw: true,
      });

      const totalProyecto = pliegoItems.reduce(
        (acc, i) => acc + Number(i.costoParcial || 0),
        0
      );

      const subtotal = Number(certificacion.subtotal || 0);
      const porcentajeFinanciero = totalProyecto
        ? Number(((subtotal / totalProyecto) * 100).toFixed(2))
        : 0;

      // Normalizamos respuesta
      const certificadoDTO = {
        id: certificacion.id,
        obraId: certificacion.obra_id,
        obraNombre: certificacion.obra?.nombre || "",
        reparticion: certificacion.obra?.reparticion || null,

        numero_certificado: certificacion.numero_certificado,
        fecha_certificacion: certificacion.fecha_certificacion,
        periodo_desde: certificacion.periodo_desde,
        periodo_hasta: certificacion.periodo_hasta,

        // Sin esto la pantalla no sabría si mostrar "Anular" o "Reactivar".
        anulada: Boolean(certificacion.anulada),

        subtotal,
        total_neto: Number(certificacion.total_neto || 0),

        deduccion_anticipo: Number(
          certificacion.deduccion_anticipo || 0
        ),
        fondo_reparo: Number(certificacion.fondo_reparo || 0),
        tasa_inspeccion: Number(certificacion.tasa_inspeccion || 0),
        sustitucion_fondo_reparo: Number(
          certificacion.sustitucion_fondo_reparo || 0
        ),

        gastos_generales: Number(certificacion.gastos_generales || 0),
        beneficios: Number(certificacion.beneficios || 0),
        iva: Number(certificacion.iva || 0),
        ingresos_brutos: Number(certificacion.ingresos_brutos || 0),

        totalProyecto,
        porcentajeFinanciero,
      };

      const itemsDTO = certificacion.items.map((ci) => ({
        id: ci.id,
        pliego_item_id: ci.PliegoItemId,
        numeroItem: ci.pliegoItem?.numeroItem || "",
        descripcion:
          ci.pliegoItem?.descripcionItem || "(sin descripción)",
        unidad: ci.pliegoItem?.unidadMedida || "",
        cantidad_total: Number(ci.pliegoItem?.cantidad || 0),
        avance_porcentaje: Number(ci.avance_porcentaje || 0),
        importe: Number(ci.importe || 0),
      }));

      return res.json({
        ok: true,
        certificado: certificadoDTO,
        items: itemsDTO,
      });
    } catch (error) {
      console.error("Error obteniendo detalle de certificación:", error);
      return res.status(500).json({
        ok: false,
        error: "Error al obtener detalle de certificación",
      });
    }
  }
);


/* ==========================================================
   🔹 ANULAR UNA CERTIFICACIÓN
   POST /api/certificaciones/:certId/anular

   No se borra: se marca. Un certificado borrado se lleva el rastro de que
   existió, y del otro lado —en costos— puede haber una factura emitida
   contra él. Anulado sale del acumulado y del tope del 100%, pero sigue
   estando para poder explicarlo.
   ========================================================== */
router.post(
  "/:certId/anular",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR]),
  async (req, res) => {
    try {
      const cert = await Certificacion.findByPk(req.params.certId);
      if (!cert) {
        return res.status(404).json({ ok: false, error: "Certificación no encontrada." });
      }
      if (cert.anulada) {
        return res.status(400).json({ ok: false, error: "La certificación ya está anulada." });
      }

      await cert.update({ anulada: true, anulada_por_id: req.user?.id || null });

      // Sin este aviso, del otro lado quedaría una factura pendiente de un
      // certificado que ya no existe.
      avisarSinEsperar({
        obraId: cert.obra_id, evento: "certificado_anulado", certificadoId: cert.id,
      });

      return res.json({ ok: true, message: "Certificación anulada." });
    } catch (error) {
      console.error("Error anulando certificación:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);


/* ==========================================================
   🔹 REACTIVAR UNA CERTIFICACIÓN ANULADA
   POST /api/certificaciones/:certId/reactivar

   Al volver a contar, sus ítems vuelven a ocupar lugar en el acumulado. Si
   mientras estuvo anulada se certificó ese mismo ítem en otro certificado,
   reactivarla pasaría del 100%: se comprueba antes y se explica cuál.
   ========================================================== */
router.post(
  "/:certId/reactivar",
  authMiddleware,
  hasRole([ROLES.ADMIN, ROLES.OPERATOR]),
  async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { certId } = req.params;

      const cert = await Certificacion.findByPk(certId, { transaction });
      if (!cert) throw { status: 404, message: "Certificación no encontrada." };
      if (!cert.anulada) throw { status: 400, message: "La certificación no está anulada." };

      const propios = await CertificacionItem.findAll({
        where: { CertificacionId: Number(certId) },
        raw: true,
        transaction,
      });

      const otras = await Certificacion.findAll({
        where: { obra_id: cert.obra_id, anulada: false, id: { [Op.ne]: Number(certId) } },
        attributes: ["id"],
        raw: true,
        transaction,
      });
      const otrasIds = otras.map((c) => c.id);

      for (const it of propios) {
        let totalOtras = 0;
        if (otrasIds.length) {
          totalOtras = await CertificacionItem.sum("avance_porcentaje", {
            where: { PliegoItemId: it.PliegoItemId, CertificacionId: otrasIds },
            transaction,
          });
        }
        const suma = Number(totalOtras || 0) + Number(it.avance_porcentaje || 0);
        if (suma > 100) {
          throw {
            status: 400,
            message:
              `No se puede reactivar: el ítem ${it.PliegoItemId} quedaría en ${suma}%. ` +
              `Mientras estuvo anulada se certificó ese ítem en otro certificado.`,
          };
        }
      }

      await cert.update({ anulada: false, anulada_por_id: null }, { transaction });
      await transaction.commit();

      avisarSinEsperar({
        obraId: cert.obra_id, evento: "certificado_reactivado", certificadoId: cert.id,
      });

      return res.json({ ok: true, message: "Certificación reactivada." });
    } catch (error) {
      await transaction.rollback();
      if (error && error.status) {
        return res.status(error.status).json({ ok: false, error: error.message });
      }
      console.error("Error reactivando certificación:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);


export default router;
