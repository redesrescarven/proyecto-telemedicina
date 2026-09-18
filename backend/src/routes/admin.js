// backend/src/routes/admin.js
// ============================================
// RUTAS ADMINISTRATIVAS DE USUARIOS
// Delete (GET /api/admin/users ya vive en server.js):
//   DELETE /api/admin/users/:uid        → elimina el usuario (Firebase Auth + Firestore)
//   PATCH  /api/admin/users/:uid/password → cambia la contraseña del usuario
//   PATCH  /api/admin/users/:uid/status   → activa/inactiva el usuario (Auth disabled + Firestore)
// Todas protegidas con rol 'administrador' y devuelven SIEMPRE JSON estructurado.
// ============================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { checkOperatorRole } = require('./middleware');

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'default-app-id';

const requireAdmin = checkOperatorRole(['administrador']);

const isValidUid = (uid) =>
    typeof uid === 'string' && !!uid.trim() && !uid.includes('/') && !uid.includes('..');

// DELETE /api/admin/users/:uid
router.delete('/users/:uid', requireAdmin, async (req, res) => {
    try {
        const { uid } = req.params;
        if (!isValidUid(uid)) {
            return res.status(400).json({ success: false, message: 'UID de usuario inválido o ausente.' });
        }
        const cleanUid = uid.trim();

        // 1. Eliminar en Firebase Auth (idempotente ante user-not-found).
        let authDeleted = true;
        try {
            await admin.auth().deleteUser(cleanUid);
        } catch (authError) {
            if (authError.code && String(authError.code).includes('user-not-found')) {
                authDeleted = false;
            } else {
                throw authError;
            }
        }

        // 2. Eliminar documentos en Firestore (perfil móvil + usuario de sistema).
        const firestoreRefs = [
            db.doc(`artifacts/${APP_ID}/users/${cleanUid}/profile/data`),
            db.doc(`artifacts/${APP_ID}/systemUsers/${cleanUid}`)
        ];
        const existence = await Promise.all(
            firestoreRefs.map((ref) => ref.get().then((snap) => snap.exists))
        );
        await Promise.all(firestoreRefs.map((ref) => ref.delete()));

        if (!authDeleted && !existence.some(Boolean)) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        res.status(200).json({ success: true, message: 'Usuario eliminado correctamente.' });
    } catch (error) {
        console.error('❌ Error eliminando usuario:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/admin/users/:uid/password
router.patch('/users/:uid/password', requireAdmin, async (req, res) => {
    try {
        const { uid } = req.params;
        const { newPassword } = req.body || {};

        if (!isValidUid(uid)) {
            return res.status(400).json({ success: false, message: 'UID de usuario inválido o ausente.' });
        }
        if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
            return res.status(400).json({ success: false, message: 'El campo newPassword es obligatorio.' });
        }
        if (newPassword.trim().length < 6) {
            return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        }

        await admin.auth().updateUser(uid.trim(), { password: newPassword.trim() });

        res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        console.error('❌ Error cambiando contraseña:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/admin/users/:uid/status
router.patch('/users/:uid/status', requireAdmin, async (req, res) => {
    try {
        const { uid } = req.params;
        const { status, isActive } = req.body || {};

        if (!isValidUid(uid)) {
            return res.status(400).json({ success: false, message: 'UID de usuario inválido o ausente.' });
        }

        let newStatus;
        if (typeof isActive === 'boolean') {
            newStatus = isActive ? 'active' : 'inactive';
        } else if (status && ['active', 'inactive'].includes(status)) {
            newStatus = status;
        } else {
            return res.status(400).json({
                success: false,
                message: 'El campo status (active|inactive) o isActive (booleano) es obligatorio.'
            });
        }

        const disabled = newStatus === 'inactive';
        const cleanUid = uid.trim();

        // 1. Firebase Auth: deshabilitar/habilitar la cuenta (bloquea el inicio de sesión).
        await admin.auth().updateUser(cleanUid, { disabled });

        // 2. Firestore: sincronizar perfil móvil + usuario de sistema.
        const updates = {
            status: newStatus,
            isActive: !disabled,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await db.doc(`artifacts/${APP_ID}/users/${cleanUid}/profile/data`).set(updates, { merge: true });
        await db.doc(`artifacts/${APP_ID}/systemUsers/${cleanUid}`).set(updates, { merge: true });

        res.status(200).json({
            success: true,
            message: disabled ? 'Usuario inactivado correctamente.' : 'Usuario activado correctamente.'
        });
    } catch (error) {
        console.error('❌ Error actualizando estado del usuario:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;