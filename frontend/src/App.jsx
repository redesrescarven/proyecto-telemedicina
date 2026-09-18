// src/App.jsx
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  query,
  where,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import config from './config';
import Telemedicina from './components/Telemedicina';
import UserManagement from './components/UserManagement';
import HistorialMedico from './components/HistorialMedico';
import EmergenciaMedica from './components/EmergenciaMedica';
import ReportesHistoriasMedicas from './components/ReportesHistoriasMedicas';
import SystemUserManagement from './components/SystemUserManagement';
import VideoCallRoom from './components/VideoCallRoom';

// 🔒 Constantes para headers de autenticación
const HEADER_OPERATOR_ROL = 'X-Operator-Rol';
const HEADER_OPERATOR_UID = 'X-Operator-Uid';

// Auto-dismissing message con soporte de tipos
const AutoDismissMessage = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = document.querySelector('.auto-dismiss-message');
      if (el) {
        el.classList.add('animate-fade-out');
        setTimeout(() => onClose(), 300);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'error' ? 'bg-red-100' : 'bg-blue-100';
  const borderColor = type === 'error' ? 'border-red-400' : 'border-blue-400';
  const textColor = type === 'error' ? 'text-red-700' : 'text-blue-700';

  return (
    <div
      className={`fixed top-4 right-4 ${bgColor} border ${borderColor} ${textColor} px-6 py-3 rounded-lg shadow-lg z-50 flex items-center auto-dismiss-message`}
      style={{ animation: 'fadeIn 0.3s ease-out', animationFillMode: 'forwards' }}
      role="alert"
    >
      {message}
    </div>
  );
};

// Inyectar CSS dinámicamente para animaciones
if (typeof window !== 'undefined') {
  const existingStyle = document.getElementById('auto-dismiss-style');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'auto-dismiss-style';
    style.textContent = `@keyframes fadeIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } } @keyframes fadeOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } } .animate-fade-out { animation: fadeOut 0.3s ease-in forwards !important; }`;
    document.head.appendChild(style);
  }
}

// Componente para copiar al portapapeles (CON FALLBACK PARA HTTP)
const CopyToClipboardButton = ({ textToCopy }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = async () => {
    try {
      let text = String(textToCopy).trim();
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try { document.execCommand('copy'); } catch (err) {}
        document.body.removeChild(textArea);
      }
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
    } catch (err) {
      console.error('[CopyToClipboard] Error:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-xs transition duration-150 flex items-center gap-1"
      title="Copiar coordenadas"
      type="button"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      Copiar
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg whitespace-nowrap z-10">
          ¡Copiado!
        </span>
      )}
    </button>
  );
};

// Modal de Login para Operadores
const LoginModal = ({ show, onClose, onLoginSuccess, auth, db, appId, setToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  if (!show) return null;

  const handleLogin = async () => {
    setLoading(true);
    setLoginError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userRoleRef = doc(db, `artifacts/${appId}/systemUsers/${user.uid}`);
      const docSnap = await getDoc(userRoleRef);
      
      if (docSnap.exists()) {
        const userData = docSnap.data();
        onLoginSuccess(user, userData.rol, userData.nombreCompleto);
        setToast({ message: 'Inicio de sesión exitoso.', type: 'success' });
        onClose();
      } else {
        await signOut(auth);
        setLoginError('Usuario no autorizado o rol no definido.');
        setToast({ message: 'Usuario no autorizado.', type: 'error' });
      }
    } catch (error) {
      let errorMessage = 'Credenciales inválidas.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Correo o contraseña incorrectos.';
      }
      setLoginError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-2xl font-bold text-center mb-6 text-indigo-700">Iniciar Sesión Operador</h2>
        {loginError && <p className="text-red-500 text-center mb-4">{loginError}</p>}
        <input
          type="email"
          placeholder="Correo Electrónico"
          className="w-full p-3 mb-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Contraseña"
          className="w-full p-3 mb-6 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-full text-lg transition duration-300 ease-in-out disabled:opacity-50"
        >
          {loading ? 'Iniciando Sesión...' : 'Ingresar'}
        </button>
        <button
          onClick={onClose}
          className="w-full mt-4 text-indigo-600 hover:text-indigo-800 font-semibold text-md"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};

// Función para exportar CSV
const exportToCsv = (filename, rows) => {
  if (!rows || rows.length === 0) return;
  const csvContent = "\ufeff" + rows.map(e => e.join(";")).join("\n");
  const encodedUri = encodeURI("text/csv;charset=utf-8," + csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Modal de Historial de Atenciones
const UserHistoryModal = ({ show, onClose, userId, userName, db, appId }) => {
  const [historyEmergencies, setHistoryEmergencies] = useState([]);
  const [historyTelemedicine, setHistoryTelemedicine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const translateStatus = (status) => {
    const statusMap = {
      pending: 'PENDIENTE',
      'in-progress': 'ATENDIDO',
      resolved: 'CERRADO',
      requested: 'SOLICITADO',
      escalated: 'ESCALADO',
      cancelled: 'CANCELADO'
    };
    return statusMap[status] || status?.toUpperCase() || 'DESCONOCIDO';
  };

  const handleExportCSV = () => {
    const allData = [...historyEmergencies, ...historyTelemedicine];
    if (allData.length === 0) return;
    const headers = ["Tipo", "Estado", "Fecha Solicitud", "Fecha Cierre", "Operador/Médico", "Latitud", "Longitud", "ID Caso"];
    const rows = allData.map(item => [
      item.type === 'emergency' ? 'Emergencia' : 'Telemedicina',
      translateStatus(item.status),
      item.timestamp?.toLocaleString() || 'N/A',
      (item.resolvedAt?.toDate ? item.resolvedAt.toDate() : item.resolvedAt)?.toLocaleString() || 'N/A',
      item.operatorName || item.escalatedBy || 'N/A',
      item.latitude || '',
      item.longitude || '',
      item.id
    ]);

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const encodedUri = encodeURI("text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Historial_${userName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (!show || !db || !userId) {
      setHistoryEmergencies([]);
      setHistoryTelemedicine([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const emergenciesQuery = query(
      collection(db, `artifacts/${appId}/public/data/emergencyRequests`),
      where("userId", "==", userId)
    );

    const unsubEmergencies = onSnapshot(emergenciesQuery, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          type: 'emergency',
          ...data,
          timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
          resolvedAt: data.resolvedAt?.toDate?.() || null
        });
      });
      list.sort((a, b) => b.timestamp - a.timestamp);
      setHistoryEmergencies(list);
    });

    const teleQuery = query(
      collection(db, `artifacts/${appId}/public/data/telemedicineSessions`),
      where("userId", "==", userId)
    );

    const unsubTele = onSnapshot(teleQuery, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          type: 'telemedicine',
          ...data,
          timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
          resolvedAt: data.resolvedAt?.toDate?.() || null
        });
      });
      list.sort((a, b) => b.timestamp - a.timestamp);
      setHistoryTelemedicine(list);
    });

    setLoading(false);
    return () => { unsubEmergencies(); unsubTele(); };
  }, [show, db, userId, appId]);

  const filteredData = () => {
    if (activeTab === 'emergencies') return historyEmergencies;
    if (activeTab === 'telemedicine') return historyTelemedicine;
    return [...historyEmergencies, ...historyTelemedicine].sort((a, b) => b.timestamp - a.timestamp);
  };

  const displayData = filteredData();

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-indigo-50">
          <div>
            <h2 className="text-2xl font-bold text-indigo-800">Historial de Atenciones</h2>
            <p className="text-gray-600">Paciente: <span className="font-semibold">{userName}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl font-light">&times;</button>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-b flex flex-wrap gap-4 justify-between items-center">
          <div className="flex space-x-2 bg-white p-1 rounded-lg border shadow-sm">
            <button onClick={() => setActiveTab('all')} className={`px-4 py-1.5 rounded text-sm font-medium transition ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Todas</button>
            <button onClick={() => setActiveTab('emergencies')} className={`px-4 py-1.5 rounded text-sm font-medium transition ${activeTab === 'emergencies' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Emergencias</button>
            <button onClick={() => setActiveTab('telemedicine')} className={`px-4 py-1.5 rounded text-sm font-medium transition ${activeTab === 'telemedicine' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Telemedicina</button>
          </div>
          
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            Exportar CSV
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 bg-gray-50">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            </div>
          ) : displayData.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No se encontraron atenciones para este usuario.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayData.map((item) => (
                <div key={item.id} className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    <div className={`w-2 ${item.type === 'emergency' ? 'bg-red-500' : 'bg-blue-500'} md:w-1.5 flex-shrink-0`}></div>
                    
                    <div className="p-4 flex-grow grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-2">
                        <span className={`inline-block self-start px-2 py-1 rounded text-xs font-bold uppercase tracking-wide ${item.type === 'emergency' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {item.type === 'emergency' ? '🚨 Emergencia' : '💬 Telemedicina'}
                        </span>
                        <span className={`inline-block self-start px-2 py-1 rounded text-xs font-medium ${item.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {translateStatus(item.status)}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600">
                        <p className="mb-1"><span className="font-semibold text-gray-700">📅 Inicio:</span> {item.timestamp?.toLocaleString()}</p>
                        {item.resolvedAt && (
                          <p><span className="font-semibold text-gray-700">🏁 Fin:</span> {(item.resolvedAt instanceof Date ? item.resolvedAt : item.resolvedAt?.toDate?.() || item.resolvedAt)?.toLocaleString()}</p>
                        )}
                      </div>

                      <div className="text-sm text-gray-600">
                        <p className="mb-1"><span className="font-semibold text-gray-700">👤 Atendido por:</span> {item.operatorName || item.escalatedBy || 'Sin asignar'}</p>
                        {(item.latitude && item.longitude) && (
                          <a 
                            href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 mt-1"
                          >
                            📍 Ver ubicación en mapa
                          </a>
                        )}
                      </div>

                      <div className="text-sm text-gray-500 font-mono flex flex-col justify-end items-start md:items-end">
                        <p className="text-xs">ID: {item.id}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// INICIALIZAR FIREBASE
const firebaseApp = initializeApp(config.firebase);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

const GLOBAL_APP_ID = "default-app-id";
const APP_ID = "default-app-id";

const App = () => {
  const [user, setUser] = useState(null);
  const [operatorName, setOperatorName] = useState('Anónimo');
  const [operatorRole, setOperatorRole] = useState('anonimo');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [emergencies, setEmergencies] = useState([]);
  const [users, setUsers] = useState([]);
  const [telemedicineRequests, setTelemedicineRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('emergencies');
  const [showOperatorLoginModal, setShowOperatorLoginModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);
  const [selectedUserNameForHistory, setSelectedUserNameForHistory] = useState('');
  const [showMedicalHistoryModal, setShowMedicalHistoryModal] = useState(false);
  const [selectedUserIdForHistory, setSelectedUserIdForHistory] = useState('');
  const [selectedUserNameForMedicalHistory, setSelectedUserNameForMedicalHistory] = useState('');
  const [userListRefreshTrigger, setUserListRefreshTrigger] = useState(0);
  const [toast, setToast] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const appId = GLOBAL_APP_ID;

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (currentUser.isAnonymous) {
          setOperatorName('Anónimo');
          setOperatorRole('anonimo');
        } else {
          const userRoleRef = doc(db, `artifacts/${appId}/systemUsers/${currentUser.uid}`);
          try {
            const docSnap = await getDoc(userRoleRef);
            if (docSnap.exists()) {
              const userData = docSnap.data();
              setOperatorName(userData.nombreCompleto || currentUser.email || 'Operador');
              setOperatorRole(userData.rol || 'anonimo');
            } else {
              setOperatorName(currentUser.email || 'Operador');
              setOperatorRole('anonimo');
            }
          } catch (error) {
            console.error('Error obteniendo rol:', error);
          }
        }
        setIsAuthReady(true);
      } else {
        setUser(null);
        setOperatorName('Anónimo');
        setOperatorRole('anonimo');
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Error en signInAnonymously:', error);
        }
        setIsAuthReady(true);
      }
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [appId]);

  // Escuchar emergencias y telemedicinas
  useEffect(() => {
    if (!db || !isAuthReady || !user) return;

    // 1. Emergencias Directas
    const emergencyRequestsRef = collection(db, `artifacts/${appId}/public/data/emergencyRequests`);
    const unsubscribeEmergencies = onSnapshot(emergencyRequestsRef, (snapshot) => {
      const newEmergencies = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const status = data.status;
        if (status === 'pending' || status === 'in-progress' || status === 'escalated') {
          newEmergencies.push({
            id: doc.id,
            ...data,
            type: 'emergency',
            timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
          });
        }
      });
      setEmergencies(newEmergencies);
    });

    // 2. Telemedicinas
    const telemedicineRef = collection(db, `artifacts/${appId}/public/data/telemedicineSessions`);
    const unsubscribeTelemedicine = onSnapshot(telemedicineRef, (snapshot) => {
      const newTelemedicine = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const status = data.status;
        if (status === 'requested' || status === 'in-progress' || status === 'escalated') {
          newTelemedicine.push({
            id: doc.id,
            ...data,
            type: 'telemedicine',
            timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
          });
        }
      });
      setTelemedicineRequests(newTelemedicine);
    });

    return () => {
      unsubscribeEmergencies();
      unsubscribeTelemedicine();
    };
  }, [db, isAuthReady, user, appId]);

  const allRequests = [...emergencies, ...telemedicineRequests].sort((a, b) => {
    const timeA = a.timestamp ? a.timestamp.getTime() : 0;
    const timeB = b.timestamp ? b.timestamp.getTime() : 0;
    return timeB - timeA;
  });

  // Cargar usuarios para gestión admin/supervisor
  useEffect(() => {
    if (
      activeTab === 'users' &&
      db &&
      isAuthReady &&
      user &&
      (operatorRole === 'supervisor' || operatorRole === 'administrador')
    ) {
      const fetchUsers = async () => {
        try {
          const response = await fetch('/api/admin/users', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              [HEADER_OPERATOR_ROL]: operatorRole,
              [HEADER_OPERATOR_UID]: user.uid,
            },
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al obtener usuarios.');
          }
          const fetchedUsers = await response.json();
          setUsers(fetchedUsers);
        } catch (error) {
          console.error("Error al cargar usuarios: ", error);
          setToast({ message: `Error al cargar usuarios: ${error.message}`, type: 'error' });
        }
      };
      fetchUsers();
    }
  }, [activeTab, db, isAuthReady, user, operatorRole, userListRefreshTrigger]);

  const handleLogout = async () => {
    try {
      setActiveTab('emergencies');
      await signOut(auth);
      setOperatorName('Anónimo');
      setOperatorRole('anonimo');
      setToast({ message: 'Sesión cerrada.', type: 'success' });
    } catch (error) {
      setToast({ message: `Error: ${error.message}`, type: 'error' });
    }
  };

  const updateUserIsActiveStatus = async (userIdToUpdate, newIsActiveStatus) => {
    if (!db || !user || operatorRole !== 'administrador') {
      setToast({ message: 'Solo administradores.', type: 'error' });
      return;
    }
    try {
      // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): la API deshabilita/habilita
      //    efectivamente la cuenta en Firebase Auth y sincroniza el perfil en Firestore.
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userIdToUpdate)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Rol': operatorRole,
          'X-Operator-Uid': user.uid,
        },
        body: JSON.stringify({ isActive: newIsActiveStatus }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'No se pudo actualizar el estado.');
      }
      setToast({ message: `Cuenta ${newIsActiveStatus ? 'activada' : 'inactivada/deshabilitada'}`, type: 'success' });
      setUserListRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error actualizando estado (API):', error);
      // Fallback: actualización directa en Firestore si la API no está disponible.
      try {
        const userProfileRef = doc(db, `artifacts/${appId}/users/${userIdToUpdate}/profile/data`);
        await updateDoc(userProfileRef, {
          isActive: newIsActiveStatus,
          status: newIsActiveStatus ? 'active' : 'inactive',
          updatedBy: user.uid,
          updatedByName: operatorName,
          updatedAt: new Date(),
        });
        setToast({ message: `Cuenta ${newIsActiveStatus ? 'activada' : 'desactivada (sin Auth)'}`, type: 'success' });
        setUserListRefreshTrigger(prev => prev + 1);
      } catch (fallbackError) {
        setToast({ message: `Error: ${fallbackError.message}`, type: 'error' });
      }
    }
  };

  // Función para actualizar estado de la atención con Validación Backend de Historia Médica
  const updateEmergencyStatus = async (emergencyId, newStatus, userName, userId, requestType) => {
    let hasPermission = false;
    if (newStatus === 'in-progress' && ['operador', 'supervisor', 'administrador'].includes(operatorRole)) {
      hasPermission = true;
    } else if (newStatus === 'resolved' && ['operador', 'supervisor', 'administrador'].includes(operatorRole)) {
      hasPermission = true;
    }

    if (!db || !user || !hasPermission) {
      setToast({ message: 'No tienes permiso.', type: 'error' });
      return;
    }

    try {
      const endpoint = requestType === 'telemedicine' 
        ? `/api/telemedicine/sessions/${emergencyId}/status`
        : `/api/emergencies/${emergencyId}/status`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          operatorId: user.uid,
          operatorName: operatorName
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'HISTORY_INCOMPLETE') {
          setToast({ message: `⚠️ ${data.message}`, type: 'error' });
        } else {
          setToast({ message: data.message || 'No se pudo actualizar el estado.', type: 'error' });
        }
        return;
      }

      const statusMsg = newStatus === 'resolved' ? 'CERRADO' : 'ATENDIDO';
      setToast({ message: `Caso ${statusMsg}`, type: 'success' });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      setToast({ message: `Error de red: ${error.message}`, type: 'error' });
    }
  };

  const translateStatus = (status) => {
    switch (status) {
      case 'pending':
      case 'requested':
        return 'PENDIENTE';
      case 'in-progress':
        return 'ATENDIDO';
      case 'resolved':
        return 'CERRADO';
      default:
        return status ? status.toUpperCase() : 'DESCONOCIDO';
    }
  };

  const handleExportUsers = () => {
    const headers = ["Nombre", "Cédula", "Teléfono", "Email", "Estado"];
    const rows = users.map(u => [u.name || 'N/A', u.cedula || 'N/A', u.phone || 'N/A', u.email || 'N/A', u.isActive ? 'Activo' : 'Inactivo']);
    exportToCsv("lista_usuarios.csv", [headers, ...rows]);
    setToast({ message: "Lista exportada.", type: 'success' });
  };

  const filteredUsers = users.filter(userItem =>
    searchTerm === '' ||
    (userItem.cedula && userItem.cedula.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (userItem.email && userItem.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!isAuthReady || !db || !auth) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Cargando aplicación...</div>;
  }

  if (!user) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Acceso Restringido.</div>;
  }

  const currentPath = window.location.pathname;
  if (currentPath === '/video-call') {
    return <VideoCallRoom />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {toast && <AutoDismissMessage message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <LoginModal
        show={showOperatorLoginModal}
        onClose={() => setShowOperatorLoginModal(false)}
        onLoginSuccess={(loggedInUser, role, name) => {
          setUser(loggedInUser);
          setOperatorRole(role);
          setOperatorName(name);
        }}
        auth={auth}
        db={db}
        appId={appId}
        setToast={setToast}
      />

      {showHistoryModal && (
        <UserHistoryModal
          show={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          userId={selectedUserForHistory}
          userName={selectedUserNameForHistory}
          db={db}
          appId={appId}
          setToast={setToast}
        />
      )}

      {showMedicalHistoryModal && (
        <HistorialMedico
          userId={selectedUserIdForHistory}
          userName={selectedUserNameForMedicalHistory}
          db={db}
          appId={appId}
          onClose={() => setShowMedicalHistoryModal(false)}
        />
      )}

      <header className="bg-indigo-700 text-white p-4 shadow-md grid grid-cols-3 items-center">
        <div className="flex justify-start items-center">
          <img src="/images/rescarven-logo.png" alt="Rescarven Logo" className="h-16 w-auto object-contain" />
        </div>
        <h1 className="text-center text-4xl font-extrabold col-span-1">Botón de Emergencia</h1>
        <div className="flex justify-end items-center space-x-4">
          <span className="text-sm">Operador: {operatorName} ({operatorRole})</span>
          {operatorRole === 'anonimo' ? (
            <button onClick={() => setShowOperatorLoginModal(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1 px-3 rounded-full text-sm">Iniciar Sesión</button>
          ) : (
            <button onClick={handleLogout} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1 px-3 rounded-full text-sm">Cerrar Sesión</button>
          )}
        </div>
      </header>

      <nav className="bg-white shadow-sm p-3 flex justify-center space-x-6">
        <div className="relative">
          <button className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'emergencies' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setActiveTab('emergencies')}>Monitor de Emergencias</button>
          {allRequests.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{allRequests.length}</span>}
        </div>
        {(operatorRole === 'supervisor' || operatorRole === 'administrador') && (
          <button className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'users' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setActiveTab('users')}>Gestión de Usuarios</button>
        )}
        {operatorRole === 'administrador' && (
          <button 
            className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'system-users' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`} 
            onClick={() => setActiveTab('system-users')}
          >
            👥 Usuarios del Sistema
          </button>
        )}
        {operatorRole === 'medico' && (
          <button className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'telemedicina' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setActiveTab('telemedicina')}>Telemedicina</button>
        )}
        {operatorRole === 'medico' && (
          <button className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'emergencia-medica' ? 'bg-red-100 text-red-700' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setActiveTab('emergencia-medica')}>🚑 Emergencia Médica</button>
        )}
        {/* 🔒 Pestaña de Historias Médicas/Reportes EXCLUSIVA para el Rol Médico */}
        {operatorRole === 'medico' && (
          <button className={`px-4 py-2 rounded-lg font-semibold ${activeTab === 'reportes' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setActiveTab('reportes')}>📋 Historias Médicas</button>
        )} 
      </nav>

      <main className="flex-grow p-6">
        {activeTab === 'emergencies' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-3xl font-bold text-red-700 mb-6 text-center">Atenciones Activas</h2>
            {allRequests.length === 0 ? (
              <p className="text-gray-600 text-center">No hay atenciones activas.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allRequests.map(request => {
                  const isEmergency = request.type === 'emergency' || request.status === 'escalated';
                  const borderColor = isEmergency ? 'border-red-500' : 'border-blue-500';
                  const bgColor = isEmergency ? 'bg-red-50' : 'bg-blue-50';
                  const badgeColor = isEmergency ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
                  const badgeText = isEmergency ? '🚨 EMERGENCIA' : '💬 TELEMEDICINA';

                  const getGoogleMapsLink = (lat, lng) => {
                    if (!lat || !lng) return null;
                    return `https://www.google.com/maps?q=${lat},${lng}`;
                  };

                  const mapsLink = getGoogleMapsLink(request.latitude, request.longitude);

                  const copyMapsLink = async () => {
                    if (mapsLink) {
                      try {
                        await navigator.clipboard.writeText(mapsLink);
                        setToast({ message: '📍 Ubicación copiada al portapapeles', type: 'success' });
                      } catch (err) {
                        const textArea = document.createElement('textarea');
                        textArea.value = mapsLink;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        setToast({ message: '📍 Ubicación copiada al portapapeles', type: 'success' });
                      }
                    }
                  };

                  return (
                    <div key={request.id} className={`p-5 rounded-xl shadow-md border-l-8 ${borderColor} ${bgColor}`}>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ${badgeColor}`}>{badgeText}</span>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">{request.userName || 'Usuario Desconocido'}</h3>
                      <p className="text-gray-700 text-sm mb-1"><span className="font-semibold">Cédula:</span> {request.userCedula || 'N/A'}</p>
                      <p className="text-gray-700 text-sm mb-1"><span className="font-semibold">Teléfono:</span> {request.userPhone || 'N/A'}</p>
                      <p className="text-gray-700 text-sm mb-1"><span className="font-semibold">Email:</span> {request.userEmail || 'N/A'}</p>

                      {request.latitude && request.longitude ? (
                        <div className="mb-2 flex gap-2">
                          <a
                            href={mapsLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded text-center flex items-center justify-center gap-1"
                          >
                            🗺️ Ver en Maps
                          </a>
                          <button
                            onClick={copyMapsLink}
                            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-2 px-3 rounded flex items-center justify-center gap-1"
                          >
                            📋 Copiar Link
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-xs mb-2 italic">⚠️ Sin ubicación GPS</p>
                      )}

                      <p className="text-gray-700 text-sm mb-2"><span className="font-semibold">Solicitado:</span> {request.timestamp?.toLocaleString()}</p>

                      <p className="text-gray-800 text-lg font-bold mt-2">
                        Estado: <span className={`uppercase ${(request.status === 'pending' || request.status === 'requested') ? 'text-red-600' : 'text-orange-600'}`}>
                          {translateStatus(request.status)}
                        </span>
                      </p>

                      {/* 🔒 ACCIONES RESERVADAS PARA ROLES OPERATIVOS (EL MÉDICO SOLO CONSULTA VISTA) */}
                      {operatorRole !== 'medico' && operatorRole !== 'anonimo' && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {request.type === 'emergency' ? (
                            <>
                              {(request.status === 'pending' || request.status === 'escalated') &&
                               ['operador', 'supervisor', 'administrador'].includes(operatorRole) && (
                                <button
                                  onClick={() => updateEmergencyStatus(request.id, 'in-progress', request.userName, request.userId, 'emergency')}
                                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-full text-sm"
                                >
                                  Marcar Atendido
                                </button>
                              )}

                              {request.status === 'in-progress' &&
                               ['operador', 'supervisor', 'administrador'].includes(operatorRole) && (
                                <button
                                  onClick={() => updateEmergencyStatus(request.id, 'resolved', request.userName, request.userId, 'emergency')}
                                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-full text-sm"
                                >
                                  Marcar Cerrado
                                </button>
                              )}
                            </>
                          ) : request.type === 'telemedicine' && request.status === 'escalated' ? (
                            <button
                              onClick={() => updateEmergencyStatus(request.id, 'resolved', request.userName, request.userId, 'telemedicine')}
                              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-full text-sm"
                            >
                              Marcar Cerrado
                            </button>
                          ) : (
                            <span className="text-sm text-gray-500 italic">
                              En cola de atención remota
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && ['supervisor', 'administrador'].includes(operatorRole) && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-indigo-700">Gestión de Usuarios</h2>
              <button onClick={handleExportUsers} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full">Exportar CSV</button>
            </div>
            <div className="mb-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">Lista de Usuarios</h3>
              <input type="text" placeholder="Buscar por cédula o email..." className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 w-64" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {filteredUsers.length === 0 ? (
              <p className="text-gray-600 text-lg text-center">No se encontraron usuarios.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-lg shadow-md">
                  <thead>
                    <tr className="bg-gray-200 text-gray-700 uppercase text-sm">
                      <th className="py-3 px-6 text-left">Nombre</th>
                      <th className="py-3 px-6 text-left">Cédula</th>
                      <th className="py-3 px-6 text-left">Email</th>
                      <th className="py-3 px-6 text-left">Estado</th>
                      <th className="py-3 px-6 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 text-sm">
                    {filteredUsers.map(userItem => (
                      <tr key={userItem.id} className="border-b hover:bg-gray-100">
                        <td className="py-3 px-6">{userItem.name || 'N/A'}</td>
                        <td className="py-3 px-6">{userItem.cedula || 'N/A'}</td>
                        <td className="py-3 px-6">{userItem.email || 'N/A'}</td>
                        <td className="py-3 px-6"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${userItem.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{userItem.isActive ? 'Activo' : 'Inactivo'}</span></td>
                        <td className="py-3 px-6 flex flex-wrap gap-2">
                          {operatorRole === 'administrador' && (
                            <button onClick={() => updateUserIsActiveStatus(userItem.id, !userItem.isActive)} className={`font-bold py-1 px-2 rounded-full text-xs ${userItem.isActive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>{userItem.isActive ? 'Desactivar' : 'Activar'}</button>
                          )}
                          <button onClick={() => { setSelectedUserForHistory(userItem.id); setSelectedUserNameForHistory(userItem.name || 'Usuario'); setShowHistoryModal(true); }} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded-full text-xs">Ver Historial</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'system-users' && operatorRole === 'administrador' && (
          <SystemUserManagement 
            db={db} 
            appId={appId} 
            setToast={setToast} 
            user={user}
            operatorRole={operatorRole}
          />
        )}

        {activeTab === 'telemedicina' && operatorRole === 'medico' && (
          <Telemedicina user={user} db={db} operatorName={operatorName} appId={APP_ID} rol={operatorRole} setToast={setToast} />
        )}

        {activeTab === 'user-management' && ['supervisor', 'administrador'].includes(operatorRole) && (
          <UserManagement db={db} appId={APP_ID} />
        )}

        {activeTab === 'emergencia-medica' && operatorRole === 'medico' && (
          <EmergenciaMedica user={user} db={db} appId={APP_ID} operatorName={operatorName} setToast={setToast} />
        )}

        {activeTab === 'reportes' && operatorRole === 'medico' && (
          <ReportesHistoriasMedicas user={user} db={db} appId={APP_ID} operatorRole={operatorRole} setToast={setToast} />
        )}
      </main>
    </div>
  );
};

export default App;

