// src/components/SystemUserManagement.jsx
import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDoc
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // 📦 Firebase Storage

const compressImageToDataUrl = (file, maxDimension = 800, quality = 0.7) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('No hay archivo que procesar'));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => {
    if (!file.type || !file.type.startsWith('image/')) {
      resolve(reader.result);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const SystemUserManagement = ({ db, appId, setToast, user, operatorRole = 'administrador' }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nombreCompleto: '',
    rol: 'operador',
    isActive: true,
    licenseCM: '',
    ministryReg: ''
  });

  // 📷 Un solo estado para la imagen combinada de Firma + Sello
  const [stampSignatureFile, setStampSignatureFile] = useState(null);

  // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): Eliminación de usuarios
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ✅ NUEVO: Cambio forzado de contraseña por el administrador
  const [passwordModalFor, setPasswordModalFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const roles = ['operador', 'supervisor', 'medico', 'administrador'];
  const storage = getStorage();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, `artifacts/${appId}/systemUsers`);
      const querySnapshot = await getDocs(usersRef);
      const userList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(userList);
    } catch (error) {
      console.error('Error cargando usuarios del sistema:', error);
      setToast({ message: 'Error al cargar usuarios', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setStampSignatureFile(null);
    setFormData({
      email: '',
      password: '',
      nombreCompleto: '',
      rol: 'operador',
      isActive: true,
      licenseCM: '',
      ministryReg: ''
    });
  };

  const handleEditClick = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '', 
      nombreCompleto: user.nombreCompleto || '',
      rol: user.rol || 'operador',
      isActive: user.isActive !== false,
      licenseCM: user.medicalProfile?.licenseCM || '',
      ministryReg: user.medicalProfile?.ministryReg || ''
    });
    setShowModal(true);
  };

  // ✅ NUEVO: Cabeceras de operador para las APIs administrativas (/api/admin/...)
  const adminHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Operator-Rol': operatorRole || 'administrador',
    'X-Operator-Uid': user?.uid || ''
  });

  const parseJson = async (response) => {
    let resData = null;
    try {
      resData = await response.json();
    } catch (parseError) {
      resData = null;
    }
    return resData;
  };

  // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): Eliminar usuario con confirmación
  const handleDeleteUser = async (target) => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: adminHeaders()
      });
      const resData = await parseJson(response);

      if (!response.ok || !resData?.success) {
        throw new Error(resData?.message || `Error al eliminar usuario (HTTP ${response.status})`);
      }

      setToast({ message: `Usuario ${target.nombreCompleto || ''} eliminado correctamente.`, type: 'success' });
      setShowDeleteConfirm(null);
      fetchUsers();
    } catch (error) {
      console.error('Error eliminando usuario:', error);
      setToast({ message: error.message || 'No se pudo eliminar el usuario.', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): Cambio forzado de contraseña
  const handleChangePassword = async (target) => {
    const password = (newPassword || '').trim();
    if (!password) {
      setToast({ message: 'Ingresa la nueva contraseña.', type: 'error' });
      return;
    }
    if (password.length < 6) {
      setToast({ message: 'La nueva contraseña debe tener al menos 6 caracteres.', type: 'error' });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}/password`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ newPassword: password })
      });
      const resData = await parseJson(response);

      if (!response.ok || !resData?.success) {
        throw new Error(resData?.message || `Error al cambiar la contraseña (HTTP ${response.status})`);
      }

      setToast({ message: `Contraseña de ${target.nombreCompleto || target.email || ''} actualizada correctamente.`, type: 'success' });
      setPasswordModalFor(null);
      setNewPassword('');
    } catch (error) {
      console.error('Error cambiando contraseña:', error);
      setToast({ message: error.message || 'No se pudo cambiar la contraseña.', type: 'error' });
    } finally {
      setPasswordSaving(false);
    }
  };

  // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): Inactivar/activar vía API para
  //    deshabilitar efectivamente la cuenta en Firebase Auth (bloquea el inicio de sesión).
  const syncUserStatusViaApi = async (userId, isActive) => {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ isActive: !!isActive })
    });
    const resData = await parseJson(response);
    if (!response.ok || !resData?.success) {
      throw new Error(resData?.message || `Error al actualizar el estado (HTTP ${response.status})`);
    }
    return resData;
  };

  // 🚀 Sube el archivo unificado de firma y sello
  const uploadMedicalFile = async (file, userEmail) => {
    if (!file) return null;
    const cleanEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const fileExtension = file.name.split('.').pop();
    
    // Ruta limpia: artifacts/default-app-id/medical_staff/email_medico/firma_sello.png
    const storageRef = ref(storage, `artifacts/${appId}/medical_staff/${cleanEmail}/firma_sello.${fileExtension}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let finalMedicalProfile = null;

      if (formData.rol === 'medico') {
        if (!formData.licenseCM || !formData.ministryReg) {
          setToast({ message: 'Los datos de colegiatura y ministerio son obligatorios para médicos', type: 'error' });
          setLoading(false);
          return;
        }

        if (!editingUser && !stampSignatureFile) {
          setToast({ message: 'La imagen de la Firma y Sello es obligatoria para registrar un nuevo médico', type: 'error' });
          setLoading(false);
          return;
        }

        setToast({ message: 'Subiendo firma y sello digital a Storage...', type: 'info' });
        
        let stampSignatureUrl = null;
        let storageFallback = false;

        if (stampSignatureFile) {
          try {
            stampSignatureUrl = await uploadMedicalFile(stampSignatureFile, formData.email);
          } catch (uploadError) {
            console.warn('Firebase Storage no disponible (posible cuota excedida); fallback a base64 embebida.', uploadError);
            storageFallback = true;
            try {
              stampSignatureUrl = await compressImageToDataUrl(stampSignatureFile);
            } catch (readError) {
              console.warn('No se pudo procesar la imagen; se crea el usuario omitiendo la firma y sello.', readError);
              stampSignatureUrl = null;
            }
          }
        } else {
          stampSignatureUrl = editingUser?.medicalProfile?.stampSignatureUrl || null;
        }

        finalMedicalProfile = {
          licenseCM: formData.licenseCM.trim(),
          ministryReg: formData.ministryReg.trim(),
          stampSignatureUrl,
          ...(storageFallback ? { stampSignatureFallback: true } : {})
        };
      }

      if (editingUser) {
        const userDocRef = doc(db, `artifacts/${appId}/systemUsers`, editingUser.id);
        const updateData = {
          nombreCompleto: formData.nombreCompleto.trim(),
          rol: formData.rol,
          isActive: formData.isActive,
          updatedAt: new Date()
        };

        if (formData.rol === 'medico') {
          updateData.medicalProfile = finalMedicalProfile;
        } else {
          updateData.medicalProfile = null; 
        }

        await updateDoc(userDocRef, updateData);

        // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): La API deshabilita/habilita
        //    efectivamente la cuenta en Firebase Auth según el estado seleccionado.
        try {
          await syncUserStatusViaApi(editingUser.id, formData.isActive);
        } catch (statusError) {
          console.warn('Estado actualizado en Firestore, pero no se pudo sincronizar Firebase Auth:', statusError.message);
          setToast({ message: `Usuario actualizado con éxito, pero no se pudo ${formData.isActive ? 'reactivar' : 'inactivar'} su cuenta en Auth.`, type: 'error' });
          handleCloseModal();
          fetchUsers();
          return;
        }

        setToast({ message: 'Usuario actualizado con éxito', type: 'success' });
        handleCloseModal();
        fetchUsers();
      } else {
        setToast({ message: 'Registrando credenciales en el servidor...', type: 'info' });
        
        const payload = {
          email: formData.email.trim(),
          password: formData.password,
          nombreCompleto: formData.nombreCompleto.trim(),
          rol: formData.rol,
          isActive: formData.isActive,
          appId: appId
        };

        if (formData.rol === 'medico') {
          payload.medicalProfile = finalMedicalProfile;
        }

        const backendUrl = '/api/users';

        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // El backend promete responder SIEMPRE JSON; aún así se hace parsing
        // defensivo para no romper si llegara HTML/texto (ej. 404 de Express).
        let resData = null;
        try {
          resData = await response.json();
        } catch (parseError) {
          resData = null;
        }

        if (!response.ok || !resData || !resData.success) {
          throw new Error(resData?.message || `Error en el servidor al crear usuario (HTTP ${response.status})`);
        }

        setToast({ message: '¡Médico / Operador creado con éxito!', type: 'success' });

        // ✅ NUEVO (qa-users-crud-and-mandatory-diagnostic-loop): si se crea inactivo,
        //    deshabilitar la cuenta en Firebase Auth para bloquear su acceso.
        if (!formData.isActive && resData?.userId) {
          try {
            await syncUserStatusViaApi(resData.userId, false);
          } catch (statusError) {
            console.warn('No se pudo deshabilitar la cuenta en Auth tras crearla:', statusError.message);
          }
        }

        handleCloseModal();
        fetchUsers();
      }
    } catch (error) {
      console.error('Error procesando formulario:', error);
      setToast({ message: error.message || 'Ocurrió un error inesperado', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Control de Personal Web</h2>
          <p className="text-gray-500 text-sm">Gestiona accesos de médicos, supervisores y operadores.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition shadow-sm"
        >
          + Añadir Operador / Médico
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-600 font-semibold text-sm">
              <th className="p-3">Nombre</th>
              <th className="p-3">Correo Electrónico</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Info Médica</th>
              <th className="p-3">Estatus</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y text-gray-700 text-sm">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition">
                <td className="p-3 font-medium">{u.nombreCompleto || 'Sin Nombre'}</td>
                <td className="p-3 text-gray-500">{u.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    u.rol === 'medico' ? 'bg-teal-100 text-teal-800' :
                    u.rol === 'administrador' ? 'bg-purple-100 text-purple-800' :
                    u.rol === 'supervisor' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {u.rol ? u.rol.toUpperCase() : 'OPERADOR'}
                  </span>
                </td>
                <td className="p-3">
                  {u.rol === 'medico' && u.medicalProfile ? (
                    <div className="text-xs text-gray-500">
                      <div>C.M: <span className="font-semibold text-gray-700">{u.medicalProfile.licenseCM}</span></div>
                      <div>MPPS: <span className="font-semibold text-gray-700">{u.medicalProfile.ministryReg}</span></div>
                    </div>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="p-3">
                  <span className={`h-2.5 w-2.5 rounded-full inline-block mr-2 ${u.isActive !== false ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  {u.isActive !== false ? 'Activo' : 'Inactivo'}
                </td>
                <td className="p-3 text-center">
                  <div className="flex justify-center gap-2 flex-wrap">
                    <button onClick={() => handleEditClick(u)} className="text-indigo-600 hover:text-indigo-900 font-medium px-2 py-1">
                      Editar
                    </button>
                    <button onClick={() => setPasswordModalFor(u)} className="text-amber-600 hover:text-amber-900 font-medium px-2 py-1">
                      🔑 Clave
                    </button>
                    <button onClick={() => setShowDeleteConfirm(u)} className="text-red-600 hover:text-red-900 font-medium px-2 py-1">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h3 className="text-lg font-bold text-gray-800">
                {editingUser ? `Editar Perfil: ${formData.nombreCompleto}` : 'Registrar Nuevo Personal'}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-semibold mb-1">Nombre Completo *</label>
                <input required type="text" value={formData.nombreCompleto} onChange={e => setFormData({...formData, nombreCompleto: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-semibold mb-1">Correo Electrónico *</label>
                <input required type="email" disabled={!!editingUser} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-100" />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-gray-700 text-sm font-semibold mb-1">Contraseña Temporal *</label>
                  <input required type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              )}

              <div>
                <label className="block text-gray-700 text-sm font-semibold mb-1">Rol en el Sistema *</label>
                <select value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  {roles.map(rol => <option key={rol} value={rol}>{rol.toUpperCase()}</option>)}
                </select>
              </div>

              {/* 🥼 SECCIÓN DEL MÉDICO UNIFICADA */}
              {formData.rol === 'medico' && (
                <div className="bg-teal-50/50 p-4 rounded-xl border border-teal-100 space-y-4">
                  <h4 className="text-sm font-bold text-teal-900 border-b border-teal-100 pb-1">
                    🥼 Datos Clínicos y Legales
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-teal-950 text-xs font-bold mb-1">Nro Colegiatura (C.M.) *</label>
                      <input required type="text" value={formData.licenseCM} onChange={e => setFormData({...formData, licenseCM: e.target.value})} className="w-full px-3 py-1.5 border border-teal-200 bg-white rounded-lg focus:ring-2 focus:ring-teal-500 text-sm" placeholder="Ej. 27216" />
                    </div>
                    <div>
                      <label className="block text-teal-950 text-xs font-bold mb-1">Registro MPPS *</label>
                      <input required type="text" value={formData.ministryReg} onChange={e => setFormData({...formData, ministryReg: e.target.value})} className="w-full px-3 py-1.5 border border-teal-200 bg-white rounded-lg focus:ring-2 focus:ring-teal-500 text-sm" placeholder="Ej. 174892" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-teal-950 text-xs font-bold mb-1">Imagen de Firma + Sello Unificados *</label>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => setStampSignatureFile(e.target.files[0])}
                      className="w-full text-xs text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-100 file:text-teal-700 hover:file:bg-teal-200" 
                    />
                    {editingUser?.medicalProfile?.stampSignatureUrl && !stampSignatureFile && (
                      <p className="text-[11px] text-teal-700 mt-0.5">✓ Conservar imagen de firma y sello actual</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center pt-2">
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-700 font-medium">Usuario Activo</label>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <button type="button" onClick={handleCloseModal} className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-gray-700 font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                  {loading ? 'Procesando...' : (editingUser ? 'Guardar Cambios' : 'Crear Usuario')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Confirmación de Eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b flex justify-between items-center bg-red-50 rounded-t-xl">
              <h3 className="text-lg font-bold text-red-800">Eliminar Usuario</h3>
              <button onClick={() => setShowDeleteConfirm(null)} disabled={deleting} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
            </div>
            <div className="p-6">
              <p className="text-gray-700">
                ¿Estás seguro de eliminar a <span className="font-semibold">{showDeleteConfirm.nombreCompleto || showDeleteConfirm.email || 'este usuario'}</span>?
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Se eliminará su cuenta en Firebase Auth y sus documentos en Firestore. Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowDeleteConfirm(null)} disabled={deleting} className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-gray-700 font-medium disabled:opacity-50">
                  Cancelar
                </button>
                <button type="button" onClick={() => handleDeleteUser(showDeleteConfirm)} disabled={deleting} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                  {deleting ? 'Eliminando...' : 'Sí, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cambio de Contraseña */}
      {passwordModalFor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b flex justify-between items-center bg-amber-50 rounded-t-xl">
              <h3 className="text-lg font-bold text-amber-800">Cambiar Contraseña</h3>
              <button onClick={() => { setPasswordModalFor(null); setNewPassword(''); }} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(passwordModalFor); }} className="p-6">
              <p className="text-gray-700 text-sm mb-4">
                Nueva contraseña para <span className="font-semibold">{passwordModalFor.nombreCompleto || passwordModalFor.email || 'el usuario'}</span>:
              </p>
              <input
                required
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => { setPasswordModalFor(null); setNewPassword(''); }} disabled={passwordSaving} className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-gray-700 font-medium disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={passwordSaving} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                  {passwordSaving ? 'Guardando...' : 'Guardar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemUserManagement;


