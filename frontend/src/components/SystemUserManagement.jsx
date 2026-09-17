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

const SystemUserManagement = ({ db, appId, setToast }) => {
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
        
        const stampSignatureUrl = stampSignatureFile 
          ? await uploadMedicalFile(stampSignatureFile, formData.email)
          : (editingUser?.medicalProfile?.stampSignatureUrl || null);

        finalMedicalProfile = {
          licenseCM: formData.licenseCM.trim(),
          ministryReg: formData.ministryReg.trim(),
          stampSignatureUrl
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

        const backendUrl = '/api/createSystemUser';

        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();

        if (!response.ok || !resData.success) {
          throw new Error(resData.message || 'Error en el servidor al crear usuario');
        }

        setToast({ message: '¡Médico / Operador creado con éxito!', type: 'success' });
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
                  <button onClick={() => handleEditClick(u)} className="text-indigo-600 hover:text-indigo-900 font-medium px-2 py-1">
                    Editar
                  </button>
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
    </div>
  );
};

export default SystemUserManagement;


