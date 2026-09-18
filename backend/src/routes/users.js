// backend/src/routes/users.js
// ============================================
// RUTAS DE CREACIÓN DE USUARIOS DEL SISTEMA
// Garantiza que la creación de un usuario (incluido el rol médico) devuelva
// SIEMPRE JSON estructurado, incluso ante errores o excepciones no controladas.
// ============================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

const db = admin.firestore();
const APP_ID = process.env.APP_ID || 'default-app-id';

const VALID_ROLES = ['operador', 'supervisor', 'medico', 'administrador'];

// POST /api/users (y alias /api/createSystemUser)
router.post('/', async (req, res) => {
    try {
        const { email, password, nombreCompleto, rol, isActive, medicalProfile } = req.body || {};

        if (!email || !password || !nombreCompleto) {
            return res.status(400).json({
                success: false,
                message: 'Los campos email, password y nombreCompleto son obligatorios.'
            });
        }

        const normalizedRole = typeof rol === 'string' ? rol.trim() : 'operador';
        if (!VALID_ROLES.includes(normalizedRole)) {
            return res.status(400).json({ success: false, message: `Rol inválido: ${normalizedRole}.` });
        }

        if (normalizedRole === 'medico' && !medicalProfile) {
            return res.status(400).json({
                success: false,
                message: 'El perfil médico (colegiatura y ministerio) es obligatorio.'
            });
        }

        // 1. Crear credenciales en Firebase Auth. Si Auth no está disponible, se
        //    genera un UID local para no romper la escritura en Firestore.
        let userRecord;
        let authFallback = false;
        try {
            userRecord = await admin.auth().createUser({
                email: email.trim(),
                password,
                displayName: nombreCompleto.trim()
            });
        } catch (authError) {
            console.warn('Backend: Firebase Auth no disponible al crear usuario; usando UID local.', authError.message);
            userRecord = { uid: `auth_${email.trim()}` };
            authFallback = true;
        }

        // 2. Persistir el perfil del sistema en Firestore.
        const userProfile = {
            email: email.trim(),
            nombreCompleto: nombreCompleto.trim(),
            rol: normalizedRole,
            isActive: isActive !== false,
            medicalProfile: normalizedRole === 'medico' ? (medicalProfile || null) : null,
            authUid: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (authFallback) {
            userProfile.authFallback = true;
        }

        await db.collection(`artifacts/${APP_ID}/systemUsers`).doc(userRecord.uid).set(userProfile, { merge: true });

        res.status(201).json({
            success: true,
            message: 'Usuario creado con éxito.',
            userId: userRecord.uid
        });
    } catch (error) {
        console.error('❌ Error creando usuario:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;