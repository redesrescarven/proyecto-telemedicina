const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const nodemailer = require('nodemailer');
const oracledb = require('oracledb');
require('dotenv').config();
const { ProxyAgent } = require('proxy-agent');

// Inicializar Firebase Admin SDK
try {
    const serviceAccount = require('../config/serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK inicializado correctamente.');
} catch (error) {
    console.error('Error al inicializar Firebase Admin SDK:', error);
    console.error('Asegúrate de que el archivo serviceAccountKey.json existe y es accesible en la carpeta "config".');
    process.exit(1);
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Importación de Routers
const prescriptionsRouter = require('./routes/prescriptions');
app.use('/api/prescriptions', prescriptionsRouter);

const autocompleteRouter = require('./routes/autocomplete_pa');
app.use('/api/autocomplete', autocompleteRouter);

const autocompleteSTRouter = require('./routes/autocomplete_st');
app.use('/api/autocomplete', autocompleteSTRouter);

// Middleware para verificar el rol del operador
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
    next();
};

// Ruta de prueba
app.get('/', (req, res) => {
    res.status(200).send('Bienvenido al Backend de Botón de Emergencia!');
});

// Endpoint para obtener las últimas emergencias
app.get('/api/emergencies', async (req, res) => {
    try {
        const appId = process.env.APP_ID || 'default-app-id';
        const emergencyRequestsRef = db.collection(`artifacts/${appId}/public/data/emergencyRequests`);
        const snapshot = await emergencyRequestsRef.get();
        let emergencies = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            emergencies.push({ id: doc.id, ...data });
        });

        emergencies.sort((a, b) => {
            const timestampA = a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(0);
            const timestampB = b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate() : new Date(0);
            return timestampB - timestampA;
        });

        res.status(200).json(emergencies);
    } catch (error) {
        console.error('Error al obtener emergencias:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener emergencias', error: error.message });
    }
});

// Endpoint para obtener un usuario por ID
app.get('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const appId = process.env.APP_ID || 'default-app-id';
        const userProfileRef = db.doc(`artifacts/${appId}/users/${userId}/profile/data`);
        const docSnap = await userProfileRef.get();
        if (!docSnap.exists) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        res.status(200).json({ id: docSnap.id, ...docSnap.data() });
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener usuario', error: error.message });
    }
});

// Endpoint para actualizar el estado de una emergencia (CORREGIDO)
app.put('/api/emergencies/:emergencyId/status', async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const { status, operatorId, operatorName } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'El campo status es requerido.' });
        }

        const appId = process.env.APP_ID || 'default-app-id';
        
        // 1. Intentar buscar en ruta con prefijo de artifacts
        let emergencyRef = db.doc(`artifacts/${appId}/public/data/emergencyRequests/${emergencyId}`);
        let docSnap = await emergencyRef.get();

        // Fallback: Si no existe en artifacts, buscar en colección raíz
        if (!docSnap.exists) {
            emergencyRef = db.doc(`emergencyRequests/${emergencyId}`);
            docSnap = await emergencyRef.get();
        }

        if (!docSnap.exists) {
            return res.status(404).json({ success: false, message: 'Emergencia no encontrada en Firestore.' });
        }

        const emergencyData = docSnap.data();

        // 🔒 VALIDACIÓN DE CIERRE: Solo si se intenta marcar como RESOLVED / CLOSED
        if (status === 'resolved' || status === 'closed') {
            const userId = emergencyData.userId;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    code: 'HISTORY_INCOMPLETE',
                    message: 'Acción bloqueada: Caso sin userId asociado.'
                });
            }

            // Buscar historia médica del usuario
            let historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${emergencyId}`);
            let historySnap = await historyRef.get();

            if (!historySnap.exists) {
                return res.status(400).json({
                    success: false,
                    code: 'HISTORY_INCOMPLETE',
                    message: 'Acción bloqueada: Debe existir una Historia Médica completa y cerrada (Fase 1 y Fase 2) para dar por concluido el caso.'
                });
            }

            const historyData = historySnap.data();
            const isFase1Complete = historyData.fase1?.isLocked === true;
            const isFase2Complete = historyData.fase2?.isLocked === true;

            if (!isFase1Complete || !isFase2Complete) {
                return res.status(400).json({
                    success: false,
                    code: 'HISTORY_INCOMPLETE',
                    message: 'Acción bloqueada: Debe existir una Historia Médica completa y cerrada (Fase 1 y Fase 2) para dar por concluido el caso.'
                });
            }
        }

        // 2. Construir historial de estados sin causar error de timestamp en arreglos
        const statusHistory = emergencyData.statusHistory || [];
        statusHistory.push({
            status: status,
            timestamp: new Date().toISOString(),
            operatorId: operatorId || 'unknown'
        });

        const updatePayload = {
            status: status,
            operatorName: operatorName || emergencyData.operatorName || '',
            statusHistory: statusHistory,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (status === 'in-progress') {
            updatePayload.attendedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        await emergencyRef.update(updatePayload);

        return res.status(200).json({ success: true, message: 'Estado actualizado correctamente.' });

    } catch (error) {
        console.error('❌ Error al actualizar estado de emergencia:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor al actualizar estado de emergencia', 
            error: error.message 
        });
    }
});

// Endpoint para obtener todos los usuarios (solo para administradores/supervisores)
app.get('/api/admin/users', checkOperatorRole(['administrador', 'supervisor']), async (req, res) => {
    try {
        const appId = process.env.APP_ID || 'default-app-id';
        console.log(`Backend: Recibida solicitud para /api/admin/users. Operador UID: ${req.operatorUid}`);
        const profilesQuery = db.collectionGroup('profile');
        const profilesSnapshot = await profilesQuery.get();

        const usersData = [];
        profilesSnapshot.forEach(docSnap => {
            const pathSegments = docSnap.ref.path.split('/');
            const appIdFromPath = pathSegments[1];
            const userIdFromPath = pathSegments[3];

            if (appIdFromPath === appId) {
                usersData.push({
                    id: userIdFromPath,
                    ...docSnap.data(),
                    isActive: docSnap.data().isActive !== undefined ? docSnap.data().isActive : true
                });
            }
        });
        console.log(`Backend: ${usersData.length} usuarios encontrados.`);
        res.status(200).json(usersData);
    } catch (error) {
        console.error('Backend: Error al obtener usuarios (admin):', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener usuarios', error: error.message });
    }
});

// Endpoint para enviar correos de solicitud de información de planes
app.post('/api/send-info-request', async (req, res) => {
    const { name, email, phone, cedula } = req.body;
    const appId = process.env.APP_ID || 'default-app-id';
    if (!name || !email || !phone) {
        return res.status(400).json({
            success: false,
            message: 'Faltan datos requeridos: name, email, phone'
        });
    }
    try {
        const salesEmailConfigRef = db.doc(`artifacts/${appId}/config/salesEmail`);
        const docSnap = await salesEmailConfigRef.get();
        if (!docSnap.exists) {
            console.error('Configuración de correo no encontrada en Firestore');
            return res.status(500).json({
                success: false,
                message: 'Configuración de correo no disponible'
            });
        }

        const config = docSnap.data();
        const salesEmailAddress = config.salesEmailAddress || 'ventas@rescarven.net';

        const mailOptions = {
            from: `"Botón de Emergencia" <${process.env.EMAIL_USER || 'info@rescarven.net'}>`,
            to: salesEmailAddress,
            subject: 'Nueva Solicitud de Información - Botón de Emergencia',
            html: `
                <h2>Nueva solicitud de información</h2>
                <p>Un usuario ha solicitado más información sobre los planes:</p>
                
                <h3>Datos del usuario:</h3>
                <ul>
                    <li><strong>Nombre:</strong> ${name}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Teléfono:</strong> ${phone}</li>
                    ${cedula ? `<li><strong>Cédula:</strong> ${cedula}</li>` : ''}
                </ul>
                
                <p>Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
                <p>APP ID: ${appId}</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Correo enviado a ${salesEmailAddress} para ${email}`);

        const logRef = db.collection(`artifacts/${appId}/emailLogs`).doc();
        await logRef.set({
            type: 'info_request',
            userEmail: email,
            userName: name,
            userPhone: phone,
            sentTo: salesEmailAddress,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'sent'
        });

        res.status(200).json({
            success: true,
            message: 'Solicitud procesada correctamente'
        });
    } catch (error) {
        console.error('Error al procesar solicitud:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar la solicitud',
            error: error.message
        });
    }
});

// Endpoint para crear solicitud de telemedicina
app.post('/api/telemedicine/request', async (req, res) => {
  try {
    const { userId, userName, userEmail, userPhone, userCedula } = req.body;
    console.log('🔵 SOLICITUD_TELEMEDICINA_RECIBIDA:', req.body);

    if (!userId || !userName) {
      return res.status(400).json({
        success: false,
        message: 'Datos requeridos: userId, userName'
      });
    }

    const appId = process.env.APP_ID || 'default-app-id';
    const telemedicineRequestRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions`).doc();
    const caseId = telemedicineRequestRef.id;

    const telemedicineData = {
      id: caseId,
      caseNumber: `TM-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      userId,
      userName,
      userEmail: userEmail || '',
      userPhone: userPhone || '',
      userCedula: userCedula || '',
      latitude: req.body.latitude !== undefined ? req.body.latitude : null,
      longitude: req.body.longitude !== undefined ? req.body.longitude : null,
      emergencyId: null,
      type: 'direct',
      source: 'direct',
      status: 'requested',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log('🟡 CREANDO_DOCUMENTO_TELEMEDICINA:', telemedicineData);
    await telemedicineRequestRef.set(telemedicineData);
    console.log('🟢 DOCUMENTO_CREADO_EXITOSAMENTE - CaseID:', caseId);

    res.status(201).json({
      success: true,
      message: 'Solicitud de telemedicina creada exitosamente',
      sessionId: caseId,
      caseNumber: telemedicineData.caseNumber
    });
  } catch (error) {
    console.error('❌ ERROR_CREANDO_TELEMEDICINA:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Endpoint para enviar un mensaje en el chat
app.post('/api/telemedicine/sessions/:sessionId/messages', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { senderId, senderName, text, imageUrl } = req.body;
        console.log('Enviando mensaje para sesión:', sessionId, 'Datos:', req.body);

        if (!senderId || (!text && !imageUrl)) {
            return res.status(400).json({
                success: false,
                message: 'Datos requeridos: senderId y al menos texto o imagen'
            });
        }

        const appId = process.env.APP_ID || 'default-app-id';
        const messagesRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);

        const messageData = {
            senderId,
            senderName: senderName || 'Usuario',
            text: text || '',
            imageUrl: imageUrl || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const newMessageRef = await messagesRef.add(messageData);

        const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
        await sessionRef.update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMessage: imageUrl ? (text || '📷 Imagen enviada') : text,
            lastMessageTime: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('Mensaje enviado exitosamente:', newMessageRef.id);
        res.status(201).json({
            success: true,
            message: 'Mensaje enviado exitosamente',
            messageId: newMessageRef.id
        });
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({
            success: false,
            message: 'Error al enviar mensaje',
            error: error.message
        });
    }
});

// Endpoint para actualizar el estado de una sesión de telemedicina (CON TRANSACCIÓN Y VALIDACIÓN DE FASE 1 PARA EL CIERRE)
app.put('/api/telemedicine/sessions/:sessionId/status', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { status, operatorId, operatorName } = req.body;
        console.log('Actualizando estado de sesión:', sessionId, 'Nuevo estado:', status);

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'El campo "status" es requerido'
            });
        }

        const appId = process.env.APP_ID || 'default-app-id';
        const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);

        await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(sessionRef);
            if (!docSnap.exists) {
                throw new Error('NOT_FOUND');
            }

            const sessionData = docSnap.data();
            const currentStatus = sessionData.status;

            // 🔒 REINGRESO (telemedicine-session-recovery-loop): se permite unirse/reanudar
            // una sesión que ya está 'in-progress' (concurrencia multi-médico). Solo se
            // bloquea el reingreso cuando la sesión ya fue cerrada o escalada.
            if (status === 'in-progress') {
                const rejoinAllowed = currentStatus === 'requested' || currentStatus === 'in-progress';
                if (!rejoinAllowed) {
                    throw new Error('ALREADY_TAKEN');
                }
            }

            // 🔒 VALIDACIÓN DE CIERRE: Telemedicina solo exige Fase 1
            if (status === 'resolved' || status === 'closed') {
                const userId = sessionData.userId;
                const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${sessionId}`);
                const historySnap = await transaction.get(historyRef);

                if (!historySnap.exists || historySnap.data().fase1?.isLocked !== true) {
                    throw new Error('TELEMEDICINE_HISTORY_INCOMPLETE');
                }
            }

            const updateData = {
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (operatorId) updateData.operatorId = operatorId;
            if (operatorName) updateData.operatorName = operatorName;

            if (status === 'in-progress') {
                updateData.attendedAt = admin.firestore.FieldValue.serverTimestamp();

                // 🔒 TRAZABILIDAD MULTI-MÉDICO (telemedicine-session-recovery-loop):
                // se registra el último médico que se unió y la lista de operadores activos
                // para evitar bloqueos por reingreso y dar seguimiento de la atención.
                updateData.lastOperatorId = operatorId || sessionData.operatorId || '';
                updateData.lastOperatorName = operatorName || sessionData.operatorName || '';
                const existingOperators = Array.isArray(sessionData.operators) ? sessionData.operators : [];
                updateData.operators = existingOperators.concat([{
                    operatorId: updateData.lastOperatorId,
                    operatorName: updateData.lastOperatorName,
                    joinedAt: admin.firestore.FieldValue.serverTimestamp()
                }]);
            } else if (status === 'resolved' || status === 'closed') {
                updateData.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            }

            transaction.update(sessionRef, updateData);
        });

        console.log('Estado de sesión actualizado exitosamente:', sessionId, 'Estado:', status);

        res.status(200).json({
            success: true,
            message: `Estado de sesión actualizado a: ${status}`
        });
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ success: false, message: 'Sesión no encontrada.' });
        }
        if (error.message === 'ALREADY_TAKEN') {
            return res.status(409).json({ success: false, message: 'El caso ya ha sido aceptado por otro médico.' });
        }
        if (error.message === 'TELEMEDICINE_HISTORY_INCOMPLETE') {
            return res.status(400).json({
                success: false,
                code: 'HISTORY_INCOMPLETE',
                message: 'Acción bloqueada: Debe guardar la Historia Médica (Fase 1) para finalizar la consulta de Telemedicina.'
            });
        }
        console.error('Error al actualizar estado de sesión:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar estado',
            error: error.message
        });
    }
});

// Endpoint para obtener sesiones de telemedicina por usuario
app.get('/api/telemedicine/user/:userId/sessions', async (req, res) => {
    try {
        const { userId } = req.params;
        const appId = process.env.APP_ID || 'default-app-id';
        console.log('Obteniendo sesiones para usuario:', userId);

        const sessionsRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions`);
        const snapshot = await sessionsRef
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .get();

        const sessions = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            sessions.push({
                id: doc.id,
                ...data,
                timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
                updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null
            });
        });

        console.log(`Encontradas ${sessions.length} sesiones para usuario ${userId}`);
        res.status(200).json({ success: true, sessions });
    } catch (error) {
        console.error('Error al obtener sesiones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener sesiones',
            error: error.message
        });
    }
});

// Endpoint para verificar estado de usuario
app.get('/api/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const appId = process.env.APP_ID || 'default-app-id';
        const userProfileRef = db.doc(`artifacts/${appId}/users/${userId}/profile/data`);
        const docSnap = await userProfileRef.get();
        if (!docSnap.exists) {
            return res.status(404).json({
                isActive: false,
                message: 'Usuario no encontrado.'
            });
        }

        const userData = docSnap.data();
        res.status(200).json({
            isActive: userData.isActive !== false,
            lastEmergency: userData.lastEmergency || null
        });
    } catch (error) {
        console.error('Error al verificar estado de usuario:', error);
        res.status(500).json({
            isActive: false,
            message: 'Error interno al verificar estado de usuario',
            error: error.message
        });
    }
});

// Endpoint de escalado: Cambia status + envía mensaje con acción de cierre + Crea solicitud en Emergencias Médicas
app.post('/api/telemedicine/:sessionId/escalate-to-emergency', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { doctorId, doctorName, reason } = req.body;
    const appId = process.env.APP_ID || 'default-app-id';

    const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
        return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    const sessionData = sessionSnap.data();

    // 1. Actualizar status de la sesión de telemedicina
    await sessionRef.update({
      status: 'escalated',
      escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
      escalatedBy: doctorName || 'Médico',
      escalationReason: reason || 'El médico determinó que requiere atención presencial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Crear solicitud en la cola de Emergencias Médicas Domiciliarias
    const emergencyRef = db.collection(`artifacts/${appId}/public/data/emergencyRequests`).doc(sessionId);
    await emergencyRef.set({
        userId: sessionData.userId,
        userName: sessionData.userName,
        userCedula: sessionData.userCedula || '',
        userPhone: sessionData.userPhone || '',
        userEmail: sessionData.userEmail || '',
        status: 'pending',
        source: 'escalated_telemedicine',
        escalatedFromSessionId: sessionId,
        escalatedByDoctor: doctorName || 'Médico',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Enviar mensaje de sistema con acción de cierre para la APP móvil
    const messagesRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
    await messagesRef.add({
      text: '🚨 Este caso ha sido ESCALADO a Emergencia Médica Domiciliaria. El chat se cerrará automáticamente.',
      sender: 'system',
      senderName: 'Sistema',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      action: 'close_chat',
      meta: {
        reason: 'escalated_to_emergency',
        escalatedBy: doctorName || 'Médico'
      }
    });

    console.log(`✅ Telemedicina ${sessionId} escalada + mensaje de cierre enviado`);
    
    res.status(200).json({ 
      success: true, 
      message: 'Caso escalado a emergencia',
      sessionId: sessionId 
    });
  } catch (error) {
    console.error('❌ Error escalando telemedicina:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ENDPOINT: Guardar/Actualizar Fase 1 (CORREGIDO docSnap.exists)
app.post('/api/medical-history/:historyId/phase1', checkOperatorRole(['medico', 'supervisormaster', 'administrador']), async (req, res) => {
    try {
        const { historyId } = req.params;
        const { userId, filledBy, filledByName, fields, isFinal, encounterType } = req.body;
        const appId = process.env.APP_ID || 'default-app-id';

        if (!userId) {
            return res.status(400).json({ success: false, message: 'El userId es obligatorio.' });
        }

        const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);
        const docSnap = await historyRef.get();

        // NOTA: docSnap.exists es un booleano, sin paréntesis ()
        if (docSnap.exists && docSnap.data().fase1?.isLocked === true) {
            return res.status(403).json({
                success: false,
                message: 'La Fase 1 de esta historia clínica ya está cerrada y no se puede modificar.'
            });
        }

        await historyRef.set({
            userId,
            encounterType: encounterType || 'emergency_direct',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            fase1: {
                filledBy: filledBy || 'medico',
                filledByName: filledByName || 'Médico',
                completedAt: isFinal ? admin.firestore.FieldValue.serverTimestamp() : (docSnap.exists ? docSnap.data().fase1?.completedAt || null : null),
                fields: fields || {},
                isLocked: isFinal || false
            },
            status: isFinal ? 'completed_phase1' : 'in_progress'
        }, { merge: true });

        res.status(200).json({ 
            success: true, 
            message: isFinal ? 'Fase 1 cerrada y bloqueada' : 'Borrador de Fase 1 guardado' 
        });
    } catch (error) {
        console.error('❌ Error guardando Fase 1:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ENDPOINT: Guardar/Actualizar Fase 2 (CORREGIDO docSnap.exists)
app.post('/api/medical-history/:historyId/phase2', checkOperatorRole(['medico', 'supervisormaster', 'administrador']), async (req, res) => {
    try {
        const { historyId } = req.params;
        const { userId, filledBy, filledByName, fields, isFinal } = req.body;
        const appId = process.env.APP_ID || 'default-app-id';

        if (!userId) {
            return res.status(400).json({ success: false, message: 'El userId es obligatorio.' });
        }

        const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);
        const docSnap = await historyRef.get();

        // NOTA: docSnap.exists es un booleano, sin paréntesis ()
        if (docSnap.exists && docSnap.data().fase2?.isLocked === true) {
            return res.status(403).json({ success: false, message: 'La Fase 2 de esta historia ya fue completada y cerrada.' });
        }

        await historyRef.set({
            userId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            fase2: {
                filledBy: filledBy || 'medico',
                filledByName: filledByName || 'Médico',
                completedAt: isFinal ? admin.firestore.FieldValue.serverTimestamp() : (docSnap.exists ? docSnap.data().fase2?.completedAt || null : null),
                fields: fields || {},
                isLocked: isFinal || false
            },
            status: isFinal ? 'completed' : 'in_progress'
        }, { merge: true });

        res.status(200).json({ 
            success: true, 
            message: isFinal ? 'Fase 2 cerrada y bloqueada - Historia completada' : 'Borrador de Fase 2 guardado' 
        });
    } catch (error) {
        console.error('❌ Error guardando Fase 2:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// ENDPOINT: Cerrar definitivamente una historia
app.put('/api/medical-history/:historyId/close', checkOperatorRole(['medico']), async (req, res) => {
    try {
        const { historyId } = req.params;
        const { userId, closedBy } = req.body;
        const appId = process.env.APP_ID || 'default-app-id';

        const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);

        await historyRef.update({
            status: 'closed',
            closedBy,
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            'fase1.isLocked': true,
            'fase2.isLocked': true
        });

        res.status(200).json({ success: true, message: 'Historia médica cerrada definitivamente' });
    } catch (error) {
        console.error('❌ Error cerrando historia:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para obtener historia médica completa (EXCLUSIVO PARA ROL MÉDICO)
app.get('/api/medical-history/:historyId', checkOperatorRole(['medico']), async (req, res) => {
    try {
        const { historyId } = req.params;
        const { userId } = req.query;
        const appId = process.env.APP_ID || 'default-app-id';

        const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);
        const docSnap = await historyRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ success: false, message: 'Historia no encontrada' });
        }

        const data = docSnap.data();
        res.status(200).json({
            success: true,
            history: {
                id: historyId,
                ...data
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo historia médica:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para buscar historias médicas
app.get('/api/medical-history/search', checkOperatorRole(['medico']), async (req, res) => {
    try {
        const { userId, startDate, endDate, cedula, encounterType } = req.query;
        const appId = process.env.APP_ID || 'default-app-id';

        let query = userId ?
            db.collection(`artifacts/${appId}/users/${userId}/medicalHistory`) :
            db.collectionGroup('medicalHistory');

        const snapshot = await query.get();

        let historias = [];
        snapshot.forEach(doc => {
            const data = doc.data();

            if (cedula && data.fase1?.fields?.cedula !== cedula) return;
            if (encounterType && data.encounterType !== encounterType) return;

            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
            if (startDate && createdAt < new Date(startDate)) return;
            if (endDate && createdAt > new Date(endDate)) return;

            historias.push({
                id: doc.id,
                userId: data.userId,
                ...data
            });
        });

        historias.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        res.status(200).json({ success: true, historias, total: historias.length });
    } catch (error) {
        console.error('❌ Error buscando historias médicas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

// Endpoint: resumen ligero del historial médico de un paciente (EXCLUSIVO PARA ROL MÉDICO)
app.get('/api/medical-history/patient/:userId/summary', checkOperatorRole(['medico']), async (req, res) => {
    try {
        const { userId } = req.params;
        const appId = process.env.APP_ID || 'default-app-id';

        // 🔒 MANEJO DEFENSIVO: userId inválido o ausente NO debe llegar a Firestore
        if (!userId || typeof userId !== 'string' || userId.trim() === '' || userId.trim().toLowerCase() === 'null' || userId.includes('/') || userId.includes('..')) {
            console.warn(`Backend: userId inválido en resumen de historial: "${userId}"`);
            return res.status(400).json({ success: false, message: 'userId inválido o ausente.' });
        }

        const historyRef = db.collection(`artifacts/${appId}/users/${userId.trim()}/medicalHistory`);
        const snapshot = await historyRef.get();

        const historias = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const fase1 = data.fase1 || {};
            const fase2 = data.fase2 || {};
            const fields1 = fase1.fields || {};
            const fields2 = fase2.fields || {};
            const sourceDate = data.createdAt || data.date || fields1.completedAt || fase1.completedAt || data.updatedAt;

            historias.push({
                id: doc.id,
                createdAt: toIsoString(sourceDate),
                date: toIsoString(sourceDate),
                symptoms: fields1.sintomas || fields1.motivoConsulta || fields1.motivo || '',
                diagnosis: fields2.diagnosticoFinal || fields2.diagnostico || fields1.diagnostico || ''
            });
        });

        historias.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

        res.status(200).json({ success: true, historias, total: historias.length });
    } catch (error) {
        console.error('❌ Error obteniendo resumen de historial médico del paciente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO DE REPORTES E INTELIGENCIA MÉDICA (analytics-reports-loop)
// ═══════════════════════════════════════════════════════════════════════════════

// Normaliza un parámetro de fecha (startDate/endDate). Si llega en formato
// 'YYYY-MM-DD' (date-only) se interpreta como inicio de día (endOfDay=false)
// o fin de día 23:59:59.999 (endOfDay=true) para que el rango amplio incluya
// registros reales del día completo.
const normalizeReportDate = (value, endOfDay) => {
    if (!value) return null;
    const str = String(value).trim();
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-').map(Number);
        if (endOfDay) return new Date(y, m - 1, d, 23, 59, 59, 999);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
};

// Convierte Timestamp/Date/string/number a epoch (ms). Devuelve null si no es convertible.
const toEpochMs = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value.toDate === 'function') {
        try { return value.toDate().getTime(); } catch (e) { return null; }
    }
    if (value instanceof Date && !isNaN(value.getTime())) return value.getTime();
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed.getTime();
    }
    return null;
};

// Coincidencia del filtro Tipo de Servicio (telemedicina | emergencia | todos).
const matchesServiceType = (encounterType, serviceType) => {
    if (!serviceType || serviceType === 'todos') return true;
    const type = String(encounterType || '').toLowerCase();
    if (serviceType === 'telemedicina') return type.includes('telemedicine');
    if (serviceType === 'emergencia') return type.includes('emergencia') || type.includes('emergency');
    return true;
};

// Coincidencia del filtro Cédula/Paciente (patientId): userId, cédula o nombre.
const matchesPatient = (data, patientId) => {
    if (!patientId) return true;
    const norm = String(patientId).trim().toLowerCase();
    if (!norm) return true;
    const fields1 = (data && data.fase1 && data.fase1.fields) || {};
    return Boolean(
        (data.userId && String(data.userId).toLowerCase() === norm) ||
        (fields1.cedula && String(fields1.cedula).toLowerCase() === norm) ||
        (fields1.nombre && String(fields1.nombre).toLowerCase().includes(norm))
    );
};

// Coincidencia del filtro Médico (doctorId): filledBy / filledById / filledByName
// de Fase 1 o Fase 2 (identificador o nombre parcial).
const matchesDoctor = (data, doctorId) => {
    if (!doctorId) return true;
    const norm = String(doctorId).trim().toLowerCase();
    if (!norm) return true;
    const candidates = [
        data.fase1 && data.fase1.filledBy,
        data.fase1 && data.fase1.filledById,
        data.fase1 && data.fase1.filledByName,
        data.fase2 && data.fase2.filledBy,
        data.fase2 && data.fase2.filledById,
        data.fase2 && data.fase2.filledByName
    ];
    return candidates.some((c) => c && String(c).trim().toLowerCase().includes(norm));
};

// Materializa las historias médicas de todas las subcolecciones (collectionGroup)
// aplicando los filtros de fecha/paciente/médico/tipo de servicio. Devuelve una
// lista enriquecida con metadatos normalizados (fecha ISO, paciente, cédula,
// médico, diagnóstico, estado) ordenados por fecha descendente.
const fetchReportHistories = async ({ startDate, endDate, patientId, doctorId, serviceType }) => {
    const appId = process.env.APP_ID || 'default-app-id';
    const start = normalizeReportDate(startDate, false);
    const end = normalizeReportDate(endDate, true);

    const snapshot = await db.collectionGroup('medicalHistory').get();
    const historias = [];

    snapshot.forEach(doc => {
        const pathSegments = (doc.ref && doc.ref.path ? doc.ref.path : '').split('/');
        const docAppId = pathSegments.length >= 2 ? pathSegments[1] : null;
        if (docAppId && docAppId !== appId) return;

        const data = doc.data();
        if (!data || typeof data !== 'object') return;

        const createdAtMs = toEpochMs(data.createdAt || data.updatedAt || (data.fase1 && data.fase1.completedAt));
        if (start && createdAtMs !== null && createdAtMs < start.getTime()) return;
        if (end && createdAtMs !== null && createdAtMs > end.getTime()) return;

        if (!matchesServiceType(data.encounterType, serviceType)) return;
        if (!matchesPatient(data, patientId)) return;
        if (!matchesDoctor(data, doctorId)) return;

        const userId = data.userId || (pathSegments.length >= 4 ? pathSegments[3] : '');
        const fields1 = (data.fase1 && data.fase1.fields) || {};
        const fields2 = (data.fase2 && data.fase2.fields) || {};

        historias.push({
            id: doc.id,
            userId,
            pacienteNombre: [fields1.nombre, fields1.apellidos].filter(Boolean).join(' ') || data.userName || 'N/A',
            cedula: fields1.cedula || data.userCedula || '',
            encounterType: data.encounterType || 'emergency_direct',
            fecha: toIsoString(data.createdAt || data.date || (data.fase1 && data.fase1.completedAt) || data.updatedAt),
            medico: (data.fase2 && (data.fase2.filledByName || data.fase2.filledBy)) ||
                    (data.fase1 && (data.fase1.filledByName || data.fase1.filledBy)) || '',
            diagnosticoFinal: fields2.diagnosticoFinal || fields2.diagnostico || fields1.diagnostico || '',
            status: data.status || ((data.fase2 && data.fase2.isLocked) ? 'completed' : (data.fase1 && data.fase1.isLocked) ? 'completed_phase1' : 'in_progress'),
            fase1Locked: data.fase1 && data.fase1.isLocked === true,
            fase2Locked: data.fase2 && data.fase2.isLocked === true,
            raw: data
        });
    });

    historias.sort((a, b) => {
        const tA = a.fecha ? new Date(a.fecha).getTime() : 0;
        const tB = b.fecha ? new Date(b.fecha).getTime() : 0;
        return tB - tA;
    });

    return historias;
};

// ▶ ENDPOINT: Reporte Detallado (Auditoría y Detalle)
// Filtros opcionales: startDate, endDate, patientId, doctorId, serviceType.
app.get('/api/reports/detailed', checkOperatorRole(['medico', 'supervisormaster', 'administrador', 'supervisor']), async (req, res) => {
    try {
        const { startDate, endDate, patientId, doctorId, serviceType } = req.query;
        const historias = await fetchReportHistories({ startDate, endDate, patientId, doctorId, serviceType });

        res.status(200).json({
            success: true,
            total: historias.length,
            historias: historias.map(({ raw, ...meta }) => meta)
        });
    } catch (error) {
        console.error('❌ Error en reporte detallado:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ▶ ENDPOINT: Reporte Analítico (Dashboard BI)
// KPIs + diagnósticos top 5 (CIE-10), distribución por género, grupos etarios
// y volumen operativo diario en formato estructurado para gráficos.
app.get('/api/reports/analytics', checkOperatorRole(['medico', 'supervisormaster', 'administrador', 'supervisor']), async (req, res) => {
    try {
        const { startDate, endDate, patientId, doctorId, serviceType } = req.query;
        const historias = await fetchReportHistories({ startDate, endDate, patientId, doctorId, serviceType });

        const uniquePatients = new Set();
        const genderCount = { masculino: 0, femenino: 0, otro: 0, 'No especificado': 0 };
        const ageCount = { '0-17': 0, '18-29': 0, '30-44': 0, '45-59': 0, '60+': 0, 'Desconocido': 0 };
        const diagnoseMap = new Map();
        const volumeMap = new Map();

        // Volumen: ceros para los últimos 30 días (para que el gráfico de línea
        // de barras se estire completo y no quede con huecos)
        const now = new Date();
        for (let i = 29; i >= 0; i -= 1) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            volumeMap.set(d.toISOString().slice(0, 10), 0);
        }

        historias.forEach(h => {
            const raw = h.raw || {};
            if (h.userId) uniquePatients.add(h.userId);

            // Género (defensivo: campos genero/sexo, valores M/F/masculino/femenino)
            const genderRaw = String((raw.fase1 && (raw.fase1.fields.genero || raw.fase1.fields.sexo)) || '').trim().toLowerCase();
            let genderKey = 'No especificado';
            if (['m', 'masculino', 'male', 'hombre', 'h'].includes(genderRaw)) genderKey = 'masculino';
            else if (['f', 'femenino', 'female', 'mujer'].includes(genderRaw)) genderKey = 'femenino';
            else if (genderRaw && genderRaw !== 'no especificado') genderKey = 'otro';
            genderCount[genderKey] += 1;

            // Grupo etario (fecha nacimiento vs fecha de la atención)
            const birthMs = toEpochMs(raw.fase1 && raw.fase1.fields.fechaNacimiento);
            if (birthMs !== null) {
                const birthDate = new Date(birthMs);
                const refMs = h.fecha ? new Date(h.fecha).getTime() : now.getTime();
                const ref = isNaN(refMs) ? now : new Date(refMs);
                let age = ref.getFullYear() - birthDate.getFullYear();
                const m = ref.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && ref.getDate() < birthDate.getDate())) age -= 1;
                age = Math.max(age, 0);
                if (age <= 17) ageCount['0-17'] += 1;
                else if (age <= 29) ageCount['18-29'] += 1;
                else if (age <= 44) ageCount['30-44'] += 1;
                else if (age <= 59) ageCount['45-59'] += 1;
                else ageCount['60+'] += 1;
            } else {
                ageCount['Desconocido'] += 1;
            }

            // Diagnósticos recurrentes (prioridad: diagnóstico final de Fase 2)
            const rawFields2 = (raw.fase2 && raw.fase2.fields) || {};
            const rawFields1 = (raw.fase1 && raw.fase1.fields) || {};
            const dx = String(rawFields2.diagnosticoFinal || rawFields2.diagnostico || rawFields1.diagnostico || '').trim();
            if (dx) diagnoseMap.set(dx, (diagnoseMap.get(dx) || 0) + 1);

            // Volumen operativo por día (clave UTC para determinismo)
            const fechaMs = h.fecha ? new Date(h.fecha).getTime() : null;
            if (fechaMs !== null && !isNaN(fechaMs)) {
                const key = new Date(fechaMs).toISOString().slice(0, 10);
                volumeMap.set(key, (volumeMap.get(key) || 0) + 1);
            }
        });

        const topDiagnoses = Array.from(diagnoseMap.entries())
            .map(([diagnosis, count]) => ({ diagnosis, count }))
            .sort((a, b) => b.count - a.count || String(a.diagnosis).localeCompare(String(b.diagnosis)))
            .slice(0, 5);

        const genderDistribution = Object.entries(genderCount).map(([gender, count]) => ({ gender, count }));
        const ageDistribution = Object.entries(ageCount).map(([ageGroup, count]) => ({ ageGroup, count }));
        const volumeByDate = Array.from(volumeMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));

        const completedCount = historias.filter(h => {
            if (String(h.encounterType).includes('telemedicine')) return h.fase1Locked;
            return h.fase1Locked && h.fase2Locked;
        }).length;

        res.status(200).json({
            success: true,
            analytics: {
                kpis: {
                    totalAtenciones: historias.length,
                    pacientesUnicos: uniquePatients.size,
                    conDiagnostico: historias.filter(h => h.diagnosticoFinal).length,
                    completadas: completedCount
                },
                topDiagnoses,
                genderDistribution,
                ageDistribution,
                volumeByDate
            }
        });
    } catch (error) {
        console.error('❌ Error en reporte analítico:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para validar afiliación
app.post('/api/check-affiliation', async (req, res) => {
    const { cedula } = req.body;
    if (!cedula) {
        return res.status(400).json({ success: false, message: "Cédula requerida" });
    }

    try {
        const API_BASE_URL = 'http://localhost:5001';

        const [resRMP, resAMB] = await Promise.all([
            fetch(`${API_BASE_URL}/info_afi_rmp?nciafi=${cedula}`),
            fetch(`${API_BASE_URL}/info_afi_amb?nciafi=${cedula}`)
        ]);

        const dataRMP = await resRMP.json();
        const dataAMB = await resAMB.json();

        let isAffiliated = false;

        if (dataRMP && dataRMP.data && dataRMP.data.length > 0) {
            const found = dataRMP.data.find(item => item.STATUS === 'ACTIVO');
            if (found) isAffiliated = true;
        }

        if (!isAffiliated && dataAMB && dataAMB.data && dataAMB.data.length > 0) {
            const found = dataAMB.data.find(item => item.STATUS === 'ACTIVO');
            if (found) isAffiliated = true;
        }

        console.log(`[Validación Afiliación] Cédula: ${cedula} -> Resultado: ${isAffiliated ? 'AFILIADO' : 'NO AFILIADO'}`);
        res.json({ success: true, isAffiliated });
    } catch (error) {
        console.error("Error validando afiliación:", error);
        res.status(500).json({ success: false, message: "Error interno al validar" });
    }
});

// ENDPOINT: Verificar si una historia médica está completa para permitir cierre
app.get('/api/medical-history/:historyId/check-completion', async (req, res) => {
  try {
    const { historyId } = req.params;
    const { userId } = req.query;
    const appId = process.env.APP_ID || 'default-app-id';

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId requerido' });
    }

    const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);
    const docSnap = await historyRef.get();

    if (!docSnap.exists) {
      return res.status(200).json({ success: true, isComplete: false, message: 'Historia no encontrada' });
    }

    const data = docSnap.data();

    // Verificar condiciones de completitud
    const fase1Complete = data.fase1?.isLocked === true;
    const fase2Complete = data.fase2?.isLocked === true;

    let isComplete = false;

    if (data.encounterType === 'telemedicine') {
      // Telemedicina: Basta con Fase 1 bloqueada
      isComplete = fase1Complete;
    } else {
      // Emergencia directa o escalada: Fase 1 y Fase 2 bloqueadas
      isComplete = fase1Complete && fase2Complete;
    }

    res.status(200).json({
      success: true,
      isComplete,
      fase1Locked: fase1Complete,
      fase2Locked: fase2Complete,
      encounterType: data.encounterType
    });

  } catch (error) {
    console.error('❌ Error verificando completitud:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ENDPOINT: Consulta directa a Oracle (CIE10)
app.get('/api/cie10/search', async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.trim().length < 3) {
        return res.json([]);
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: 'proddta',
            password: 'proddta',
            connectString: '192.168.100.2:1521/jde'
        });

        const searchTerm = q.trim();
        
        const sql = `
            SELECT CEDESCIE 
            FROM F58CIEAG
            WHERE UPPER(CEDESCIE) LIKE '%' || UPPER(:searchTerm) || '%'
            AND ROWNUM <= 20
            ORDER BY CEDESCIE
        `;

        const result = await connection.execute(sql, { searchTerm: searchTerm });

        const formattedData = result.rows.map(row => ({
            descripcion: row[0]
        }));

        res.json(formattedData);

    } catch (err) {
        console.error("❌ Error consultando Oracle CIE10:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            await connection.close();
        }
    }
});

// Signaling y Videollamada
app.post('/api/webrtc/:sessionId/offer', async (req, res) => {
    const { sessionId } = req.params;
    const { offer } = req.body;
    try {
        await db.collection('telemedicine_sessions').doc(sessionId)
                .collection('webrtc').doc('signaling')
                .set({ offer, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        res.status(200).send({ message: "Offer guardada" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/telemedicine/sessions/:sessionId/request-video-call', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const appId = process.env.APP_ID || 'default-app-id';
        const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);

        const docSnap = await sessionRef.get();
        if (!docSnap.exists) return res.status(404).send("Sesión no encontrada");

        await sessionRef.update({
            videoCallStatus: 'requested_video',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ success: true, message: "Invitación de video enviada" });
    } catch (error) {
        console.error("Error solicitando video:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/telemedicine/sessions/:sessionId/end-video-call', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const appId = process.env.APP_ID || 'default-app-id';
        const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);

        await sessionRef.update({
            videoCallStatus: 'finished',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ success: true, message: "Videollamada finalizada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Chat de WEBVIEW
const chatRoutes = require('./routes/chat');
app.use('/chat', chatRoutes);

// Iniciar el servidor Express (solo cuando se ejecuta directamente; exporta `app` para la suite de pruebas)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;

