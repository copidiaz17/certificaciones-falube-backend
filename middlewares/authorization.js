// middlewares/authorization.js

// 🔹 Roles en español, alineados con la tabla Usuario
const ROLES = {
  ADMIN: "administrador",
  OPERATOR: "usuario",
  VIEWER: "usuario",   // si querés después podés crear "lector" aparte
};

/**
 * Middleware para restringir el acceso basado en el rol del usuario.
 */
function hasRole(allowedRoles) {
  return (req, res, next) => {
    // Usuario no viene en el token
    if (!req.user || !req.user.rol) {
      return res
        .status(403)
        .json({ error: "Permiso denegado. Rol no definido en el token." });
    }

    const userRole = String(req.user.rol).toLowerCase().trim();

    // Normalizamos allowedRoles
    const rolesToCheck = Array.isArray(allowedRoles)
      ? allowedRoles
      : allowedRoles
      ? [allowedRoles]
      : [];

    // Si no se pasó ninguna lista de roles, dejo pasar a cualquiera logueado
    if (!rolesToCheck.length) {
      return next();
    }

    const lowerCaseAllowedRoles = rolesToCheck.map((role) =>
      String(role).toLowerCase().trim()
    );

    if (lowerCaseAllowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: "Permiso denegado. Su rol no tiene autorización para esta acción.",
    });
  };
}

export { hasRole, ROLES };
