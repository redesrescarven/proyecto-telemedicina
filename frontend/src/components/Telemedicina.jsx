// src/components/Telemedicina.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  getDocs,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';

import config, { getVideoCallUrl } from '../config';

import DiagnosticAutocomplete from './DiagnosticAutocomplete';
import VideoCallRoom from './VideoCallRoom';
// ✅ NUEVO: Importar el Modal de Recetas
import PrescriptionModal from './PrescriptionModal';


// Utilidad para convertir URLs en enlaces clickeables
const renderMessageText = (text) => {
  const urlRegex = new RegExp('https?://[^\\s<>"\']+', 'g');
  return text.split(urlRegex).map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline font-medium break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

// Utilidad para renderizar un campo etiqueta/valor en la vista de detalle de historia
const FieldDetail = ({ label, value }) => {
  const shown = (value === undefined || value === null || value === '') ? 'No registrado' : String(value);
  return (
    <p className="mb-1">
      <span className="font-semibold text-slate-600">{label}:</span>{' '}
      <span className={shown === 'No registrado' ? 'text-gray-400 italic' : 'text-gray-800'}>{shown}</span>
    </p>
  );
};

// Variable exacta que alimenta el campo 'Fecha:' del detalle de historia.
// El documento crudo puede guardar la fecha en distintos campos según el origen
// (telemedicina, emergencia directa o escalada), por lo que se resuelve con la
// misma precedencia que usa el backend en el resumen de historias.
const getHistoryDetailDate = (detail) =>
  detail?.date ||
  detail?.createdAt ||
  detail?.fase1?.completedAt ||
  detail?.updatedAt ||
  detail?.timestamp;

const Telemedicina = ({ user, db, operatorName, appId = "default-app-id", rol, setToast }) => {
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [videoCallStatus, setVideoCallStatus] = useState(null);
  const [chatRequests, setChatRequests] = useState([]);
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isHistorySaved, setIsHistorySaved] = useState(false);
  const [selectedImagesForHistory, setSelectedImagesForHistory] = useState([]);
  const messagesEndRef = useRef(null);
  
  // ✅ NUEVO: Estado para controlar la visibilidad del modal de recetas
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);

  // ✅ NUEVO: Estado para el modal de historial médico previo del paciente
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [patientHistory, setPatientHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // ✅ NUEVO (telemedicine-ui-detail-loop): Vista de detalle de historia por doble clic
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // ✅ NUEVO (telemedicine-session-recovery-loop): Dialogo de confirmación para reingreso/salida
  const [confirmDialog, setConfirmDialog] = useState(null);
	
  // ✅ CORRECCIÓN 1: useRef DENTRO del componente (no fuera)
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const emptyMedicalForm = {
    nombre: '',
    apellidos: '',
    cedula: '',
    fechaNacimiento: '',
    lugarNacimiento: '',
    nombreFamiliar: '',
    telefonos: '',
    motivoConsulta: '',
    antecedentes: '',
    ta: '',
    fc: '',
    fr: '',
    glic: '',
    sato2: '',
    sintomas: '',
    diagnostico: '',
    tratamiento: '',
    traslado: ''
  };

  const [medicalForm, setMedicalForm] = useState(emptyMedicalForm);

  // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): Impresión Diagnóstica obligatoria
  const [diagnosticError, setDiagnosticError] = useState(false);

  const preloadPatientData = async (sessionId) => {
    try {
      if (!sessionId || !db) return;
      const sessionRef = doc(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) {
        const data = sessionSnap.data();
        const [nombre, ...resto] = (data.userName || '').trim().split(' ');
        const apellidos = resto.join(' ');
        setMedicalForm(prev => ({
          ...prev,
          nombre: nombre || '',
          apellidos: apellidos || '',
          cedula: data.userCedula || '',
          telefonos: data.userPhone || ''
        }));
      }
    } catch (error) {
      console.error("Error al precargar datos desde sesión:", error);
    }
  };

  const formatDate = (timestamp) => {
    if (timestamp === null || timestamp === undefined || timestamp === '') return "Fecha inválida";
    try {
      if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString();
      }
      if (timestamp instanceof Date) {
        if (isNaN(timestamp.getTime())) return "Fecha inválida";
        return timestamp.toLocaleString();
      }
      if (typeof timestamp === 'number') {
        if (isNaN(timestamp)) return "Fecha inválida";
        return new Date(timestamp).toLocaleString();
      }
      if (typeof timestamp === 'string') {
        const parsed = new Date(timestamp);
        if (isNaN(parsed.getTime())) return "Fecha inválida";
        return parsed.toLocaleString();
      }
      if (typeof timestamp === 'object') {
        const seconds = timestamp._seconds ?? timestamp.seconds;
        const nanoseconds = timestamp._nanoseconds ?? timestamp.nanoseconds;
        if (typeof seconds === 'number') {
          const msSeconds = seconds * 1000;
          const msNanos = typeof nanoseconds === 'number' ? nanoseconds / 1e6 : 0;
          return new Date(msSeconds + msNanos).toLocaleString();
        }
      }
      return "Fecha inválida";
    } catch (e) {
      return "Fecha inválida";
    }
  };

  const toggleImageForHistory = (imageUrl) => {
    setSelectedImagesForHistory(prev => {
      if (prev.includes(imageUrl)) {
        return prev.filter(url => url !== imageUrl);
      } else {
        return [...prev, imageUrl];
      }
    });
  };

  // Escuchar solicitudes de telemedicina
  useEffect(() => {
    if (!user || !db || !rol) return;
    if (rol !== 'medico') return;
    
    const chatRequestsRef = collection(db, 'artifacts', appId, 'public', 'data', 'telemedicineSessions');
    const q = query(
      chatRequestsRef,
      where('status', 'in', ['requested', 'in-progress']),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const uniqueRequests = new Map();
      snapshot.forEach(doc => {
        if (!uniqueRequests.has(doc.id)) {
          uniqueRequests.set(doc.id, {
            id: doc.id,
            ...doc.data()
          });
        }
      });
      const requests = Array.from(uniqueRequests.values());
      setChatRequests(requests);
    }, (error) => {
      console.error("Error al escuchar solicitudes de telemedicina:", error);
    });

    return () => unsubscribe();
  }, [user, db, rol, appId, setToast]);

  // Escuchar mensajes del chat activo
  useEffect(() => {
    if (!selectedEmergency || !showChatModal) return;
    const sessionId = selectedEmergency.id;
    const messagesRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
    const unsubscribeMessages = onSnapshot(
      query(messagesRef, orderBy('timestamp', 'asc')),
      (snapshot) => {
        const msgList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(msgList);
        setTimeout(scrollToBottom, 100);
      },
      (error) => {
        console.error("Error al escuchar mensajes:", error);
      }
    );
    return () => unsubscribeMessages();
  }, [selectedEmergency, showChatModal, appId]);

  useEffect(() => {
    if (!showChatModal) {
      setSelectedImagesForHistory([]);
    }
  }, [showChatModal]);

  const handleStartChat = async (req) => {
    if (rol !== 'medico') {
      setToast({ message: "No tienes permiso para aceptar chats.", type: 'error' });
      return;
    }
    try {
      const sessionId = req.id;
      const emergencyId = req.emergencyId;
      const safeOperatorName = operatorName || 'Operador';
      
      await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, sessionId), {
        status: 'in-progress',
        operatorId: user.uid,
        operatorName: safeOperatorName,
        attendedAt: serverTimestamp()
      });

      if (emergencyId) {
        await updateDoc(doc(db, `artifacts/${appId}/public/data/emergencyRequests`, emergencyId), {
          telemedicinaStatus: 'in-progress',
          telemedicinaAttendedBy: safeOperatorName,
          telemedicinaAttendedAt: serverTimestamp(),
          chatActive: true
        });
      }

      setSelectedEmergency(req);
      // 🔒 CORRECCIÓN: No arrastrar el diagnóstico/historia de la consulta anterior.
      setMedicalForm({ ...emptyMedicalForm });
      setDiagnosticError(false);
      await preloadPatientData(req.id);
      setShowChatModal(true);
      setIsHistorySaved(false);
      setSelectedImagesForHistory([]);

      setToast({ message: "Chat iniciado con éxito.", type: 'success' });
      setTimeout(scrollToBottom, 500);
    } catch (error) {
      console.error("Error al iniciar chat:", error);
      setToast({ message: `Error al iniciar el chat: ${error.message}`, type: 'error' });
    }
  };

  // ✅ NUEVO (telemedicine-session-recovery-loop): Advertencia de concurrencia antes de retomar
  const openRejoinConfirmation = (req) => {
    const attending = req.operatorName || req.lastOperatorName || (req.operatorId ? `ID ${req.operatorId}` : 'otro médico');
    setConfirmDialog({
      title: '⚠️ Sesión ya en curso',
      message: `Atención: Esta sesión de telemedicina ya se encuentra en curso (atendida por ${attending}). ¿Deseas retomar o unirte a esta atención?`,
      confirmLabel: 'Sí, continuar/retomar',
      onConfirm: () => handleRejoinSession(req)
    });
  };

  // ✅ NUEVO (telemedicine-session-recovery-loop): Reingreso a una sesión en curso
  const handleRejoinSession = async (req) => {
    if (rol !== 'medico') {
      setToast({ message: "No tienes permiso para retomar chats.", type: 'error' });
      return;
    }
    try {
      const sessionId = req.id;
      const safeOperatorName = operatorName || 'Operador';

      await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, sessionId), {
        status: 'in-progress',
        operatorId: user.uid,
        operatorName: safeOperatorName,
        lastOperatorId: user.uid,
        lastOperatorName: safeOperatorName,
        rejoinedAt: serverTimestamp()
      });

      setSelectedEmergency(req);
      setMedicalForm({ ...emptyMedicalForm });
      setDiagnosticError(false);
      await preloadPatientData(req.id);
      setShowChatModal(true);
      setIsHistorySaved(false);
      setSelectedImagesForHistory([]);

      setToast({ message: "Has retomado la sesión de telemedicina.", type: 'success' });
      setTimeout(scrollToBottom, 500);
    } catch (error) {
      console.error("Error al retomar sesión:", error);
      setToast({ message: `Error al retomar la sesión: ${error.message}`, type: 'error' });
    }
  };

  // ✅ NUEVO (telemedicine-session-recovery-loop): Salida sin cerrar la atención (botón X)
  const handleExitSession = () => {
    setShowChatModal(false);
    setSelectedEmergency(null);
    setMessages([]);
    setSelectedImagesForHistory([]);
    setToast({ message: "Salió de la sesión. La atención permanece en curso para ser retomada.", type: 'info' });
  };

//  const handleRequestVideoCall = () => {
    // Primero abrimos el modal de términos y condiciones para el médico
//    setShowTermsModal(true);
//};

// Esta se ejecuta cuando el médico acepta los términos en el modal
const confirmAndSendVideoInvite = async () => {
    try {
        const sessionId = selectedEmergency.id; // El ID de la sesión actual
        const sessionRef = doc(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`);

        // 1. Marcamos en la sesión que el médico quiere video
        // Mantenemos el estatus global en 'in-progress'
        await updateDoc(sessionRef, {
            videoRequestedBy: 'operator',
            videoCallStatus: 'waiting', // El paciente verá esto para aceptar
            updatedAt: serverTimestamp()
        });

        // 2. Insertamos un mensaje especial en el chat para que el paciente tenga el link
        const messagesRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
	const videoUrl = getVideoCallUrl(sessionId, 'patient');

        await addDoc(messagesRef, {
            text: "📹 El médico solicita iniciar una videollamada. Por favor, acepte la invitación en su pantalla.",
            sender: 'operator',
            senderName: operatorName || 'Médico',
            timestamp: serverTimestamp(),
            type: 'video_invitation', // Tipo especial para que la App lo reconozca
            videoUrl: videoUrl
        });

        setShowTermsModal(false);
        setIsWaitingForPatient(true);
        setToast({ message: "Invitación enviada. Esperando al paciente...", type: 'info' });

    } catch (error) {
        console.error("Error al solicitar video:", error);
        setToast({ message: "Error al enviar solicitud de video", type: 'error' });
    }
};

  // ✅ CORRECCIÓN 2: URL de Jitsi SIN ESPACIOS y correctamente formateada
  const handleRequestVideoCall = async () => {
    console.log('🔵 [VIDEO CALL] Iniciando...');
    
    if (!selectedEmergency?.id) {
      console.error('❌ [VIDEO CALL] No hay emergency ID');
      setToast({ message: "No hay chat activo para solicitar video llamada.", type: 'error' });
      return;
    }
    
    try {
      const sessionId = selectedEmergency.id;
      const emergencyId = selectedEmergency.emergencyId;
      const safeOperatorName = operatorName || 'Operador';
      
      // Generar sala Jitsi única
      const jitsiRoom = `rescarven-${sessionId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8)}`;
      
      // ✅ URL CORREGIDA - SIN ESPACIOS y con parámetros correctos
      const meetUrl = `https://meet.jit.si/${jitsiRoom}` +
        `#config.prejoinPageEnabled=false` +
        `&config.disableDeepLinking=true` +
        `&config.requireDisplayName=false` +
        `&config.startWithAudioMuted=false` +
        `&config.startWithVideoMuted=false` +
        `&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","hangup"]` +
        `&interfaceConfig.SETTINGS_SECTIONS=[]`;

      console.log('🟢 [VIDEO CALL] MeetURL generada:', meetUrl);

      // Actualizar sesión
      await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, sessionId), {
        videoCallRequested: true,
        videoCallRequestedBy: safeOperatorName,
        videoCallRequestedAt: serverTimestamp(),
        videoCallStatus: 'in-call',
        videoCallMeetUrl: meetUrl,
        updatedAt: serverTimestamp()
      });

      // Actualizar emergencia si existe
      if (emergencyId) {
        await updateDoc(doc(db, `artifacts/${appId}/public/data/emergencyRequests`, emergencyId), {
          videoCallRequested: true,
          videoCallRequestedBy: safeOperatorName,
          videoCallRequestedAt: serverTimestamp(),
          videoCallStatus: 'in-call',
          videoCallMeetUrl: meetUrl,
          telemedicineSessionId: sessionId
        });
      }

      // Enviar mensaje al chat
      const messagesRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
      const messageData = {
        text: `📞 ${safeOperatorName} desea iniciar una videollamada contigo`,
        sender: 'system',
        senderName: 'Sistema',
        timestamp: serverTimestamp(),
        action: 'video_call_invite',
        videoCallUrl: meetUrl
      };

      const docRef = await addDoc(messagesRef, messageData);
      console.log('✅ [VIDEO CALL] Mensaje enviado! ID:', docRef.id);

      setToast({ message: "Invitación de videollamada enviada", type: 'success' });
      
    } catch (error) {
      console.error("❌ [VIDEO CALL] Error:", error);
      setToast({ message: `Error: ${error.message}`, type: 'error' });
    }
  };

  // ✅ CORRECCIÓN 3: Función para finalizar videollamada que actualiza Firestore
  const handleEndVideoCall = async () => {
    if (!selectedEmergency?.id) return;
    
    try {
      // Actualizar estado a 'ended' para que la app móvil detecte el cierre
      // y LIMPIAR la negociación WebRTC (sdpOffer/sdpAnswer) de la llamada
      // anterior para permitir re-abrir la videollamada en la misma sesión.
      await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, selectedEmergency.id), {
        videoCallStatus: 'ended',
        videoCallEndedAt: serverTimestamp(),
        sdpOffer: deleteField(),
        sdpAnswer: deleteField(),
        updatedAt: serverTimestamp()
      });

      setToast({ message: "Videollamada finalizada", type: 'success' });
      
    } catch (error) {
      console.error("❌ Error finalizando videollamada:", error);
      setToast({ message: `Error: ${error.message}`, type: 'error' });
    }
  };

  const handleEscalateToEmergency = async () => {
    if (!selectedEmergency?.id) return;
    if (!window.confirm('¿Está seguro de que este caso requiere una atención médica domiciliaria?')) {
      return;
    }
    try {
      const sessionId = selectedEmergency.id;
      const userId = selectedEmergency.userId;
      const safeOperatorName = operatorName || 'Operador';
      
      await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}`), { 
        status: 'escalated',
        escalatedAt: serverTimestamp(),
        escalatedBy: safeOperatorName,
        updatedAt: serverTimestamp()
      });

      const historyRef = doc(db, `artifacts/${appId}/users/${userId}/medicalHistory/${sessionId}`);
      await setDoc(historyRef, {
        userId,
        encounterType: 'telemedicine_escalated',
        updatedAt: serverTimestamp(),
        fase1: {
          filledBy: user.uid,
          filledByName: safeOperatorName,
          completedAt: serverTimestamp(),
          fields: medicalForm,
          isLocked: true,
          attachedImages: selectedImagesForHistory.length > 0 ? selectedImagesForHistory : []
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
        }
      }, { merge: true });

      const messagesRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
      await addDoc(messagesRef, {
        text: '🚨 Este caso ha sido ESCALADO a Emergencia Médica Domiciliaria. El chat será cerrado.',
        sender: 'system',
        senderName: 'Sistema',
        timestamp: serverTimestamp()
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      setChatRequests(prev => prev.filter(req => req.id !== sessionId));
      setShowChatModal(false);
      setSelectedEmergency(null);
      setMessages([]);
      setIsHistorySaved(false);
      setSelectedImagesForHistory([]);

      setToast({ message: '✅ Caso escalado a emergencia. Chat cerrado.', type: 'success' });

      fetch(`/api/telemedicine/${sessionId}/escalate-to-emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: user.uid,
          doctorName: operatorName,
          reason: 'El paciente requiere atención médica domiciliaria'
        })
      }).catch(err => console.error('Error llamando al backend:', err));

    } catch (error) {
      console.error('❌ Error escalando caso:', error);
      setToast({ message: 'Error al escalar el caso.', type: 'error' });
    }
  };

  const handleOpenHistory = async () => {
    const userId = selectedEmergency?.userId;
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      setToast({ message: "No se pudo identificar al paciente de la sesión.", type: 'error' });
      return;
    }
    setPatientHistory([]);
    setSelectedHistoryDetail(null);
    setShowHistoryModal(true);
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/medical-history/patient/${encodeURIComponent(userId.trim())}/summary`, {
        headers: {
          'x-operator-role': rol || 'medico',
          'x-operator-id': user?.uid || 'medico_test',
          'x-operator-rol': rol || 'medico',
          'x-operator-uid': user?.uid || 'medico_test'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const historias = Array.isArray(data) ? data : (data.historias || []);
      setPatientHistory(historias);
    } catch (error) {
      console.error("Error al consultar historial previo del paciente:", error);
      setPatientHistory([]);
      setToast({ message: "No se pudo cargar el historial previo del paciente.", type: 'error' });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // ✅ NUEVO (telemedicine-ui-detail-loop): Doble clic → detalle completo de la historia
  const handleHistoryDoubleClick = async (historia) => {
    const userId = selectedEmergency?.userId;
    if (!userId || typeof userId !== 'string' || userId.trim() === '' || !historia?.id) {
      setToast({ message: "No se pudo identificar al paciente de esta historia.", type: 'error' });
      return;
    }
    setSelectedHistoryDetail(null);
    setIsLoadingDetail(true);
    try {
      const response = await fetch(
        `/api/medical-history/${encodeURIComponent(historia.id)}?userId=${encodeURIComponent(userId.trim())}`,
        {
          headers: {
            'x-operator-role': rol || 'medico',
            'x-operator-id': user?.uid || 'medico_test',
            'x-operator-rol': rol || 'medico',
            'x-operator-uid': user?.uid || 'medico_test'
          }
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setSelectedHistoryDetail(data.history || data);
    } catch (error) {
      console.error("Error al obtener detalle de la historia:", error);
      setSelectedHistoryDetail(null);
      setToast({ message: "No se pudo cargar el detalle de la historia.", type: 'error' });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setSelectedHistoryDetail(null);
    setPatientHistory([]);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedEmergency) return;
    try {
      const sessionId = selectedEmergency.id;
      const messagesRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
      const safeOperatorName = operatorName || 'Operador';
      
      await addDoc(messagesRef, {
        text: newMessage.trim(),
        sender: 'operator',
        senderId: user.uid,
        senderName: safeOperatorName,
        timestamp: serverTimestamp()
      });

      setNewMessage('');
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      setToast({ message: "No se pudo enviar el mensaje.", type: 'error' });
    }
  };

const handleSaveMedicalHistory = async () => {
  try {
    const sessionId = selectedEmergency.id;
    const userId = selectedEmergency.userId;
    const safeOperatorName = operatorName || 'Operador';

    // ✅ OBLIGATORIO (qa-users-crud-and-mandatory-diagnostic-loop):
    // La Impresión Diagnóstica (CIE10) debe estar llena para guardar/finalizar la historia.
    if (!medicalForm.diagnostico || !String(medicalForm.diagnostico).trim()) {
      setDiagnosticError(true);
      setToast({ message: "⚠️ Debes completar la Impresión Diagnóstica (CIE10) antes de guardar la Historia Médica.", type: 'error' });
      return;
    }
    setDiagnosticError(false);

    // ✅ NUEVO: Consultar los recipes generados en esta sesión
    const prescriptionsRef = collection(db, `artifacts/${appId}/public/data/prescriptions`);
    const q = query(
      prescriptionsRef,
      where('sessionId', '==', sessionId)
    );

    const snapshot = await getDocs(q);
    const prescriptionNumbers = snapshot.docs.map(doc => {
      const data = doc.data();
      return data.prescriptionNumber;
    });

    const historyRef = doc(db, `artifacts/${appId}/users/${userId}/medicalHistory/${sessionId}`);

    await setDoc(historyRef, {
      userId,
      encounterType: 'telemedicine',
      updatedAt: serverTimestamp(),
      // ✅ AGREGAR: Números de recipe generados
      prescriptionNumbers: prescriptionNumbers.length > 0 ? prescriptionNumbers : [],
      fase1: {
        filledBy: user.uid,
        filledByName: safeOperatorName,
        completedAt: serverTimestamp(),
        fields: medicalForm,
        isLocked: true,
        attachedImages: selectedImagesForHistory.length > 0 ? selectedImagesForHistory : []
      }
    }, { merge: true });

    setIsHistorySaved(true);
    setToast({
      message: `Historia Médica guardada${prescriptionNumbers.length > 0 ? ` con ${prescriptionNumbers.length} recipe(s) asociado(s)` : ''}.`,
      type: 'success'
    });
  } catch (error) {
    console.error("Error al guardar historia médica:", error);
    setToast({ message: "No se pudo guardar la historia médica.", type: 'error' });
  }
};

  /**
 * Función Completa: Invitar a Video
 * Esta función se debe disparar desde el botón de la cámara en el chat.
 */
  // --- LÓGICA DE VIDEOLLAMADA WEBRTC ---

// 1. Esta es la única función que debe existir para iniciar el video

const handleInviteVideo = async () => {
  console.log("DEBUG 1: Botón presionado. selectedEmergency:", selectedEmergency);
  
  if (!selectedEmergency?.id) {
    console.error("DEBUG 1.1: Error - No hay ID de emergencia");
    return;
  }

  try {
    const sessionId = selectedEmergency.id;
    const sessionRef = doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, sessionId);
    const safeOperatorName = operatorName || 'Operador';
    
    // 1. Reiniciar la sala: limpiar SDP de una llamada previa y publicar estado
    //    'waiting' para que el listener del paciente NO quede bloqueado en
    //    'ended' y pueda re-abrir la videollamada N veces en esta sesión.
    await updateDoc(sessionRef, {
      videoCallStatus: 'waiting',
      sdpOffer: deleteField(),
      sdpAnswer: deleteField(),
      updatedAt: serverTimestamp()
    });

    // 2. Emitir una nueva invitación en el chat con la URL de la llamada
    //    para que la App del paciente reciba un evento fresco (reintento/reabrir).
    const messagesRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions/${sessionId}/messages`);
    const videoUrl = getVideoCallUrl(sessionId, 'patient');
    await addDoc(messagesRef, {
      text: "📹 El médico solicita iniciar una videollamada. Por favor, acepte la invitación en su pantalla.",
      sender: 'operator',
      senderName: safeOperatorName,
      timestamp: serverTimestamp(),
      type: 'video_invitation',
      videoUrl
    });

    // 3. CONFIGURACIÓN DEL POP-UP (Web del Médico)
    const doctorVideoUrl = `/video-call?id=${sessionId}&role=doctor`;
    const ancho = 1000; // Un poco más ancho para ver bien
    const alto = 750;
    
    // Centrar la ventana en la pantalla del médico
    const x = (window.screen.width / 2) - (ancho / 2);
    const y = (window.screen.height / 2) - (alto / 2);

    console.log("DEBUG 3: Abriendo Pop-up de Telemedicina");

    const win = window.open(
      doctorVideoUrl, 
      `Telemedicina_${sessionId}`, // Nombre único para la ventana
      `width=${ancho},height=${alto},left=${x},top=${y},resizable=yes,status=no,location=no,toolbar=no,menubar=no`
    );

    if (!win) {
      alert("⚠️ El navegador bloqueó la ventana emergente. Por favor, permite los pop-ups para este sitio.");
    }

  } catch (error) {
    console.error("DEBUG ERROR en Telemedicina:", error);
    setToast({ message: "Error al iniciar la videollamada", type: 'error' });
  }
};

// 2. Función para finalizar (opcional, para limpieza de estados)
//const handleEndVideoCall = async () => {
//  if (!selectedEmergency?.id) return;
//  try {
//    await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, selectedEmergency.id), {
//      videoCallStatus: 'ended',
//      updatedAt: serverTimestamp()
//    });
//  } catch (e) { console.error(e); }
//};

  const handleEndChat = async () => {
  if (!selectedEmergency) return;
  
  if (!isHistorySaved) {
    setToast({ message: "⚠️ Debes GUARDAR la Historia Médica antes de finalizar el chat.", type: 'error' });
    return;
  }

  try {
    const sessionId = selectedEmergency.id;
    const userId = selectedEmergency.userId;

    // Si está escalada, solo cerramos el modal (el caso pasa a emergencias)
    if (selectedEmergency.status === 'escalated') {
      console.log('🔵 Telemedicina escalada - Cerrando chat pero manteniendo caso activo');
      setShowChatModal(false);
      setSelectedEmergency(null);
      setMessages([]);
      setSelectedImagesForHistory([]);
      setToast({ message: "Chat cerrado. El caso aparecerá en el dashboard de emergencias.", type: 'success' });
      return;
    }

    console.log('🟢 Telemedicina normal - Finalizando completamente');

    // ✅ CORRECCIÓN: Usar ruta relativa y endpoint que SÍ existe
    // Nota: Si el endpoint no existe, no es crítico, el chat se cierra igual
    try {
      const response = await fetch(`/api/telemedicine/sessions/${sessionId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      if (!response.ok) {
        console.warn("⚠️ Endpoint de finalización no disponible, pero se cerrará el chat igual.");
      }
    } catch (err) {
      // ✅ CORRECCIÓN: No lanzar error, solo loguear
      console.warn("⚠️ No se pudo llamar al endpoint de finalización:", err.message);
    }

    // Actualizar estado en Firestore
    await updateDoc(doc(db, `artifacts/${appId}/public/data/telemedicineSessions`, sessionId), {
      status: 'resolved',
      resolvedAt: serverTimestamp()
    });

    // Limpiar estado local
    setShowChatModal(false);
    setSelectedEmergency(null);
    setMessages([]);
    setSelectedImagesForHistory([]);
    
    setToast({ message: "Chat finalizado y Historia guardada correctamente.", type: 'success' });

  } catch (error) {
    console.error("❌ Error al finalizar chat:", error);
    setToast({ message: `Error al finalizar el chat: ${error.message}`, type: 'error' });
  }
};

  if (rol !== 'medico') {
    return <div>No tienes permiso para acceder a esta sección.</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Telemedicina - Cola de Atención</h2>
      {chatRequests.length === 0 ? (
        <p className="text-center py-8 text-gray-500">No hay solicitudes de telemedicina pendientes.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {chatRequests.map((req) => (
            <div key={req.id} className="border rounded-lg p-4 hover:shadow-md transition bg-white shadow-sm">
              <h3 className="font-bold text-lg text-gray-800 mb-2">{req.userName || 'Usuario'}</h3>
              <p className="text-sm text-gray-600 mb-1">Correo: {req.userEmail}</p>
              <p className="text-sm text-gray-600 mb-4">Solicitado: {formatDate(req.timestamp)}</p>
              <button
                onClick={() => req.status === 'in-progress' ? openRejoinConfirmation(req) : handleStartChat(req)}
                className={`w-full font-bold py-2 px-4 rounded text-sm transition ${
                  req.status === 'in-progress' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {req.status === 'in-progress' ? '🔄 Sesión en curso — Retomar' : 'Aceptar Chat'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showChatModal && selectedEmergency && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-[95vw] h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b flex flex-wrap justify-between items-center gap-4 bg-indigo-600 text-white" style={{ minHeight: '76px' }}>
              <h3 className="font-bold text-xl">Telemedicina - Chat con {selectedEmergency.userName}</h3>
              <div className="flex flex-wrap items-center gap-3" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={handleOpenHistory}
                  disabled={!selectedEmergency?.userId}
                  className={`font-bold py-2 px-5 rounded-lg text-sm transition ${!selectedEmergency?.userId ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-slate-700 hover:bg-slate-800'}`}
                  style={{ backgroundColor: !selectedEmergency?.userId ? '#9ca3af' : '#334155', color: 'white', display: 'inline-block', minWidth: '200px', border: '1px solid white' }}
                  title={!selectedEmergency?.userId ? 'No se pudo identificar al paciente' : ''}
                >
                  📜 Consultar Historial Previos
                </button>
                <span className="hidden md:inline-block text-white/40" style={{ borderLeft: '1px solid rgba(255,255,255,0.4)', height: '32px' }} />
                <button
                  onClick={handleInviteVideo}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-5 rounded-lg text-sm"
                  style={{ backgroundColor: '#10b981', display: 'inline-block', minWidth: '150px', border: '1px solid white' }}
                >
                  📹 Video Llamada
                </button>
                <button
                  onClick={handleEscalateToEmergency}
                  disabled={!isHistorySaved}
                  className={`text-white font-bold py-2 px-5 rounded-lg text-sm ${!isHistorySaved ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-orange-500 hover:bg-orange-600'}`}
                  style={{
                    backgroundColor: !isHistorySaved ? '#9ca3af' : '#f97316',
                    display: 'inline-block',
                    minWidth: '200px',
                    border: '2px solid yellow',
                    fontWeight: 'bold'
                  }}
                  title={!isHistorySaved ? "Guarde la historia médica primero" : " "}
                >
                  {!isHistorySaved ? '🔒 Guarde Historia Primero' : '⚠️ REQUIERE EMERGENCIA'}
                </button>
                <button
                  onClick={handleEndChat}
                  disabled={!isHistorySaved}
                  className={`text-white font-bold py-2 px-5 rounded-lg text-sm ${!isHistorySaved ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-red-500 hover:bg-red-600'}`}
                  style={{ backgroundColor: !isHistorySaved ? '#9ca3af' : '#ef4444', display: 'inline-block', minWidth: '130px', border: '1px solid white' }}
                  title={!isHistorySaved ? "Guarde la historia médica primero" : " "}
                >
                  {!isHistorySaved ? '🔒 Guarde Historia Primero' : 'Finalizar Chat'}
                </button>
                <span className="hidden md:inline-block text-white/40" style={{ borderLeft: '1px solid rgba(255,255,255,0.4)', height: '32px' }} />
                <button
                  onClick={() => setConfirmDialog({
                    title: 'Salir de la sesión',
                    message: '¿Deseas salir de la sesión actual? La atención permanecerá en curso para que pueda ser retomada.',
                    confirmLabel: 'Sí, salir',
                    onConfirm: handleExitSession
                  })}
                  className="bg-white/20 hover:bg-white/30 text-white font-bold rounded-full w-10 h-10 transition"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid white' }}
                  title="Salir de la sesión (la atención queda en curso)"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 overflow-hidden">
              <div className="flex flex-col border-r overflow-y-auto p-4">
                <div className="flex-1 overflow-y-auto space-y-2">
                  {messages.length === 0 ? (
                    <p className="text-gray-500 text-center">Aún no hay mensajes.</p>
                  ) : (
                    <>
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`text-sm ${msg.sender === 'operator' ? 'text-right' : 'text-left'}`}
                        >
                          <div
                            className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                              msg.sender === 'operator' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-black'
                            }`}
                          >
                            {msg.imageUrl && (
                              <div className="relative mb-2">
                                <img 
                                  src={msg.imageUrl} 
                                  alt="Imagen enviada" 
                                  className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition"
                                  onClick={() => window.open(msg.imageUrl, '_blank')}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                                <button
                                  onClick={() => toggleImageForHistory(msg.imageUrl)}
                                  className={`absolute top-2 right-2 p-1.5 rounded-full shadow-md transition ${
                                    selectedImagesForHistory.includes(msg.imageUrl) 
                                      ? 'bg-green-500 text-white' 
                                      : 'bg-white text-gray-700 hover:bg-gray-100'
                                  }`}
                                  title={selectedImagesForHistory.includes(msg.imageUrl) ? "Quitar de historia" : "Agregar a historia médica"}
                                >
                                  {selectedImagesForHistory.includes(msg.imageUrl) ? '✅' : '📎'}
                                </button>
                              </div>
                            )}

                            {msg.text && msg.text !== '📷 Foto tomada' && msg.text !== '🖼️ Imagen enviada' && (
                              <div className="break-words">{renderMessageText(msg.text)}</div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {msg.senderName || msg.sender} • {formatDate(msg.timestamp)}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="mt-4 flex">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 border rounded-l px-3 py-2 focus:outline-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-r transition"
                  >
                    Enviar
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-6 bg-gradient-to-br from-gray-50 to-white space-y-6">
                <h4 className="text-2xl font-bold text-indigo-700 mb-2">Historia Médica Electrónica</h4>

                {isHistorySaved && (
                    <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded-lg text-sm text-center">
                      ✅ Historia Médica Guardada y Bloqueada
                    </div>
                )}
                
                {selectedImagesForHistory.length > 0 && (
                  <div className="mt-2 text-center text-sm text-green-700 bg-green-100 px-3 py-1 rounded-full inline-block">
                    📎 {selectedImagesForHistory.length} imagen(es) asociada(s) a esta historia
                  </div>
                )}

                <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-300">
                  <h5 className="text-xl font-bold text-indigo-600 mb-4 border-b pb-2">Datos del Paciente</h5>
                  <div className="grid grid-cols-2 gap-5">
                    <input type="text" placeholder="Nombre" value={medicalForm.nombre} onChange={(e) => setMedicalForm({ ...medicalForm, nombre: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="Apellidos" value={medicalForm.apellidos} onChange={(e) => setMedicalForm({ ...medicalForm, apellidos: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="Cédula" value={medicalForm.cedula} onChange={(e) => setMedicalForm({ ...medicalForm, cedula: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="date" placeholder="Fecha de Nacimiento" value={medicalForm.fechaNacimiento} onChange={(e) => setMedicalForm({ ...medicalForm, fechaNacimiento: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="Lugar de Nacimiento" value={medicalForm.lugarNacimiento} onChange={(e) => setMedicalForm({ ...medicalForm, lugarNacimiento: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="Nombre Familiar" value={medicalForm.nombreFamiliar} onChange={(e) => setMedicalForm({ ...medicalForm, nombreFamiliar: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="Teléfonos" value={medicalForm.telefonos} onChange={(e) => setMedicalForm({ ...medicalForm, telefonos: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                  </div>
                </section>

                <section className="bg-white p-5 rounded-lg shadow-md border">
                  <h5 className="font-semibold text-xl text-gray-700 mb-3">Motivo de Consulta y Enfermedad Actual</h5>
                  <textarea placeholder="Describa el motivo de consulta..." value={medicalForm.motivoConsulta} onChange={(e) => setMedicalForm({ ...medicalForm, motivoConsulta: e.target.value })} className="w-full border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                </section>

                <section className="bg-white p-5 rounded-lg shadow-md border">
                  <h5 className="font-semibold text-xl text-gray-700 mb-3">Antecedentes Personales</h5>
                  <textarea placeholder="Antecedentes personales y familiares..." value={medicalForm.antecedentes} onChange={(e) => setMedicalForm({ ...medicalForm, antecedentes: e.target.value })} className="w-full border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                </section>

                <section className="bg-white p-5 rounded-lg shadow-md border">
                  <h5 className="font-semibold text-xl text-gray-700 mb-3">Interrogatorio Clínico</h5>
                  <div className="grid grid-cols-3 gap-4">
                    <input type="text" placeholder="TA" value={medicalForm.ta} onChange={(e) => setMedicalForm({ ...medicalForm, ta: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="FC" value={medicalForm.fc} onChange={(e) => setMedicalForm({ ...medicalForm, fc: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="FR" value={medicalForm.fr} onChange={(e) => setMedicalForm({ ...medicalForm, fr: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="GLIC" value={medicalForm.glic} onChange={(e) => setMedicalForm({ ...medicalForm, glic: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                    <input type="text" placeholder="SatO2" value={medicalForm.sato2} onChange={(e) => setMedicalForm({ ...medicalForm, sato2: e.target.value })} className="border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                  </div>
                </section>

                <section className="bg-white p-5 rounded-lg shadow-md border">
                  <h5 className="font-semibold text-xl text-gray-700 mb-3">Sintomatología</h5>
                  <textarea placeholder="Síntomas reportados..." value={medicalForm.sintomas} onChange={(e) => setMedicalForm({ ...medicalForm, sintomas: e.target.value })} className="w-full border rounded px-3 py-2.5 disabled:bg-gray-100" disabled={isHistorySaved} />
                </section>

		<section className={`bg-white p-5 rounded-lg shadow-md border transition ${diagnosticError ? 'border-red-500 ring-2 ring-red-300' : 'border-gray-300'}`}>
		  <h5 className={`font-semibold text-xl mb-3 ${diagnosticError ? 'text-red-600' : 'text-gray-700'}`}>
		    Impresión Diagnóstica (CIE10) *
		  </h5>
		  <DiagnosticAutocomplete
		    value={medicalForm.diagnostico}
		    onChange={(val) => {
                      setMedicalForm({ ...medicalForm, diagnostico: val });
                      if (String(val || '').trim()) setDiagnosticError(false);
                    }}
		    disabled={isHistorySaved}
		    placeholder="Buscar diagnóstico..."
		  />
		  {diagnosticError && (
		    <p className="text-red-600 text-sm font-medium mt-2">
		      ⚠️ La Impresión Diagnóstica (CIE10) es obligatoria para guardar/finalizar la historia médica.
		    </p>
		  )}
		</section>

	       <section className= "bg-white p-5 rounded-lg shadow-md border " >
	               <h5 className= "font-semibold text-xl text-gray-700 mb-3 " >Tratamiento </h5 >
	               <textarea placeholder= "Tratamiento indicado... " value={medicalForm.tratamiento} onChange={(e) => setMedicalForm({ ...medicalForm, tratamiento: e.target.value })} className= "w-full border rounded px-3 py-2.5 disabled:bg-gray-100 " disabled={isHistorySaved} / >
	               
	               {/* ✅ NUEVO: Botón para generar recipe */}
	               <button
	                type="button"
	                onClick={() => setShowPrescriptionModal(true)}
	                disabled={false}
	                className= "mt-3 flex items-center justify-center gap-2 w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-2 px-4 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-200 "
	               >
	                 <span>📄</span> Generar Récipe Médico / Estudios
	               </button>
                </section >

                <button 
                  onClick={handleSaveMedicalHistory} 
                  disabled={isHistorySaved}
                  className={`mt-6 w-full font-bold py-2 px-4 rounded transition ${isHistorySaved ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                >
                  {isHistorySaved ? '✅ Historia Guardada y Bloqueada' : '💾 Guardar Historia Médica'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

     {/* ✅ NUEVO: Componente Modal de Recipes */}
	  {showPrescriptionModal  && selectedEmergency  && (
	    <PrescriptionModal
	      show={showPrescriptionModal}
	      onClose={() => setShowPrescriptionModal(false)}
	      sessionId={selectedEmergency.id}
	      patientData={{
	        name: `${medicalForm.nombre} ${medicalForm.apellidos}`.trim(),
	        cedula: medicalForm.cedula,
	        email: selectedEmergency.userEmail
	      }}
	      db={db}
	      appId={appId}
	      setToast={setToast}
	      backendUrl={config.backendUrl}
	    />
	  )}

     {/* ✅ NUEVO: Modal de Historial Médico Previo del Paciente */}
	  {showHistoryModal && (
	    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
	      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
	        <div className="p-4 border-b flex justify-between items-center bg-slate-700 text-white">
	          <h3 className="font-bold text-lg">
	            📜 Historial Médico Previo{selectedEmergency?.userName ? ` - ${selectedEmergency.userName}` : ''}
	          </h3>
	          <button
	            onClick={closeHistoryModal}
	            className="bg-white text-slate-700 font-bold rounded-full w-8 h-8 flex items-center justify-center hover:bg-slate-200 transition"
	            title="Cerrar"
	          >
	            ✕
	          </button>
	        </div>

	        {!selectedHistoryDetail ? (
	          <>
	            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
	              {isLoadingHistory ? (
	                <p className="text-center text-gray-500 py-8">Cargando historial...</p>
	              ) : patientHistory.length === 0 ? (
	                <p className="text-center text-gray-500 py-8">No hay historias médicas previas para este paciente.</p>
	              ) : (
	                <>
	                  <p className="text-xs text-slate-500 bg-gray-100 px-3 py-2 rounded-md">
	                    💡 Haz <span className="font-bold text-slate-700">doble clic</span> sobre una historia para ver su detalle completo (Fase 1 y Fase 2).
	                  </p>
	                  {patientHistory.map((historia) => (
	                    <div
	                      key={historia.id}
	                      onDoubleClick={() => handleHistoryDoubleClick(historia)}
	                      title="Doble clic para ver la historia completa"
	                      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-pointer hover:border-indigo-400 hover:shadow-md transition"
	                    >
	                      <p className="text-sm font-semibold text-slate-700 mb-2">
	                        📅 {formatDate(historia.date || historia.createdAt)}
	                      </p>
	                      <p className="text-sm text-gray-700 mb-1">
	                        <span className="font-semibold">Síntomas:</span> {historia.symptoms || 'No registrado'}
	                      </p>
	                      <p className="text-sm text-gray-700">
	                        <span className="font-semibold">Diagnóstico:</span> {historia.diagnosis || 'No registrado'}
	                      </p>
	                    </div>
	                  ))}
	                </>
	              )}
	            </div>

	            <div className="p-4 border-t flex justify-end bg-white">
	              <button
	                onClick={closeHistoryModal}
	                className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded text-sm transition"
	              >
	                Cerrar
	              </button>
	            </div>
	          </>
	        ) : (
	          <>
	            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gray-50">
	              {isLoadingDetail ? (
	                <p className="text-center text-gray-500 py-8">Cargando detalle de la historia...</p>
	              ) : (
	                <>
	                  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
	                    <h4 className="text-lg font-bold text-slate-800 mb-3">📋 Detalle de la Historia Médica</h4>
	                    <div className="grid grid-cols-2 gap-3 text-sm">
	                      <p><span className="font-semibold text-slate-600">Fecha:</span> {formatDate(getHistoryDetailDate(selectedHistoryDetail))}</p>
	                      <p><span className="font-semibold text-slate-600">Tipo de encuentro:</span> {selectedHistoryDetail.encounterType || 'No especificado'}</p>
	                      <p><span className="font-semibold text-slate-600">Estado:</span> {selectedHistoryDetail.status || 'No especificado'}</p>
	                      <p><span className="font-semibold text-slate-600">Actualizado:</span> {formatDate(selectedHistoryDetail.updatedAt)}</p>
	                    </div>
	                  </div>

	                  <div className="bg-white border border-indigo-200 rounded-lg p-5 shadow-sm">
	                    <h4 className="text-lg font-bold text-indigo-700 mb-4 border-b pb-2">Fase 1 — Evaluación Inicial</h4>
	                    {(selectedHistoryDetail.fase1?.fields) ? (
	                      <div className="space-y-3 text-sm">
	                        <div className="grid grid-cols-2 gap-3">
	                          <FieldDetail label="Nombre" value={selectedHistoryDetail.fase1.fields.nombre} />
	                          <FieldDetail label="Apellidos" value={selectedHistoryDetail.fase1.fields.apellidos} />
	                          <FieldDetail label="Cédula" value={selectedHistoryDetail.fase1.fields.cedula} />
	                          <FieldDetail label="Fecha de Nacimiento" value={selectedHistoryDetail.fase1.fields.fechaNacimiento} />
	                          <FieldDetail label="Lugar de Nacimiento" value={selectedHistoryDetail.fase1.fields.lugarNacimiento} />
	                          <FieldDetail label="Nombre Familiar" value={selectedHistoryDetail.fase1.fields.nombreFamiliar} />
	                          <FieldDetail label="Teléfonos" value={selectedHistoryDetail.fase1.fields.telefonos} />
	                        </div>
	                        <FieldDetail label="Motivo de Consulta" value={selectedHistoryDetail.fase1.fields.motivoConsulta} />
	                        <FieldDetail label="Antecedentes Personales" value={selectedHistoryDetail.fase1.fields.antecedentes} />
	                        <div className="grid grid-cols-2 gap-3">
	                          <FieldDetail label="TA" value={selectedHistoryDetail.fase1.fields.ta} />
	                          <FieldDetail label="FC" value={selectedHistoryDetail.fase1.fields.fc} />
	                          <FieldDetail label="FR" value={selectedHistoryDetail.fase1.fields.fr} />
	                          <FieldDetail label="GLIC" value={selectedHistoryDetail.fase1.fields.glic} />
	                          <FieldDetail label="SatO2" value={selectedHistoryDetail.fase1.fields.sato2} />
	                        </div>
	                        <FieldDetail label="Síntomas" value={selectedHistoryDetail.fase1.fields.sintomas} />
	                        <FieldDetail label="Impresión Diagnóstica (CIE10)" value={selectedHistoryDetail.fase1.fields.diagnostico} />
	                        <FieldDetail label="Tratamiento Indicado" value={selectedHistoryDetail.fase1.fields.tratamiento} />
	                        {(selectedHistoryDetail.fase1.attachedImages && selectedHistoryDetail.fase1.attachedImages.length > 0) && (
	                          <div>
	                            <p className="font-semibold text-slate-600 mb-1">Imágenes adjuntas ({selectedHistoryDetail.fase1.attachedImages.length})</p>
	                            <div className="flex flex-wrap gap-2">
	                              {selectedHistoryDetail.fase1.attachedImages.map((img, idx) => (
	                                <button
	                                  key={idx}
	                                  type="button"
	                                  onClick={() => window.open(img, '_blank')}
	                                  className="text-xs text-indigo-600 hover:underline font-medium px-2 py-1 bg-indigo-50 rounded border border-indigo-200"
	                                >
	                                  🖼️ Imagen {idx + 1}
	                                </button>
	                              ))}
	                            </div>
	                          </div>
	                        )}
	                      </div>
	                    ) : (
	                      <p className="text-sm text-gray-500">No hay datos de Fase 1 registrados.</p>
	                    )}
	                  </div>

	                  <div className="bg-white border border-green-200 rounded-lg p-5 shadow-sm">
	                    <h4 className="text-lg font-bold text-green-700 mb-4 border-b pb-2">Fase 2 — Diagnóstico e Indicaciones</h4>
	                    {(selectedHistoryDetail.fase2?.fields) ? (
	                      <div className="space-y-3 text-sm">
	                        <FieldDetail label="Diagnóstico Final" value={selectedHistoryDetail.fase2.fields.diagnosticoFinal || selectedHistoryDetail.fase2.fields.diagnostico} />
	                        <FieldDetail label="Tratamiento Final" value={selectedHistoryDetail.fase2.fields.tratamientoFinal || selectedHistoryDetail.fase2.fields.tratamiento} />
	                        <FieldDetail label="Examen Físico" value={selectedHistoryDetail.fase2.fields.examenFisico} />
	                        <FieldDetail label="Observaciones" value={selectedHistoryDetail.fase2.fields.observaciones} />
	                        <FieldDetail label="Indicaciones" value={selectedHistoryDetail.fase2.fields.indicaciones} />
	                        <FieldDetail label="Récipes / Recetas" value={selectedHistoryDetail.fase2.fields.recipes || selectedHistoryDetail.fase2.fields.récipes} />
	                        <FieldDetail label="Exámenes Solicitados" value={selectedHistoryDetail.fase2.fields.examenesSolicitados} />
	                      </div>
	                    ) : (
	                      <p className="text-sm text-gray-500">No hay datos de Fase 2 registrados.</p>
	                    )}
	                  </div>

	                  {(selectedHistoryDetail.prescriptionNumbers && selectedHistoryDetail.prescriptionNumbers.length > 0) && (
	                    <div className="bg-white border border-amber-200 rounded-lg p-5 shadow-sm">
	                      <h4 className="text-lg font-bold text-amber-700 mb-3">🧾 Récipes generados</h4>
	                      <div className="flex flex-wrap gap-2">
	                        {selectedHistoryDetail.prescriptionNumbers.map((num, idx) => (
	                          <span key={idx} className="text-sm font-medium px-3 py-1 bg-amber-50 border border-amber-300 rounded-full">
	                            {num}
	                          </span>
	                        ))}
	                      </div>
	                    </div>
	                  )}
	                </>
	              )}
	            </div>

	            <div className="p-4 border-t flex justify-between items-center bg-white">
	              <button
	                onClick={() => setSelectedHistoryDetail(null)}
	                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded text-sm transition"
	                title="Volver al listado de historias"
	              >
	                ← Volver a la lista
	              </button>
	              <button
	                onClick={closeHistoryModal}
	                className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded text-sm transition"
	              >
	                Cerrar Detalle
	              </button>
	            </div>
	          </>
)}
      </div>
    </div>
  )}

     {/* ✅ NUEVO (telemedicine-session-recovery-loop): Dialogo de confirmación de concurrencia/salida */}
	  {confirmDialog && (
	    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4">
	      <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
	        <h3 className="text-lg font-bold text-slate-800 mb-3">{confirmDialog.title}</h3>
	        <p className="text-sm text-gray-700 mb-6 leading-relaxed">{confirmDialog.message}</p>
	        <div className="flex justify-end gap-3">
	          <button
	            onClick={() => setConfirmDialog(null)}
	            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-5 rounded-lg text-sm transition"
	          >
	            Cancelar
	          </button>
	          <button
	            onClick={() => {
	              const action = confirmDialog.onConfirm;
	              setConfirmDialog(null);
	              if (action) action();
	            }}
	            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg text-sm transition"
	          >
	            {confirmDialog.confirmLabel}
	          </button>
	        </div>
	      </div>
	    </div>
	  )}
    </div>
   
  
  );
};

export default Telemedicina;

