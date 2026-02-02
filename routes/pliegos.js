// backend/routes/pliegos.js
import express from 'express';
import PliegoItem from '../models/PliegoItem.js'; 
import { authMiddleware } from "./auth.js";
import { hasRole, ROLES } from "../middlewares/authorization.js";

const router = express.Router();

// Middleware para calcular el Costo Parcial (Cantidad * Unitario) antes de guardar
const calcularCostoParcial = (req, res, next) => {
    const { cantidad, costoUnitario } = req.body;
    if (cantidad && costoUnitario) {
        req.body.costoParcial = parseFloat(cantidad) * parseFloat(costoUnitario);
    }
    next();
};

/* ================================================
   1. CREAR ITEM DE PLIEGO (POST /obras/:obraId/pliego-item)
   ================================================ */
router.post("/:obraId/pliego-item", 
    authMiddleware, 
    hasRole([ROLES.ADMIN, ROLES.OPERATOR]), 
    calcularCostoParcial, 
    async (req, res) => {
        const { obraId } = req.params;
        const { ItemGeneralId, numeroItem, cantidad, costoUnitario, costoParcial } = req.body; 
        
        try {
            // 🛑 CORRECCIÓN CLAVE: Aseguramos que el ID sea un entero
            const finalItemGeneralId = parseInt(ItemGeneralId); 
            
            if (isNaN(finalItemGeneralId) || finalItemGeneralId === 0) {
                 return res.status(400).json({ message: "El ID del ítem maestro no es válido." });
            }

            if (!cantidad || !costoUnitario) {
                return res.status(400).json({ message: "Datos de cantidad y costo unitario incompletos." });
            }

            const newItem = await PliegoItem.create({ 
                obraId, 
                ItemGeneralId: finalItemGeneralId, // 👈 Usamos el valor PARSEADO
                numeroItem, 
                cantidad, 
                costoUnitario, 
                costoParcial
            });
            res.status(201).json(newItem);
        } catch (error) {
            console.error("Error al crear ItemPliego:", error);
            res.status(500).json({ message: "Error al guardar el ítem de pliego." });
        }
    }
);

/* ================================================
   2. LISTAR ITEMS DE PLIEGO (GET /obras/:obraId/pliego)
   ================================================ */
router.get("/:obraId/pliego", authMiddleware, hasRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const obraId = req.params.obraId;
        const items = await PliegoItem.findAll({ 
            where: { obraId },
            order: [['numeroItem', 'ASC']]
        });
        res.json(items);
    } catch (error) {
        console.error("Error al listar items de pliego:", error);
        res.status(500).json({ message: "Error al obtener la plantilla de pliego." });
    }
});

export default router;