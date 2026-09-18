// backend/src/routes/middleware.js
// ============================================
// MIDDLEWARE COMPARTIDO DE OPERADOR
// Verifica las cabeceras x-operator-rol / x-operator-uid y bloquea cuentas
// marcadas como inactivas (status === 'inactive' | 'disabled' | isActive === false).
// ============================================

const admin = require('firebase-admin');

const db = admin.firestore();

const isInactiveProfile = (data) => {
    if (!data) return false;
    return data.status === 'inactive' || data.status === 'disabled' || data.isActive === false;
};

// Middleware para verificar el rol del operador y bloquear usuarios inactivos.
const checkOperatorRole = (requiredRoles) => async (req, res, next) => {
    const operatorRoleHeader = req.headers['x-operator-rol'];
    const operatorUidHeader = req.headers['x-operator-uid'];
    if (!operatorRoleHeader || !operatorUidHeader) {
        console.warn('Backend: Acceso denegado a endpoint: Faltan cabeceras de rol o UID.');
        return res.status(403).json({ message: 'Acceso denegado: Credenciales de operador requeridas.' });
    }
    if (!requiredRoles.includes(operatorRoleHeader)) {
        console.warn(`Backend: Acceso denegado para rol: ${operatorRoleHeader}. Roles requeridos: ${requiredRoles.join(', ')}`);
        return res.status(403).json({ message: 'Acceso denegado: Rol insuficiente.' });
    }
    req.operatorUid = operatorUidHeader;
    req.operatorRole = operatorRoleHeader;

    // 🔒 Bloqueo de cuentas inactivas: se consulta el perfil del operador y si está
    //    inactivo se rechaza el acceso a la API con 403.
    try {
        const appId = process.env.APP_ID || 'default-app-id';
        const sysSnap = await db.doc(`artifacts/${appId}/systemUsers/${operatorUidHeader}`).get();
        const profileSnap = await db.doc(`artifacts/${appId}/users/${operatorUidHeader}/profile/data`).get();
        const profileData = sysSnap.exists ? sysSnap.data() : (profileSnap.exists ? profileSnap.data() : null);
        if (isInactiveProfile(profileData)) {
            console.warn(`Backend: Cuenta inactiva denegada para el operador ${operatorUidHeader}.`);
            return res.status(403).json({ success: false, message: 'Cuenta inactivada. Contacte al administrador' });
        }
    } catch (lookupError) {
        // Si no se puede verificar el estado, se permite el acceso (no bloquear por un fallo de lectura).
        console.warn('Backend: No se pudo verificar el estado del operador; se permite el acceso.', lookupError.message);
    }

    next();
};

module.exports = { checkOperatorRole };