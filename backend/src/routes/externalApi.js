// backend/src/routes/externalApi.js
// ============================================
// API EXTERNA PARA INTEGRADORES (Partner / Health-Tech)
// Autenticación por API Key secreta (cabecera `x-api-key`).
// No depende de las cabeceras internas de rol de operador (`x-operator-*`).
// ============================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

const db = admin.firestore();

const getApiKey = () => process.env.EXTERNAL_API_KEY || 'rescarven-external-dev-key';

const requireApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== getApiKey()) {
        console.warn('External API: Acceso denegado: API Key inválida o ausente.');
        return res.status(401).json({ success: false, message: 'Acceso denegado: API Key inválida o ausente.' });
    }
    next();
};

// Helper: normaliza timestamps de Firestore (Timestamp/Date/string/number) a ISO-8601
const toIsoString = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value.toDate === 'function') {
        try {
            return value.toDate().toISOString();
        } catch (error) {
            return null;
        }
    }
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
};

// ============================================
// ENDPOINT: Ping / health autenticado
// ============================================
router.get('/health', requireApiKey, (req, res) => {
    res.status(200).json({
        success: true,
        service: 'rescarven-external-api',
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ENDPOINT: Listado ligero de emergencias
// ============================================
router.get('/emergencies', requireApiKey, async (req, res) => {
    try {
        const appId = process.env.APP_ID || 'default-app-id';
        const emergencyRequestsRef = db.collection(`artifacts/${appId}/public/data/emergencyRequests`);
        const snapshot = await emergencyRequestsRef.get();

        const emergencies = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            emergencies.push({
                id: doc.id,
                userId: data.userId || null,
                status: data.status || 'pending',
                name: data.name || data.patientName || null,
                phone: data.phone || data.patientPhone || null,
                timestamp: toIsoString(data.timestamp),
                operatorName: data.operatorName || null
            });
        });

        emergencies.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        res.status(200).json({ success: true, total: emergencies.length, emergencies });
    } catch (error) {
        console.error('External API: Error al obtener emergencias:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al obtener emergencias', error: error.message });
    }
});

// ============================================
// ENDPOINT: Crear solicitud de telemedicina externa
// Atención autosuficiente con datos de paciente embebidos:
// no consulta ni escribe en la colección `users`.
// ============================================
router.post('/telemedicine-sessions', requireApiKey, async (req, res) => {
    try {
        // Normalización de campos según contrato externo (incluye los alias de la App Móvil)
        const str = (value) => (value === null || value === undefined ? '' : String(value).trim());
        const userName = str(req.body.userName || req.body.nombre || req.body.patientName);
        const userCedula = str(req.body.userCedula || req.body.cedula || req.body.userId);
        const userPhone = str(req.body.userPhone || req.body.telefono || req.body.patientPhone);
        const userEmail = str(req.body.userEmail || req.body.email || req.body.patientEmail);
        const motivo = str(req.body.motivo || req.body.chiefComplaint);
        const userId = 'EXT-' + userCedula;

        if (!userCedula && !userName) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos básicos del paciente: se requiere al menos cedula o nombre.'
            });
        }

        // Correlativo de caso con el formato utilizado por la App Móvil
        const caseNumber = `TM-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        // Origen de la solicitud (sobrescribible por el integrador para trazabilidad)
        const source = req.body.source || 'CALL_CENTER_API';

        // Timestamps nativos de Firestore para que la UI los renderice correctamente.
        const nowTimestamp = admin.firestore.FieldValue.serverTimestamp();

        // Colección nativa de la App Móvil: el documento se escribe única y exclusivamente
        // en la ruta anidada `artifacts/default-app-id/public/data/telemedicineSessions`
        // con el esquema nativo (sin espejo en emergencyRequests).
        const sessionRef = db
            .collection('artifacts')
            .doc('default-app-id')
            .collection('public')
            .doc('data')
            .collection('telemedicineSessions')
            .doc();

        await sessionRef.set({
            caseNumber,
            userName,
            userCedula,
            userPhone,
            userEmail,
            userId,
            type: 'direct',
            status: 'requested',
            source,
            emergencyId: null,
            latitude: 10.4820125,
            longitude: -66.8641175,
            timestamp: nowTimestamp,
            createdAt: nowTimestamp,
            updatedAt: nowTimestamp,
            motivo
        });

        res.status(201).json({
            success: true,
            sessionId: sessionRef.id,
            caseNumber,
            userId,
            userName,
            userCedula,
            userPhone,
            userEmail,
            type: 'direct',
            status: 'requested',
            source,
            emergencyId: null,
            latitude: 10.4820125,
            longitude: -66.8641175,
            motivo
        });
    } catch (error) {
        console.error('External API: Error al crear sesión de telemedicina:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al crear sesión de telemedicina', error: error.message });
    }
});

// ============================================
// ENDPOINT: Crear solicitud de emergencia externa
// Inyecta la emergencia directamente en la ruta nativa
// `artifacts/default-app-id/public/data/emergencyRequests`.
// ============================================
router.post('/emergency-requests', requireApiKey, async (req, res) => {
    try {
        // Normalización de campos según contrato externo (incluye los alias de la App Móvil)
        const str = (value) => (value === null || value === undefined ? '' : String(value).trim());
        const userName = str(req.body.userName || req.body.nombre || req.body.patientName);
        const userCedula = str(req.body.userCedula || req.body.cedula || req.body.userId || req.body.patientCedula);
        const userPhone = str(req.body.userPhone || req.body.telefono || req.body.patientPhone);
        const userEmail = str(req.body.userEmail || req.body.email || req.body.patientEmail);
        const motivo = str(req.body.motivo || req.body.chiefComplaint);
        const userId = 'EXT-' + userCedula;

        if (!userCedula && !userName) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos básicos del paciente: se requiere al menos cedula o nombre.'
            });
        }

        const source = req.body.source || 'CALL_CENTER_API';
        const latitude = req.body.latitude || 10.4819902;
        const longitude = req.body.longitude || -66.8641199;

        const requestRef = db
            .collection('artifacts')
            .doc('default-app-id')
            .collection('public')
            .doc('data')
            .collection('emergencyRequests')
            .doc();

        await requestRef.set({
            isAffiliate: false,
            latitude,
            longitude,
            status: 'pending',
            timestamp: Date.now(),
            userCedula,
            userEmail,
            userName,
            userPhone,
            userId,
            wantsMoreInfo: false,
            motivo,
            source
        });

        res.status(201).json({
            success: true,
            requestId: requestRef.id,
            userId,
            userName,
            userCedula,
            userPhone,
            userEmail,
            status: 'pending',
            source,
            latitude,
            longitude,
            motivo
        });
    } catch (error) {
        console.error('External API: Error al crear solicitud de emergencia:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al crear solicitud de emergencia', error: error.message });
    }
});

module.exports = router;