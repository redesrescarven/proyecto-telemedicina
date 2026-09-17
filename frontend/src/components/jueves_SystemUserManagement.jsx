// src/components/SystemUserManagement.jsx
import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDoc,
  setDoc // ✅ Agregado para crear documentos con ID específico
} from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

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
    isActive: true
  });

  const roles = ['operador', 'supervisor', 'medico', 'administrador'];

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
      setToast({ message: 'Error al cargar usuarios del sistema', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email || '',
        password: '', // Por seguridad no se precarga la contraseña
        nombreCompleto: user.nombreCompleto || '',
        rol: user.rol || 'operador',
        isActive: user.isActive !== false
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        nombreCompleto: '',
        rol: 'operador',
        isActive: true
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({ email: '', password: '', nombreCompleto: '', rol: 'operador', isActive: true });
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  if (!formData.email || !formData.nombreCompleto || !formData.rol) {
    setToast({ message: 'Completa todos los campos obligatorios', type: 'error' });
    return;
  }

  setLoading(true);
  try {
    const auth = getAuth();

    if (editingUser) {
      // 📝 ACTUALIZAR: Solo actualizamos Firestore
      const userRef = doc(db, `artifacts/${appId}/systemUsers`, editingUser.id);
      await updateDoc(userRef, {
        nombreCompleto: formData.nombreCompleto,
        rol: formData.rol,
        isActive: formData.isActive,
        updatedAt: new Date()
      });
      setToast({ message: 'Usuario actualizado en base de datos', type: 'success' });
    } else {
      // 🆕 CREAR: Creamos usuario en Firebase Auth + Firestore
      if (!formData.password || formData.password.length < 6) {
        setToast({ message: 'La contraseña debe tener al menos 6 caracteres', type: 'error' });
        setLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email.trim(), 
        formData.password
      );

      const newUser = {
        email: formData.email.trim(),
        nombreCompleto: formData.nombreCompleto,
        rol: formData.rol,
        isActive: formData.isActive,
        createdAt: new Date(),
        uid: userCredential.user.uid
      };

      const userRef = doc(db, `artifacts/${appId}/systemUsers`, userCredential.user.uid);
      await setDoc(userRef, newUser);
      
      // ✅ CERRAR SESIÓN del usuario recién creado (para volver al admin)
      await signOut(auth);
      
      setToast({ message: 'Usuario creado exitosamente', type: 'success' });
    }

    handleCloseModal();
    fetchUsers();
  } catch (error) {
    console.error('Error guardando usuario:', error);
    let msg = 'Error al guardar usuario';
    if (error.code === 'auth/email-already-in-use') msg = 'El correo ya está registrado';
    if (error.code === 'auth/weak-password') msg = 'Contraseña muy débil (min. 6 caracteres)';
    if (error.code === 'auth/invalid-email') msg = 'Correo inválido';
    setToast({ message: msg, type: 'error' });
  } finally {
    setLoading(false);
  }
};

  const handleDelete = async (userId, email) => {
    if (!window.confirm(`¿Estás seguro de eliminar a ${email}? Esta acción solo lo elimina de la base de datos.`)) return;
    
    setLoading(true);
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/systemUsers`, userId));
      // Nota: Eliminar de Firebase Auth requiere Cloud Functions o Admin SDK.
      setToast({ message: 'Usuario eliminado de Firestore. (Auth requiere limpieza manual)', type: 'warning' });
      fetchUsers();
    } catch (error) {
      console.error('Error eliminando usuario:', error);
      setToast({ message: 'Error al eliminar usuario', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const getRolColor = (rol) => {
    const colors = {
      operador: 'bg-blue-100 text-blue-800',
      supervisor: 'bg-purple-100 text-purple-800',
      medico: 'bg-green-100 text-green-800',
      administrador: 'bg-red-100 text-red-800'
    };
    return colors[rol] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-indigo-700">Gestión de Usuarios del Sistema</h2>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition"
        >
          ➕ Nuevo Usuario
        </button>
      </div>

      {loading && !showModal && (
        <div className="text-center py-8"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg shadow-md">
          <thead>
            <tr className="bg-gray-200 text-gray-700 uppercase text-sm">
              <th className="py-3 px-6 text-left">Nombre Completo</th>
              <th className="py-3 px-6 text-left">Email</th>
              <th className="py-3 px-6 text-left">Rol</th>
              <th className="py-3 px-6 text-left">Estado</th>
              <th className="py-3 px-6 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 text-sm">
            {users.map(user => (
              <tr key={user.id} className="border-b hover:bg-gray-100">
                <td className="py-3 px-6">{user.nombreCompleto || 'N/A'}</td>
                <td className="py-3 px-6">{user.email}</td>
                <td className="py-3 px-6">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getRolColor(user.rol)}`}>
                    {user.rol?.toUpperCase()}
                  </span>
                </td>
                <td className="py-3 px-6">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${user.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {user.isActive !== false ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-3 px-6 flex gap-2">
                  <button onClick={() => handleOpenModal(user)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-xs">✏️ Editar</button>
                  <button onClick={() => handleDelete(user.id, user.email)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs">🗑️ Eliminar</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay usuarios del sistema registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-2xl font-bold text-indigo-700 mb-4">
              {editingUser ? 'Editar Usuario' : 'Nuevo Usuario del Sistema'}
            </h3>
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">Nombre Completo *</label>
                <input type="text" value={formData.nombreCompleto} onChange={e => setFormData({...formData, nombreCompleto: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">Email *</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required disabled={!!editingUser} />
                {editingUser && <p className="text-xs text-gray-500 mt-1">El email no se puede editar desde aquí por seguridad de Auth.</p>}
              </div>

              {!editingUser && (
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-bold mb-2">Contraseña *</label>
                  <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required minLength="6" />
                </div>
              )}

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">Rol *</label>
                <select value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                  {roles.map(rol => <option key={rol} value={rol}>{rol.charAt(0).toUpperCase() + rol.slice(1)}</option>)}
                </select>
              </div>

              <div className="mb-6">
                <label className="flex items-center">
                  <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="mr-2 h-4 w-4" />
                  <span className="text-gray-700">Usuario Activo</span>
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg">Cancelar</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                  {loading ? 'Guardando...' : (editingUser ? 'Actualizar' : 'Crear')}
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

