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


// ✅ IMPORTACIÓN DEL ROUTER (Verifica que la ruta sea correcta)
// const prescriptionsRouter = require('./routes/prescriptions');
// app.use('/api/prescriptions', prescriptionsRouter);

const prescriptionsRouter = require('./routes/prescriptions');
app.use('/api/prescriptions', prescriptionsRouter);

const autocompleteRouter = require('./routes/autocomplete_pa');
app.use('/api/autocomplete', autocompleteRouter);

const autocompleteSTRouter = require('./routes/autocomplete_st');
app.use('/api/autocomplete', autocompleteSTRouter);

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

// Endpoint para actualizar el estado de una emergencia
app.put('/api/emergencies/:emergencyId/status', async (req, res) => {
    try {
        const { emergencyId } = req.params;
        const { status, operatorId } = req.body;
        if (!status) {
            return res.status(400).json({ message: 'El campo "status" es requerido.' });
        }

        const appId = process.env.APP_ID || 'default-app-id';
        const emergencyRef = db.doc(`artifacts/${appId}/public/data/emergencyRequests/${emergencyId}`);

        const docSnap = await emergencyRef.get();
        if (!docSnap.exists) {
            return res.status(404).json({ message: 'Emergencia no encontrada.' });
        }

        const currentData = docSnap.data();
        const statusHistory = currentData.statusHistory || [];

        statusHistory.push({
            status: status,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            operatorId: operatorId || 'unknown'
        });

        await emergencyRef.update({
            status: status,
            statusHistory: statusHistory,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ message: 'Estado de emergencia actualizado correctamente.' });
    } catch (error) {
        console.error('Error al actualizar estado de emergencia:', error);
        res.status(500).json({ message: 'Error interno del servidor al actualizar estado de emergencia', error: error.message });
    }
});

// Middleware para verificar el rol del operador
const checkOperatorRole = (requiredRoles) => async (req, res, next) => {
    const operatorRoleHeader = req.headers['x-operator-rol'];
    const operatorUidHeader = req.headers['x-operator-uid'];
    if (!operatorRoleHeader || !operatorUidHeader) {
        console.warn('Backend: Acceso denegado a endpoint de admin: Faltan cabeceras de rol o UID.');
        return res.status(403).json({ message: 'Acceso denegado: Credenciales de operador requeridas.' });
    }
    if (!requiredRoles.includes(operatorRoleHeader)) {
        console.warn(`Backend: Acceso denegado a endpoint de admin para rol: ${operatorRoleHeader}. Roles requeridos: ${requiredRoles.join(', ')}`);
        return res.status(403).json({ message: 'Acceso denegado: Rol insuficiente.' });
    }
    req.operatorUid = operatorUidHeader;
    next();
};

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
      emergencyId: null,  // ✅ FORZAR null - NO asociar con emergencia
      type: 'direct',     // ✅ FORZAR 'direct' - NO 'from_emergency'
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

app.post('/api/telemedicine/sessions/:sessionId/messages', async (req, res) => {
try {
const { sessionId } = req.params;
const { senderId, senderName, text, imageUrl } = req.body; // ← NUEVO: imageUrl
console.log('Enviando mensaje para sesión:', sessionId, 'Datos:', req.body);
    if (!senderId || !text) {
        return res.status(400).json({
            success: false,
            message: 'Datos requeridos: senderId, text'
        });
    }

    const appId = process.env.APP_ID || 'default-app-id';
    const messagesRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);

    const messageData = {
        senderId,
        senderName: senderName || 'Usuario',
        text,
        imageUrl: imageUrl || null, // ← NUEVO: guardar imageUrl si existe
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    const newMessageRef = await messagesRef.add(messageData);

    const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
    await sessionRef.update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: imageUrl ? (text || '📷 Imagen enviada') : text, // ← NUEVO: mejorar lastMessage si hay imagen
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

// Endpoint para enviar un mensaje en el chat
app.post('/api/telemedicine/sessions/:sessionId/messages', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { senderId, senderName, text } = req.body;
        console.log('Enviando mensaje para sesión:', sessionId, 'Datos:', req.body);

        if (!senderId || !text) {
            return res.status(400).json({
                success: false,
                message: 'Datos requeridos: senderId, text'
            });
        }

        const appId = process.env.APP_ID || 'default-app-id';
        const messagesRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);

        const messageData = {
            senderId,
            senderName: senderName || 'Usuario',
            text,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const newMessageRef = await messagesRef.add(messageData);

        const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
        await sessionRef.update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMessage: text,
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

// Endpoint para actualizar el estado de una sesión de telemedicina
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

        const updateData = {
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (operatorId) updateData.operatorId = operatorId;
        if (operatorName) updateData.operatorName = operatorName;

        if (status === 'in-progress') {
            updateData.attendedAt = admin.firestore.FieldValue.serverTimestamp();
        } else if (status === 'resolved' || status === 'closed') {
            updateData.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        await sessionRef.update(updateData);
        console.log('Estado de sesión actualizado exitosamente:', sessionId, 'Estado:', status);

        res.status(200).json({
            success: true,
            message: `Estado de sesión actualizado a: ${status}`
        });
    } catch (error) {
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

// 🆕 Endpoint de escalado: Cambia status + envía mensaje de sistema
app.post('/api/telemedicine/:sessionId/escalate-to-emergency', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { doctorId, doctorName, reason } = req.body;
    const appId = process.env.APP_ID || 'default-app-id';
    
    // 1️⃣ Actualizar status de la sesión de telemedicina
    const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
    await sessionRef.update({
      status: 'escalated',
      escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
      escalatedBy: doctorName,
      escalationReason: reason || 'El médico determinó que requiere atención presencial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2️⃣ ✅ ENVIAR MENSAJE DE SISTEMA para que la app móvil cierre el chat
    const messagesRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
    await messagesRef.add({
      text: '🚨 Este caso ha sido ESCALADO a Emergencia Médica Domiciliaria. El chat se cerrará automáticamente.',
      sender: 'system',
      senderName: 'Sistema',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      action: 'close_chat' // 🔑 Campo especial para que la app móvil detecte que debe cerrar
    });

    console.log(`✅ Telemedicina ${sessionId} escalada + mensaje de sistema enviado`);
    
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

// 🆕 Endpoint de escalado: Cambia status + envía mensaje con acción de cierre
app.post('/api/telemedicine/:sessionId/escalate-to-emergency', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { doctorId, doctorName, reason } = req.body;
    const appId = process.env.APP_ID || 'default-app-id';

    // 1️⃣ Actualizar status de la sesión de telemedicina
    const sessionRef = db.doc(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
    await sessionRef.update({
      status: 'escalated',
      escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
      escalatedBy: doctorName,
      escalationReason: reason || 'El médico determinó que requiere atención presencial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2️⃣ ✅ ENVIAR MENSAJE DE SISTEMA con acción de cierre
    const messagesRef = db.collection(`artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
    await messagesRef.add({
      text: '🚨 Este caso ha sido ESCALADO a Emergencia Médica Domiciliaria. El chat se cerrará automáticamente.',
      sender: 'system',
      senderName: 'Sistema',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      action: 'close_chat',  // 🔑 CAMPO CLAVE: indica a la app que debe cerrar
      meta: {
        reason: 'escalated_to_emergency',
        escalatedBy: doctorName
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

// 🆕 ENDPOINT: Guardar/Actualizar Fase 1 (Permite borradores)
app.post('/api/medical-history/:historyId/phase1', async (req, res) => {
try {
const { historyId } = req.params;
const { userId, filledBy, filledByName, fields, isFinal, encounterType } = req.body;
const appId = process.env.APP_ID || 'default-app-id';
    const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);
    const docSnap = await historyRef.get();

    if (!docSnap.exists) {
        await historyRef.set({
            userId,
            encounterType: encounterType || 'emergency_direct', // ✅ CAMBIO: Default a emergency_direct
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            fase1: {
                filledBy,
                filledByName,
                completedAt: isFinal ? admin.firestore.FieldValue.serverTimestamp() : null,
                fields,
                isLocked: isFinal || false
            },
            fase2: {
                filledBy: null,
                filledByName: null,
                completedAt: null,
                fields: {
                    examenFisico: '',
                    diagnosticoFinal: '',
                    tratamientoFinal: '',
                    observaciones: ''
                },
                isLocked: false
            },
            status: isFinal ? 'completed_phase1' : 'in_progress'
        });
    } else {
        // ✅ Si el documento ya existe, NO sobrescribir encounterType
        await historyRef.update({
            'fase1.filledBy': filledBy,
            'fase1.filledByName': filledByName,
            'fase1.fields': fields,
            'fase1.completedAt': isFinal ? admin.firestore.FieldValue.serverTimestamp() : (docSnap.data().fase1?.completedAt || null),
            'fase1.isLocked': isFinal || false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    res.status(200).json({ 
        success: true, 
        message: isFinal ? 'Fase 1 cerrada y bloqueada' : 'Borrador de Fase 1 guardado' 
    });
} catch (error) {
    console.error('❌ Error guardando Fase 1:', error);
    res.status(500).json({ success: false, error: error.message });
}
});

// 🆕 ENDPOINT: Guardar/Actualizar Fase 2 (Permite borradores)
app.post('/api/medical-history/:historyId/phase2', async (req, res) => {
    try {
        const { historyId } = req.params;
        const { userId, filledBy, filledByName, fields, isFinal } = req.body;
        const appId = process.env.APP_ID || 'default-app-id';

        const historyRef = db.doc(`artifacts/${appId}/users/${userId}/medicalHistory/${historyId}`);
        const docSnap = await historyRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ success: false, message: 'Historia no encontrada' });
        }

        await historyRef.update({
            'fase2.filledBy': filledBy,
            'fase2.filledByName': filledByName,
            'fase2.fields': fields,
            'fase2.completedAt': isFinal ? admin.firestore.FieldValue.serverTimestamp() : (docSnap.data().fase2?.completedAt || null),
            'fase2.isLocked': isFinal || false,
            status: isFinal ? 'completed' : 'in_progress',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ 
            success: true, 
            message: isFinal ? 'Fase 2 cerrada y bloqueada - Historia completada' : 'Borrador de Fase 2 guardado' 
        });
    } catch (error) {
        console.error('❌ Error guardando Fase 2:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🆕 ENDPOINT: Cerrar definitivamente una historia
app.put('/api/medical-history/:historyId/close', async (req, res) => {
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

// Endpoint para obtener historia médica completa
app.get('/api/medical-history/:historyId', async (req, res) => {
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
app.get('/api/medical-history/search', async (req, res) => {
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

// 🆕 ENDPOINT: Verificar si una historia médica está completa para permitir cierre
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
      // Telemedicina normal: Basta con Fase 1 bloqueada
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

// 🆕 ENDPOINT: Consulta directa a Oracle (CIE10) - Solo descripción
app.get('/api/cie10/search', async (req, res) => {
    const { q } = req.query;
    
    // Validar entrada mínima (3 letras para evitar resultados masivos)
    if (!q || q.trim().length < 3) {
        return res.json([]);
    }

    let connection;
    try {
        // 1. Conectar a Oracle
        connection = await oracledb.getConnection({
            user: 'proddta',
            password: 'proddta',
            connectString: '192.168.100.2:1521/jde'
        });

        const searchTerm = q.trim();
        
        // 2. Query SQL directa a F58CIEAG - Solo traemos la descripción
        const sql = `
            SELECT CEDESCIE 
            FROM F58CIEAG
            WHERE UPPER(CEDESCIE) LIKE '%' || UPPER(:searchTerm) || '%'
            AND ROWNUM <= 20
            ORDER BY CEDESCIE
        `;

        // 3. Ejecutar con bind variable
        const result = await connection.execute(sql, { searchTerm: searchTerm });

        // 4. Formatear respuesta: SOLO la descripción (lo que verá el médico)
        const formattedData = result.rows.map(row => ({
            descripcion: row[0]  // ✅ Solo retornamos lo que importa
        }));

        res.json(formattedData);

    } catch (err) {
        console.error("❌ Error consultando Oracle CIE10:", err);
        res.status(500).json({ error: err.message });
    } finally {
        // Cerrar conexión siempre para liberar sesiones en Oracle
        if (connection) {
            await connection.close();
        }
    }
});

// Localiza el endpoint de WebRTC offer en server.js y simplifícalo así:
app.post('/api/webrtc/:sessionId/offer', async (req, res) => {
    const { sessionId } = req.params;
    const { offer } = req.body;
    try {
        // El cerebro dicta: Guardamos la oferta en la subcolección de la sesión
        await db.collection('telemedicine_sessions').doc(sessionId)
                .collection('webrtc').doc('signaling')
                .set({ offer, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        res.status(200).send({ message: "Offer guardada" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- BLOQUE COMPLETO: GESTIÓN DE VIDEOLLAMADAS TELEMEDICINA ---

/**
 * Endpoint para que el médico solicite videollamada.
 * Cambia videoCallStatus a 'requested_video' dentro de la sesión in-progress.
 */
app.post('/api/telemedicine/sessions/:sessionId/request-video-call', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const sessionRef = db.collection('artifacts').document(process.env.APP_ID || 'default-app-id')
                             .collection('telemedicine_sessions').document(sessionId);

        const doc = await sessionRef.get();
        if (!doc.exists) return res.status(404).send("Sesión no encontrada");

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

/**
 * Endpoint para finalizar videollamada y limpiar estados.
 */
app.post('/api/telemedicine/sessions/:sessionId/end-video-call', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const sessionRef = db.collection('artifacts').document(process.env.APP_ID || 'default-app-id')
                             .collection('telemedicine_sessions').document(sessionId);

        await sessionRef.update({
            videoCallStatus: 'finished',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ success: true, message: "Videollamada finalizada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Iniciar el servidor Express
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Endpoints de telemedicina disponibles:`);
    console.log(`- POST /api/telemedicine/request`);
    console.log(`- GET /api/telemedicine/sessions/:sessionId/messages`);
    console.log(`- POST /api/telemedicine/sessions/:sessionId/messages`);
    console.log(`- PUT /api/telemedicine/sessions/:sessionId/status`);
    console.log(`- GET /api/telemedicine/user/:userId/sessions`);
    console.log(`🎥 NUEVOS ENDPOINTS VIDEO LLAMADA:`);
    console.log(`- POST /api/telemedicine/sessions/:sessionId/request-video-call`);
    console.log(`- POST /api/telemedicine/sessions/:sessionId/accept-video-call`);
    console.log(`- POST /api/telemedicine/sessions/:sessionId/start-video-call`);
    console.log(`- POST /api/telemedicine/sessions/:sessionId/end-video-call`);
    console.log(`📡 WEBRTC SIGNALING:`);
    console.log(`- POST /api/webrtc/:sessionId/offer`);
    console.log(`- POST /api/webrtc/:sessionId/answer`);
    console.log(`- POST /api/webrtc/:sessionId/ice-candidate`);
});


// Agregar Chat de WEBVIEW
const chatRoutes = require('./routes/chat');
app.use('/chat', chatRoutes);

